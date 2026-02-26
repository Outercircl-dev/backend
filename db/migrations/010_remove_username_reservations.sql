-- Migration: 010_remove_username_reservations.sql
-- Description: Remove permanent username reservation table so usernames are reusable after profile/account deletion.

DROP TABLE IF EXISTS public.usernames;
