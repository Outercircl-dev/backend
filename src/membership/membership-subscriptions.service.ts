import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MembershipTiersService } from 'src/config/membership-tiers.service';
import type { MembershipTierKey } from 'src/config/membership-tiers.model';
import { SupabaseAdminService } from './supabase-admin.service';

const ACTIVE_STATUSES = new Set<SubscriptionStatus>(['active', 'trialing']);

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

interface SubscriptionUpsertInput {
  userId?: string;
  tier: MembershipTierKey;
  status: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

@Injectable()
export class MembershipSubscriptionsService {
  private readonly logger = new Logger(MembershipSubscriptionsService.name, { timestamp: true });

  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipTiersService: MembershipTiersService,
    private readonly supabaseAdminService: SupabaseAdminService,
  ) {}

  async getSubscriptionByUserId(userId: string) {
    return this.prisma.membershipSubscription.findUnique({
      where: { user_id: userId },
    });
  }

  async getSubscriptionByStripeId(stripeCustomerId?: string | null, stripeSubscriptionId?: string | null) {
    if (!stripeCustomerId && !stripeSubscriptionId) {
      return null;
    }
    return this.prisma.membershipSubscription.findFirst({
      where: {
        OR: [
          stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : undefined,
          stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : undefined,
        ].filter(Boolean) as any,
      },
    });
  }

  async resolveTierForUserId(userId: string): Promise<MembershipTierKey> {
    const defaultTier = this.membershipTiersService.getDefaultTier();
    const subscription = await this.getSubscriptionByUserId(userId);
    if (!subscription) {
      return defaultTier;
    }

    if (!ACTIVE_STATUSES.has(subscription.status as SubscriptionStatus)) {
      return defaultTier;
    }

    return this.membershipTiersService.resolveTierKey(subscription.tier) ?? defaultTier;
  }

  async syncTierToSupabase(userId: string, tier: MembershipTierKey): Promise<void> {
    await this.supabaseAdminService.updateSubscriptionTier(userId, tier);
  }

  async upsertSubscription(input: SubscriptionUpsertInput) {
    const payload = {
      tier: input.tier,
      status: input.status as any,
      stripe_customer_id: input.stripeCustomerId ?? null,
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      stripe_price_id: input.stripePriceId ?? null,
      current_period_start: input.currentPeriodStart ?? null,
      current_period_end: input.currentPeriodEnd ?? null,
      cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    };

    const tierForMetadata = ACTIVE_STATUSES.has(input.status)
      ? input.tier
      : this.membershipTiersService.getDefaultTier();

    if (input.userId) {
      const record = await this.prisma.membershipSubscription.upsert({
        where: { user_id: input.userId },
        update: payload,
        create: {
          user_id: input.userId,
          ...payload,
        },
      });
      await this.syncTierToSupabase(input.userId, tierForMetadata);
      return record;
    }

    const existing = await this.getSubscriptionByStripeId(
      input.stripeCustomerId ?? null,
      input.stripeSubscriptionId ?? null,
    );

    if (!existing) {
      this.logger.warn('Subscription upsert skipped: missing userId and no match by Stripe IDs.');
      return null;
    }

    const record = await this.prisma.membershipSubscription.update({
      where: { id: existing.id },
      data: payload,
    });

    await this.syncTierToSupabase(existing.user_id, tierForMetadata);
    return record;
  }
}
