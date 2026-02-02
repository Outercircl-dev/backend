import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { BillingService } from './billing.service';
import { MembershipSubscriptionsService } from 'src/membership/membership-subscriptions.service';

interface CheckoutRequest {
  tier?: string;
}

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name, { timestamp: true });

  constructor(
    private readonly billingService: BillingService,
    private readonly membershipSubscriptionsService: MembershipSubscriptionsService,
  ) {}

  @UseGuards(SupabaseAuthGuard)
  @Post('checkout')
  async checkout(@Req() req: AuthenticatedRequest, @Body() body: CheckoutRequest) {
    const user = req.user ?? {};
    if (!user.supabaseUserId || !user.email) {
      throw new BadRequestException('Authenticated user missing required identifiers');
    }

    return this.billingService.createCheckoutSession(
      user.supabaseUserId,
      user.email,
      body?.tier as any,
    );
  }

  @Post('webhook')
  async webhook(@Req() req: Request, @Res() res: Response) {
    try {
      const signature = req.headers['stripe-signature'];
      const payload = req.body as Buffer;
      const event = this.billingService.verifyWebhookSignature(payload, signature);
      await this.billingService.handleWebhook(event);
      res.status(200).json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook handling failed';
      this.logger.error(`Stripe webhook error: ${message}`);
      res.status(400).json({ error: message });
    }
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('status')
  async status(@Req() req: AuthenticatedRequest) {
    const user = req.user ?? {};
    if (!user.supabaseUserId) {
      throw new BadRequestException('Authenticated user missing required identifiers');
    }

    const [subscription, tier] = await Promise.all([
      this.membershipSubscriptionsService.getSubscriptionByUserId(user.supabaseUserId),
      this.membershipSubscriptionsService.resolveTierForUserId(user.supabaseUserId),
    ]);

    return { tier, subscription };
  }
}
