import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ParticipantsController } from './participants/participants.controller';
import { ParticipantsService } from './participants/participants.service';
import { ActivityNotificationsService } from './activity-notifications.service';
import { ActivityGroupsController } from './groups/activity-groups.controller';
import { ActivityGroupsService } from './groups/activity-groups.service';
import { ActivitySeriesController } from './series/activity-series.controller';
import { ActivitySeriesService } from './series/activity-series.service';

@Module({
  controllers: [
    ActivitiesController,
    ParticipantsController,
    ActivityGroupsController,
    ActivitySeriesController,
  ],
  providers: [
    ActivitiesService,
    ParticipantsService,
    ActivityNotificationsService,
    ActivityGroupsService,
    ActivitySeriesService,
  ],
  exports: [ActivitiesService, ParticipantsService, ActivityGroupsService, ActivitySeriesService],
})
export class ActivitiesModule {}

