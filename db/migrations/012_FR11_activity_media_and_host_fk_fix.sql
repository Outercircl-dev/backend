-- Migration: 012_FR11_activity_media_and_host_fk_fix.sql
-- Description: Add activity image URL support and align host_id FK with auth.users(id)

ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS image_url VARCHAR(1024);

COMMENT ON COLUMN public.activities.image_url IS 'Optional public URL for the activity cover image';

DO $$
DECLARE
  fk_record RECORD;
BEGIN
  -- Existing rows in older environments may still store user_profiles.id in host_id.
  -- Remap those values to user_profiles.user_id (auth.users.id) before adding FK.
  UPDATE public.activities a
  SET host_id = up.user_id
  FROM public.user_profiles up
  WHERE a.host_id = up.id;

  -- Staging data is disposable. Remove rows that still cannot satisfy auth.users FK.
  DELETE FROM public.activities a
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = a.host_id
  );

  FOR fk_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.activities'::regclass
      AND contype = 'f'
      AND conname IN ('activities_host_id_fkey', 'fk_activities_host_id')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS %I',
      fk_record.conname
    );
  END LOOP;

  ALTER TABLE public.activities
    ADD CONSTRAINT fk_activities_host_id
    FOREIGN KEY (host_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
