import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import type { MembershipTierKey } from 'src/config/membership-tiers.model';
import { MembershipTiersService } from 'src/config/membership-tiers.service';
import { MembershipSubscriptionsService, SubscriptionStatus } from 'src/membership/membership-subscriptions.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name, { timestamp: true });
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly premiumPriceId: string;
  private readonly successUrl: string;
  private readonly cancelUrl: string;

  constructor(
    private readonly membershipTiersService: MembershipTiersService,
    private readonly subscriptionsService: MembershipSubscriptionsService,
  ) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    const successPath = process.env.STRIPE_SUCCESS_PATH;
    const cancelPath = process.env.STRIPE_CANCEL_PATH;

    if (!secretKey || !webhookSecret || !premiumPriceId || !frontendBaseUrl || !successPath || !cancelPath) {
      throw new Error('Stripe configuration missing for billing module');
    }

    this.webhookSecret = webhookSecret;
    this.premiumPriceId = premiumPriceId;
    this.successUrl = new URL(successPath, frontendBaseUrl).toString();
    this.cancelUrl = new URL(cancelPath, frontendBaseUrl).toString();
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
    });
  }

  async createCheckoutSession(userId: string, email: string, tier?: MembershipTierKey) {
    const resolvedTier = tier ?? this.membershipTiersService.resolveTierKey('PREMIUM') ?? 'PREMIUM';
    if (resolvedTier !== 'PREMIUM') {
      throw new BadRequestException('Only Premium tier upgrades are supported right now.');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: userId,
      customer_email: email,
      success_url: this.successUrl,
      cancel_url: this.cancelUrl,
      line_items: [{ price: this.premiumPriceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          user_id: userId,
          tier: resolvedTier,
        },
      },
      metadata: {
        user_id: userId,
        tier: resolvedTier,
      },
    });

    return { url: session.url };
  }

  verifyWebhookSignature(payload: Buffer, signature?: string | string[]) {
    if (!signature || Array.isArray(signature)) {
      throw new BadRequestException('Missing Stripe signature header');
    }
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }

  async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (session.mode !== 'subscription') {
      return;
    }

    const userId = session.client_reference_id ?? session.metadata?.user_id ?? undefined;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
    const customerId = typeof session.customer === 'string' ? session.customer : null;
    const tier = (session.metadata?.tier ?? 'PREMIUM') as MembershipTierKey;

    await this.subscriptionsService.upsertSubscription({
      userId: userId ?? undefined,
      tier,
      status: 'active',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: this.premiumPriceId,
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const userId = subscription.metadata?.user_id ?? undefined;
    const tier = (subscription.metadata?.tier ?? 'PREMIUM') as MembershipTierKey;
    const status = subscription.status as SubscriptionStatus;

    await this.subscriptionsService.upsertSubscription({
      userId: userId ?? undefined,
      tier,
      status,
      stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price?.id ?? null,
      currentPeriodStart: (subscription as any).current_period_start
        ? new Date((subscription as any).current_period_start * 1000)
        : null,
      currentPeriodEnd: (subscription as any).current_period_end
        ? new Date((subscription as any).current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    });
  }
}
