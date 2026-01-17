import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ParticipantsController } from './participants/participants.controller';
import { ParticipantsService } from './participants/participants.service';
import { ActivityNotificationsService } from './activity-notifications.service';

@Module({
  controllers: [ActivitiesController, ParticipantsController],
  providers: [ActivitiesService, ParticipantsService, ActivityNotificationsService],
  exports: [ActivitiesService, ParticipantsService],
})
export class ActivitiesModule {}

