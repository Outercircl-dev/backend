-- Migration: 009_username_reservations.sql
-- Description: Add globally unique usernames on user profiles.

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
