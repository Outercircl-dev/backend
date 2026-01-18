-- Migration: 005_FR5_activity_messaging.sql
-- Description: Add activity group messaging, announcements, reports, and realtime support for FR5
-- Run this after 004_FR4_activity_hosting.sql

DO $$ BEGIN
  CREATE TYPE public.activity_message_type AS ENUM (
    'user',
    'system',
    'announcement',
    'survey'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.activity_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  author_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  message_type activity_message_type NOT NULL DEFAULT 'user',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_messages_activity_id
  ON public.activity_messages(activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_messages_created_at
  ON public.activity_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_messages_pinned
  ON public.activity_messages(activity_id, is_pinned);

CREATE TABLE IF NOT EXISTS public.activity_message_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.activity_messages(id) ON DELETE CASCADE,
  reporter_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  reason VARCHAR(120) NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_activity_message_reporter UNIQUE (message_id, reporter_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_message_reports_message_id
  ON public.activity_message_reports(message_id);

CREATE OR REPLACE FUNCTION update_activity_messages_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_activity_messages_timestamp ON public.activity_messages;
CREATE TRIGGER trg_update_activity_messages_timestamp
BEFORE UPDATE ON public.activity_messages
FOR EACH ROW
EXECUTE FUNCTION update_activity_messages_timestamp();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_messages;
EXCEPTION
  WHEN undefined_object THEN null;
  WHEN duplicate_object THEN null;
END $$;

