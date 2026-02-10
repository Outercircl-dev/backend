import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MembershipTiersService } from './membership-tiers.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MembershipTiersService],
  exports: [MembershipTiersService],
})
export class MembershipTiersModule {}
