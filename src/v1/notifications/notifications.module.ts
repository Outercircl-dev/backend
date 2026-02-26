import { Module } from '@nestjs/common';
import { MembershipModule } from 'src/membership/membership.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsSchedulerService } from './notifications.scheduler.service';
import { NotificationsService } from './notifications.service';
import { NotificationEmailService } from './providers/email.service';

@Module({
  imports: [PrismaModule, MembershipModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsSchedulerService, NotificationEmailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

