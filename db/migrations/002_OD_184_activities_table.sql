-- Migration: 002_OD_184_activities_table.sql
-- Description: Create activities table for OuterCircl activities/events
-- Ticket: OD-184
-- Run this in Supabase SQL Editor

-- Create activity_status enum type (if it doesn't exist)
DO $$ BEGIN
  CREATE TYPE public.activity_status AS ENUM (
    'draft',
    'published',
    'completed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create activities table
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Reference user_profiles instead of auth.users for consistency with the rest of the schema
  -- user_profiles.user_id already references auth.users(id)
  host_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT,
  
  -- Basic Information
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  
  -- Interest Matching (for Interest Score calculation)
  -- Note: Interest slugs are validated at the application/service layer before insert/update
  -- to ensure they exist in the public.interests table. This validation cannot be enforced
  -- via foreign key constraints since interests is a JSONB array.
  -- Note: Empty arrays are allowed initially; interests can be added later when publishing.
  interests JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of interest slugs/IDs
  
  -- Location (for Proximity Score calculation)
  location JSONB NOT NULL, -- { latitude: number, longitude: number, address?: string }
  
  -- Date & Time (for Availability Score calculation)
  -- Note: timezone_name stores IANA timezone identifier (e.g., 'America/Los_Angeles')
  -- to handle multi-location events correctly. Application layer should compose
  -- TIMESTAMPTZ from date+time+timezone when needed.
  activity_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  timezone_name VARCHAR(100), -- IANA timezone identifier (e.g., 'America/Los_Angeles', 'Europe/London')
  
  -- Participants
  max_participants INT NOT NULL CHECK (max_participants > 0),
  current_participants INT NOT NULL DEFAULT 0 CHECK (current_participants >= 0),
  
  -- Status & Visibility
  status activity_status NOT NULL DEFAULT 'draft',
  is_public BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT current_participants_not_exceed_max CHECK (current_participants <= max_participants),
  -- Note: Overnight activities (spanning midnight) are not validated at DB level.
  -- Application layer should validate end_time > start_time for same-day activities,
  -- or use end_date for multi-day/overnight activities.
  CONSTRAINT location_has_coordinates CHECK (
    location ? 'latitude' AND location ? 'longitude' AND
    (location->>'latitude')::numeric BETWEEN -90 AND 90 AND
    (location->>'longitude')::numeric BETWEEN -180 AND 180
  )
);

-- Create indexes for performance (idempotent - will skip if already exists)
CREATE INDEX IF NOT EXISTS idx_activities_host_id ON public.activities(host_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON public.activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_activity_date ON public.activities(activity_date);
CREATE INDEX IF NOT EXISTS idx_activities_status ON public.activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_category ON public.activities(category) WHERE category IS NOT NULL;

-- GIN indexes for JSONB columns (for efficient querying)
CREATE INDEX IF NOT EXISTS idx_activities_interests_gin ON public.activities USING GIN (interests);
CREATE INDEX IF NOT EXISTS idx_activities_location_gin ON public.activities USING GIN (location);

-- Composite index for common queries (status + date for feed)
CREATE INDEX IF NOT EXISTS idx_activities_status_date ON public.activities(status, activity_date DESC) 
  WHERE status = 'published';

-- Additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_activities_is_public ON public.activities(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_activities_host_status ON public.activities(host_id, status);

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_activities_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (idempotent - drops and recreates if exists)
DROP TRIGGER IF EXISTS update_activities_timestamp ON public.activities;
CREATE TRIGGER update_activities_timestamp
BEFORE UPDATE ON public.activities
FOR EACH ROW
EXECUTE FUNCTION update_activities_timestamp();

-- Add comment to table
COMMENT ON TABLE public.activities IS 'Activities/events that users can join. Used for personalized datafeed algorithm.';
COMMENT ON COLUMN public.activities.interests IS 'Array of interest slugs/IDs for matching with user interests';
COMMENT ON COLUMN public.activities.location IS 'JSON object with latitude, longitude, and optional address for proximity calculations';
COMMENT ON COLUMN public.activities.activity_date IS 'Date when the activity occurs';
COMMENT ON COLUMN public.activities.timezone_name IS 'IANA timezone identifier (e.g., America/Los_Angeles) for handling multi-location events';
COMMENT ON COLUMN public.activities.status IS 'Activity status: draft (not visible), published (visible in feed), completed, cancelled';

