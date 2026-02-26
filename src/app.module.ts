import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FeedModule } from './feed/feed.module';
import { MeController } from './me/me.controller';
import { ConfigModule } from '@nestjs/config';
import { MeModule } from './me/me.module';
import { InterestsModule } from './v1/catalog/interests/interests.module';
import { PrismaModule } from './prisma/prisma.module';
import configuration from './config/configuration';
import { MembershipTiersModule } from './config/membership-tiers.module';
import { validate } from './config/validation';
import { ProfileModule } from './v1/profile/profile.module';
import { ActivitiesModule } from './v1/activities/activities.module';
import { MembershipModule } from './membership/membership.module';
import { BillingModule } from './v1/billing/billing.module';
import { NotificationsModule } from './v1/notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    FeedModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validate: validate
    }),
    MembershipTiersModule,
    MembershipModule,
    MeModule,
    InterestsModule,
    PrismaModule,
    ProfileModule,
    ActivitiesModule,
    BillingModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
