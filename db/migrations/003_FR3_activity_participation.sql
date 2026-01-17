-- Migration: 003_FR3_activity_participation.sql
-- Description: Add participation + invite tables to support FR3
-- Run this in Supabase SQL Editor after 002_OD_184_activities_table.sql

DO $$ BEGIN
  CREATE TYPE public.participation_status AS ENUM (
    'pending',
    'confirmed',
    'waitlisted',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM (
    'pending',
    'redeemed',
    'revoked',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.activity_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  status participation_status NOT NULL DEFAULT 'pending',
  waitlist_position INT,
  approval_message TEXT,
  invite_code VARCHAR(32),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_activity_participants_activity_profile UNIQUE (activity_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_participants_status
  ON public.activity_participants(activity_id, status);

CREATE INDEX IF NOT EXISTS idx_activity_participants_profile_id
  ON public.activity_participants(profile_id);

CREATE OR REPLACE FUNCTION update_activity_participants_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_activity_participants_timestamp ON public.activity_participants;
CREATE TRIGGER trg_update_activity_participants_timestamp
BEFORE UPDATE ON public.activity_participants
FOR EACH ROW
EXECUTE FUNCTION update_activity_participants_timestamp();

CREATE TABLE IF NOT EXISTS public.activity_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  issuer_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  invitee_profile_id UUID REFERENCES public.user_profiles(id),
  invitee_email VARCHAR(255),
  code VARCHAR(32) NOT NULL UNIQUE,
  status invite_status NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMP WITH TIME ZONE,
  redeemed_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_invites_activity_id
  ON public.activity_invites(activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_invites_issuer_id
  ON public.activity_invites(issuer_profile_id);

CREATE INDEX IF NOT EXISTS idx_activity_invites_invitee_id
  ON public.activity_invites(invitee_profile_id);

CREATE OR REPLACE FUNCTION update_activity_invites_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_activity_invites_timestamp ON public.activity_invites;
CREATE TRIGGER trg_update_activity_invites_timestamp
BEFORE UPDATE ON public.activity_invites
FOR EACH ROW
EXECUTE FUNCTION update_activity_invites_timestamp();

