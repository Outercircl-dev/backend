-- Seed data for user_profiles and activities (dummy, rerunnable)
-- Run with: psql "$DATABASE_URL" -f db/seeds/activities_seed.sql
-- IMPORTANT: set these to existing auth.users IDs in your project before running.
-- Example: \set alice_user_id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
-- Defaults below use two valid IDs from your project; change if needed.
\set alice_user_id  'db9813e8-f457-487e-83e7-b37960f0c807'
\set bob_user_id    'adb85bfc-d015-4c77-a728-bbfba432ead0'
\set alice_profile_id '6d7b8c3a-4d1f-4d82-90e1-2c2f6f8b1a10'
\set bob_profile_id   '72c4f0d3-7c61-4d0e-9d21-4f8e2f6a3c12'

-- Ensure required enums exist (idempotent)
DO $$ BEGIN
  CREATE TYPE public.gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_status AS ENUM ('draft', 'published', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Insert user profiles (hosts)
INSERT INTO public.user_profiles (
  id,
  user_id,
  full_name,
  date_of_birth,
  gender,
  profile_picture_url,
  bio,
  interests,
  hobbies,
  availability,
  distance_radius_km,
  accepted_tos,
  accepted_guidelines,
  accepted_tos_at,
  accepted_guidelines_at,
  profile_completed,
  confirmed_age,
  confirmed_platonic
) VALUES
  (
    :'alice_profile_id'::uuid,
    :'alice_user_id'::uuid,
    'Alice Host',
    '1990-05-15',
    'female',
    NULL,
    'Outdoor enthusiast and event organizer',
    '["hiking","outdoors","coffee"]'::jsonb,
    ARRAY['hiking','photography'],
    '{"monday":true,"tuesday":true,"wednesday":false,"thursday":true,"friday":true,"saturday":true,"sunday":false}'::jsonb,
    25,
    TRUE,
    TRUE,
    NOW(),
    NOW(),
    TRUE,
    TRUE,
    TRUE
  ),
  (
    :'bob_profile_id'::uuid,
    :'bob_user_id'::uuid,
    'Bob Host',
    '1987-11-02',
    'male',
    NULL,
    'Music lover hosting local jams',
    '["music","food","community"]'::jsonb,
    ARRAY['guitar','cooking'],
    '{"friday":true,"saturday":true,"sunday":true}'::jsonb,
    15,
    TRUE,
    TRUE,
    NOW(),
    NOW(),
    TRUE,
    TRUE,
    TRUE
  )
ON CONFLICT (user_id) DO NOTHING;

-- Insert activities referencing the hosts above
INSERT INTO public.activities (
  id,
  host_id,
  title,
  description,
  category,
  interests,
  location,
  activity_date,
  start_time,
  end_time,
  max_participants,
  current_participants,
  status,
  is_public
) VALUES
  (
    'b1d5a1f0-3c24-4d8c-9c6e-2b9c6f1d5a20',
    :'alice_profile_id'::uuid,
    'Morning Hike',
    'Casual 5k hike with coffee after.',
    'outdoors',
    '["hiking","wellness"]'::jsonb,
    '{"latitude":37.7749,"longitude":-122.4194,"address":"Twin Peaks, SF"}'::jsonb,
    '2025-02-15',
    '08:30'::time,
    '11:30'::time,
    12,
    3,
    'published',
    TRUE
  ),
  (
    'c3e8d2f1-5b6a-4c9f-8d7e-1f2a3b4c5d21',
    :'bob_profile_id'::uuid,
    'Evening Jam Session',
    'Open mic and jam for all levels.',
    'music',
    '["music","social"]'::jsonb,
    '{"latitude":34.0522,"longitude":-118.2437,"address":"Downtown LA"}'::jsonb,
    '2025-02-22',
    '19:00'::time,
    '22:00'::time,
    20,
    5,
    'published',
    TRUE
  )
ON CONFLICT (id) DO NOTHING;

