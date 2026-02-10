-- Migration: 008_membership_tiers_config.sql
-- Description: Membership tier definitions (rules, metadata, logic) loaded by backend at startup.
-- Seed data mirrors the previous membership-tiers.json content.

CREATE TABLE IF NOT EXISTS public.membership_tiers_config (
  id SERIAL PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  last_updated VARCHAR(20) NOT NULL,
  default_tier_key VARCHAR(50) NOT NULL,
  tiers JSONB NOT NULL,
  logic_differences JSONB NOT NULL
);

-- Single row: id = 1. Seed is idempotent.
INSERT INTO public.membership_tiers_config (
  id,
  version,
  last_updated,
  default_tier_key,
  tiers,
  logic_differences
) VALUES (
  1,
  '1.0',
  '2026-01-29',
  'FREEMIUM',
  '{
    "FREEMIUM": {
      "metadata": { "tierClass": "freemium", "displayName": "Freemium" },
      "hosting": {
        "maxParticipantsPerActivity": 4,
        "maxHostsPerMonth": 2,
        "enforceExactMaxParticipants": true
      },
      "groups": { "enabled": false, "maxMembers": 15 },
      "ads": { "showsAds": true },
      "verification": { "requiresVerifiedHostForHosting": true },
      "messaging": { "groupChatEnabled": true, "automatedMessagesEnabled": true }
    },
    "PREMIUM": {
      "metadata": { "tierClass": "premium", "displayName": "Premium" },
      "hosting": {
        "maxParticipantsPerActivity": null,
        "maxHostsPerMonth": null,
        "enforceExactMaxParticipants": false
      },
      "groups": { "enabled": true, "maxMembers": 15, "notes": "No tier difference defined yet." },
      "ads": { "showsAds": false },
      "verification": { "requiresVerifiedHostForHosting": true },
      "messaging": {
        "groupChatEnabled": true,
        "automatedMessagesEnabled": true,
        "notes": "No tier difference defined yet."
      }
    }
  }'::jsonb,
  '[
    "Freemium hosts must set max participants to 4; premium has no enforced cap.",
    "Freemium hosts are limited to 2 hosted activities per month; premium has no monthly cap.",
    "Freemium users see ads; premium users do not."
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
