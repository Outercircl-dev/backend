-- CreateEnum
CREATE TYPE "gender_type" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "activity_status" AS ENUM ('draft', 'published', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "activity_message_type" AS ENUM ('user', 'system', 'announcement', 'survey');

-- CreateEnum
CREATE TYPE "participation_status" AS ENUM ('pending', 'confirmed', 'waitlisted', 'cancelled');

-- CreateEnum
CREATE TYPE "invite_status" AS ENUM ('pending', 'redeemed', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('recommendation_match', 'upcoming_activity', 'participant_joined', 'participant_cancelled', 'activity_time_changed', 'activity_location_changed', 'host_update', 'safety_alert');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'email', 'browser');

-- CreateEnum
CREATE TYPE "notification_delivery_status" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "recurrence_frequency" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "group_member_role" AS ENUM ('owner', 'member');

-- CreateTable
CREATE TABLE "interests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "icon" VARCHAR(10),
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" "gender_type" NOT NULL,
    "profile_picture_url" VARCHAR(512),
    "bio" TEXT,
    "interests" JSONB NOT NULL DEFAULT '[]',
    "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availability" JSONB DEFAULT '{}',
    "distance_radius_km" INTEGER DEFAULT 25,
    "accepted_tos" BOOLEAN NOT NULL DEFAULT false,
    "accepted_guidelines" BOOLEAN NOT NULL DEFAULT false,
    "accepted_tos_at" TIMESTAMPTZ(6),
    "accepted_guidelines_at" TIMESTAMPTZ(6),
    "profile_completed" BOOLEAN DEFAULT false,
    "is_verified" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "confirmed_age" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_platonic" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(15),

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "host_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50),
    "interests" JSONB NOT NULL DEFAULT '[]',
    "location" JSONB NOT NULL,
    "activity_date" DATE NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6),
    "max_participants" INTEGER NOT NULL,
    "current_participants" INTEGER NOT NULL DEFAULT 0,
    "status" "activity_status" NOT NULL DEFAULT 'draft',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "group_id" UUID,
    "series_id" UUID,
    "timezone_name" VARCHAR(100),
    "image_url" VARCHAR(1024),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tier" VARCHAR(20) NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'active',
    "stripe_customer_id" VARCHAR(120),
    "stripe_subscription_id" VARCHAR(120),
    "stripe_price_id" VARCHAR(120),
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tiers_config" (
    "id" SERIAL NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "last_updated" VARCHAR(20) NOT NULL,
    "default_tier_key" VARCHAR(50) NOT NULL,
    "tiers" JSONB NOT NULL,
    "logic_differences" JSONB NOT NULL,

    CONSTRAINT "membership_tiers_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_profile_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "max_members" INTEGER NOT NULL DEFAULT 15,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "group_member_role" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_profile_id" UUID NOT NULL,
    "frequency" "recurrence_frequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "ends_on" DATE,
    "occurrences" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "status" "participation_status" NOT NULL DEFAULT 'pending',
    "waitlist_position" INTEGER,
    "approval_message" TEXT,
    "invite_code" VARCHAR(32),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "joined_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "issuer_profile_id" UUID NOT NULL,
    "invitee_profile_id" UUID,
    "invitee_email" VARCHAR(255),
    "code" VARCHAR(32) NOT NULL,
    "status" "invite_status" NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMPTZ(6),
    "redeemed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "author_profile_id" UUID,
    "content" TEXT NOT NULL,
    "message_type" "activity_message_type" NOT NULL DEFAULT 'user',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_message_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "reporter_profile_id" UUID NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_message_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "author_profile_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "consent_to_analysis" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_participant_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activity_id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "reviewer_profile_id" UUID NOT NULL,
    "target_profile_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "flagged_for_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_participant_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_user_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "activity_id" UUID,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB DEFAULT '{}',
    "deliver_in_app" BOOLEAN NOT NULL DEFAULT true,
    "deliver_email" BOOLEAN NOT NULL DEFAULT false,
    "deliver_browser" BOOLEAN NOT NULL DEFAULT false,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "recommended_activities" BOOLEAN NOT NULL DEFAULT true,
    "upcoming_activity_reminders" BOOLEAN NOT NULL DEFAULT true,
    "host_join_cancel_updates" BOOLEAN NOT NULL DEFAULT true,
    "time_location_change_alerts" BOOLEAN NOT NULL DEFAULT true,
    "safety_alerts" BOOLEAN NOT NULL DEFAULT true,
    "channel_in_app" BOOLEAN NOT NULL DEFAULT true,
    "channel_email" BOOLEAN NOT NULL DEFAULT true,
    "channel_browser" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "status" "notification_delivery_status" NOT NULL DEFAULT 'pending',
    "provider_message_id" VARCHAR(255),
    "error_message" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interests_slug_key" ON "interests"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_profiles_username" ON "user_profiles"("username");

-- CreateIndex
CREATE INDEX "idx_user_profiles_created_at" ON "user_profiles"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_profiles_interests" ON "user_profiles" USING GIN ("interests");

-- CreateIndex
CREATE INDEX "idx_user_profiles_user_id" ON "user_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_profiles_username" ON "user_profiles"("username");

-- CreateIndex
CREATE INDEX "idx_activities_host_id" ON "activities"("host_id");

