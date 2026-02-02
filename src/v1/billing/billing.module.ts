import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { MembershipModule } from 'src/membership/membership.module';
import { MembershipTiersModule } from 'src/config/membership-tiers.module';

@Module({
  imports: [MembershipModule, MembershipTiersModule],
  providers: [BillingService],
  controllers: [BillingController],
})
export class BillingModule {}
