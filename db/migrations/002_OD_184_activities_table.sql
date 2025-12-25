-- Migration: 002_OD_184_activities_table.sql
-- Description: Create activities table for OuterCircl activities/events
-- Ticket: OD-184
-- Run this in Supabase SQL Editor

-- Create activity_status enum type
CREATE TYPE public.activity_status AS ENUM (
  'draft',
  'published',
  'completed',
  'cancelled'
);

-- Create activities table
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  
  -- Basic Information
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  
  -- Interest Matching (for Interest Score calculation)
  interests JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of interest slugs/IDs
  
  -- Location (for Proximity Score calculation)
  location JSONB NOT NULL, -- { latitude: number, longitude: number, address?: string }
  
  -- Date & Time (for Availability Score calculation)
  activity_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  
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
  CONSTRAINT end_time_after_start_time CHECK (
    end_time IS NULL OR end_time > start_time
  ),
  CONSTRAINT interests_array_not_empty CHECK (
    jsonb_array_length(interests) > 0
  ),
  CONSTRAINT location_has_coordinates CHECK (
    location ? 'latitude' AND location ? 'longitude'
  )
);

-- Create indexes for performance
CREATE INDEX idx_activities_host_id ON public.activities(host_id);
CREATE INDEX idx_activities_created_at ON public.activities(created_at DESC);
CREATE INDEX idx_activities_activity_date ON public.activities(activity_date);
CREATE INDEX idx_activities_status ON public.activities(status);
CREATE INDEX idx_activities_category ON public.activities(category) WHERE category IS NOT NULL;

-- GIN indexes for JSONB columns (for efficient querying)
CREATE INDEX idx_activities_interests_gin ON public.activities USING GIN (interests);
CREATE INDEX idx_activities_location_gin ON public.activities USING GIN (location);

-- Composite index for common queries (status + date for feed)
CREATE INDEX idx_activities_status_date ON public.activities(status, activity_date DESC) 
  WHERE status = 'published';

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_activities_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_activities_timestamp
BEFORE UPDATE ON public.activities
FOR EACH ROW
EXECUTE FUNCTION update_activities_timestamp();

-- Add comment to table
COMMENT ON TABLE public.activities IS 'Activities/events that users can join. Used for personalized datafeed algorithm.';
COMMENT ON COLUMN public.activities.interests IS 'Array of interest slugs/IDs for matching with user interests';
COMMENT ON COLUMN public.activities.location IS 'JSON object with latitude, longitude, and optional address for proximity calculations';
COMMENT ON COLUMN public.activities.activity_date IS 'Date when the activity occurs';
COMMENT ON COLUMN public.activities.status IS 'Activity status: draft (not visible), published (visible in feed), completed, cancelled';

