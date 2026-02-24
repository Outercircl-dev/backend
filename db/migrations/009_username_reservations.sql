-- Migration: 009_username_reservations.sql
-- Description: Add globally unique, non-reusable usernames.

-- Permanent username reservation ledger.
-- Rows in this table are never deleted automatically, so usernames remain reserved forever.
CREATE TABLE IF NOT EXISTS public.usernames (
  username VARCHAR(15) PRIMARY KEY,
  claimed_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT usernames_format CHECK (username ~ '^[a-z0-9_]{3,15}$')
);

CREATE INDEX IF NOT EXISTS idx_usernames_claimed_by_user_id
  ON public.usernames(claimed_by_user_id);

-- Add current username to profiles for direct lookup/display.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS username VARCHAR(15);

-- Keep active profile usernames unique while allowing NULL for legacy rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_user_profiles_username'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT uq_user_profiles_username UNIQUE (username);
  END IF;
END $$;

-- Enforce Twitter-style format on profile username when present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_username_format'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_username_format
      CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,15}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_username
  ON public.user_profiles(username);