-- CreateIndex
CREATE INDEX "idx_activities_created_at" ON "activities"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_activities_activity_date" ON "activities"("activity_date");

-- CreateIndex
CREATE INDEX "idx_activities_status" ON "activities"("status");

-- CreateIndex
CREATE INDEX "idx_activities_interests_gin" ON "activities" USING GIN ("interests");

-- CreateIndex
CREATE INDEX "idx_activities_location_gin" ON "activities" USING GIN ("location");

-- CreateIndex
CREATE INDEX "idx_activities_host_status" ON "activities"("host_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_subscriptions_user_id_key" ON "membership_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_membership_subscriptions_user_id" ON "membership_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_membership_subscriptions_status" ON "membership_subscriptions"("status");

-- CreateIndex
CREATE INDEX "idx_activity_groups_owner_id" ON "activity_groups"("owner_profile_id");

-- CreateIndex
CREATE INDEX "idx_activity_group_members_profile" ON "activity_group_members"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_activity_group_membership" ON "activity_group_members"("group_id", "profile_id");

-- CreateIndex
CREATE INDEX "idx_activity_series_owner_id" ON "activity_series"("owner_profile_id");

-- CreateIndex
CREATE INDEX "idx_activity_participants_status" ON "activity_participants"("activity_id", "status");

-- CreateIndex
CREATE INDEX "idx_activity_participants_profile_id" ON "activity_participants"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_activity_participants_activity_profile" ON "activity_participants"("activity_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_invites_code_key" ON "activity_invites"("code");

-- CreateIndex
CREATE INDEX "idx_activity_invites_activity_id" ON "activity_invites"("activity_id");

-- CreateIndex
CREATE INDEX "idx_activity_invites_issuer_id" ON "activity_invites"("issuer_profile_id");

-- CreateIndex
CREATE INDEX "idx_activity_invites_invitee_id" ON "activity_invites"("invitee_profile_id");

-- CreateIndex
CREATE INDEX "idx_activity_messages_activity_id" ON "activity_messages"("activity_id");

-- CreateIndex
CREATE INDEX "idx_activity_messages_created_at" ON "activity_messages"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_activity_messages_pinned" ON "activity_messages"("activity_id", "is_pinned");

-- CreateIndex
CREATE INDEX "idx_activity_message_reports_message_id" ON "activity_message_reports"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_activity_message_reporter" ON "activity_message_reports"("message_id", "reporter_profile_id");

-- CreateIndex
CREATE INDEX "idx_activity_feedback_activity_id" ON "activity_feedback"("activity_id");

-- CreateIndex
CREATE INDEX "idx_activity_feedback_author" ON "activity_feedback"("author_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_activity_feedback_author" ON "activity_feedback"("activity_id", "author_profile_id");

-- CreateIndex
CREATE INDEX "idx_activity_participant_ratings_activity" ON "activity_participant_ratings"("activity_id");

-- CreateIndex
CREATE INDEX "idx_activity_participant_ratings_target" ON "activity_participant_ratings"("target_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_activity_participant_rating" ON "activity_participant_ratings"("activity_id", "reviewer_profile_id", "target_profile_id");

-- CreateIndex
CREATE INDEX "idx_notifications_recipient_unread" ON "notifications"("recipient_user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notifications_activity_id" ON "notifications"("activity_id");

-- CreateIndex
CREATE INDEX "idx_notification_deliveries_status" ON "notification_deliveries"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_notification_delivery_channel" ON "notification_deliveries"("notification_id", "channel");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "fk_activities_group_id" FOREIGN KEY ("group_id") REFERENCES "activity_groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "fk_activities_series_id" FOREIGN KEY ("series_id") REFERENCES "activity_series"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_groups" ADD CONSTRAINT "activity_groups_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_group_members" ADD CONSTRAINT "activity_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "activity_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_group_members" ADD CONSTRAINT "activity_group_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_series" ADD CONSTRAINT "activity_series_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_invites" ADD CONSTRAINT "activity_invites_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_invites" ADD CONSTRAINT "activity_invites_invitee_profile_id_fkey" FOREIGN KEY ("invitee_profile_id") REFERENCES "user_profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_invites" ADD CONSTRAINT "activity_invites_issuer_profile_id_fkey" FOREIGN KEY ("issuer_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_messages" ADD CONSTRAINT "activity_messages_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_messages" ADD CONSTRAINT "activity_messages_author_profile_id_fkey" FOREIGN KEY ("author_profile_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_message_reports" ADD CONSTRAINT "activity_message_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "activity_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_message_reports" ADD CONSTRAINT "activity_message_reports_reporter_profile_id_fkey" FOREIGN KEY ("reporter_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_feedback" ADD CONSTRAINT "activity_feedback_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_feedback" ADD CONSTRAINT "activity_feedback_author_profile_id_fkey" FOREIGN KEY ("author_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_participant_ratings" ADD CONSTRAINT "activity_participant_ratings_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_participant_ratings" ADD CONSTRAINT "activity_participant_ratings_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "activity_feedback"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_participant_ratings" ADD CONSTRAINT "activity_participant_ratings_reviewer_profile_id_fkey" FOREIGN KEY ("reviewer_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_participant_ratings" ADD CONSTRAINT "activity_participant_ratings_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

