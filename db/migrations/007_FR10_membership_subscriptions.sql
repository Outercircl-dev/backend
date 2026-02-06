-- Migration: 007_FR10_membership_subscriptions.sql
-- Description: Add membership subscriptions for tiers and billing sync

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'active',
    'trialing',
    'past_due',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'unpaid'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.membership_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  tier VARCHAR(20) NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'active',
  stripe_customer_id VARCHAR(120),
  stripe_subscription_id VARCHAR(120),
  stripe_price_id VARCHAR(120),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_subscriptions_user_id
  ON public.membership_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_membership_subscriptions_status
  ON public.membership_subscriptions(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_subscriptions_stripe_customer_id
  ON public.membership_subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_subscriptions_stripe_subscription_id
  ON public.membership_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.membership_subscriptions
    ADD CONSTRAINT fk_membership_subscriptions_user_id FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION update_membership_subscriptions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_membership_subscriptions_timestamp ON public.membership_subscriptions;
CREATE TRIGGER trg_update_membership_subscriptions_timestamp
BEFORE UPDATE ON public.membership_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_membership_subscriptions_timestamp();
