import { Global, Module } from '@nestjs/common';
import { MembershipTiersService } from './membership-tiers.service';

@Global()
@Module({
  providers: [MembershipTiersService],
  exports: [MembershipTiersService],
})
export class MembershipTiersModule {}
