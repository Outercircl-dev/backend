-- Migration: 011_FR9_notifications.sql
-- Description: Add persistent notifications, user preferences, and delivery tracking for FR9
-- Run this after 010_remove_username_reservations.sql

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'recommendation_match',
    'upcoming_activity',
    'participant_joined',
    'participant_cancelled',
    'activity_time_changed',
    'activity_location_changed',
    'host_update',
    'safety_alert'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_channel AS ENUM (
    'in_app',
    'email',
    'browser'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_delivery_status AS ENUM (
    'pending',
    'sent',
    'failed',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  deliver_in_app BOOLEAN NOT NULL DEFAULT TRUE,
  deliver_email BOOLEAN NOT NULL DEFAULT FALSE,
  deliver_browser BOOLEAN NOT NULL DEFAULT FALSE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications(recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_activity_id
  ON public.notifications(activity_id);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recommended_activities BOOLEAN NOT NULL DEFAULT TRUE,
  upcoming_activity_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  host_join_cancel_updates BOOLEAN NOT NULL DEFAULT TRUE,
  time_location_change_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  safety_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  channel_in_app BOOLEAN NOT NULL DEFAULT TRUE,
  channel_email BOOLEAN NOT NULL DEFAULT TRUE,
  channel_browser BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_notification_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_notification_preferences_timestamp ON public.notification_preferences;
CREATE TRIGGER trg_update_notification_preferences_timestamp
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_notification_preferences_timestamp();

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  status notification_delivery_status NOT NULL DEFAULT 'pending',
  provider_message_id VARCHAR(255),
  error_message TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_notification_delivery_channel UNIQUE (notification_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
  ON public.notification_deliveries(status, created_at DESC);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN undefined_object THEN null;
  WHEN duplicate_object THEN null;
END $$;
