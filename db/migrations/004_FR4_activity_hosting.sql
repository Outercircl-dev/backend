-- Migration: 004_FR4_activity_hosting.sql
-- Description: Add activity groups and recurring series for FR4 hosting
-- Run this after 003_FR3_activity_participation.sql

DO $$ BEGIN
  CREATE TYPE public.recurrence_frequency AS ENUM (
    'daily',
    'weekly',
    'monthly'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.group_member_role AS ENUM (
    'owner',
    'member'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS series_id UUID;

CREATE TABLE IF NOT EXISTS public.activity_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  max_members INT NOT NULL DEFAULT 15,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_groups_owner_id
  ON public.activity_groups(owner_profile_id);

CREATE TABLE IF NOT EXISTS public.activity_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.activity_groups(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role group_member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_activity_group_membership UNIQUE (group_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_group_members_profile
  ON public.activity_group_members(profile_id);

CREATE TABLE IF NOT EXISTS public.activity_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  frequency recurrence_frequency NOT NULL,
  interval INT NOT NULL DEFAULT 1,
  ends_on DATE,
  occurrences INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_series_owner_id
  ON public.activity_series(owner_profile_id);

DO $$ BEGIN
  ALTER TABLE public.activities
    ADD CONSTRAINT fk_activities_group_id FOREIGN KEY (group_id)
      REFERENCES public.activity_groups(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.activities
    ADD CONSTRAINT fk_activities_series_id FOREIGN KEY (series_id)
      REFERENCES public.activity_series(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION update_activity_groups_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_activity_groups_timestamp ON public.activity_groups;
CREATE TRIGGER trg_update_activity_groups_timestamp
BEFORE UPDATE ON public.activity_groups
FOR EACH ROW
EXECUTE FUNCTION update_activity_groups_timestamp();

CREATE OR REPLACE FUNCTION update_activity_series_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_activity_series_timestamp ON public.activity_series;
CREATE TRIGGER trg_update_activity_series_timestamp
BEFORE UPDATE ON public.activity_series
FOR EACH ROW
EXECUTE FUNCTION update_activity_series_timestamp();

