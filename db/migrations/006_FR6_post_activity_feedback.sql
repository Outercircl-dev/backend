-- Migration: 006_FR6_post_activity_feedback.sql
-- Description: Add post-activity feedback and participant rating tables for FR6
-- Run this after 005_FR5_activity_messaging.sql

CREATE TABLE IF NOT EXISTS public.activity_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  author_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  consent_to_analysis BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_activity_feedback_author UNIQUE (activity_id, author_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_feedback_activity_id
  ON public.activity_feedback(activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_feedback_author
  ON public.activity_feedback(author_profile_id);

CREATE TABLE IF NOT EXISTS public.activity_participant_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  feedback_id UUID NOT NULL REFERENCES public.activity_feedback(id) ON DELETE CASCADE,
  reviewer_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  target_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_activity_participant_rating UNIQUE (activity_id, reviewer_profile_id, target_profile_id),
  CONSTRAINT chk_activity_participant_rating_self CHECK (reviewer_profile_id <> target_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_participant_ratings_activity
  ON public.activity_participant_ratings(activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_participant_ratings_target
  ON public.activity_participant_ratings(target_profile_id);

CREATE OR REPLACE FUNCTION update_activity_feedback_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_activity_feedback_timestamp ON public.activity_feedback;
CREATE TRIGGER trg_update_activity_feedback_timestamp
BEFORE UPDATE ON public.activity_feedback
FOR EACH ROW
EXECUTE FUNCTION update_activity_feedback_timestamp();

