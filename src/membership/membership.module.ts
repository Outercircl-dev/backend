import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MembershipTiersModule } from 'src/config/membership-tiers.module';
import { MembershipSubscriptionsService } from './membership-subscriptions.service';
import { SupabaseAdminService } from './supabase-admin.service';

@Module({
  imports: [PrismaModule, MembershipTiersModule],
  providers: [MembershipSubscriptionsService, SupabaseAdminService],
  exports: [MembershipSubscriptionsService, SupabaseAdminService],
})
export class MembershipModule {}
