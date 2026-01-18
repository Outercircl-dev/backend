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
import { ActivityMessagesController } from './messages/activity-messages.controller';
import { ActivityMessagesService } from './messages/activity-messages.service';
import { ActivityMessageAutomationService } from './messages/activity-message-automation.service';

@Module({
  controllers: [
    ActivitiesController,
    ParticipantsController,
    ActivityGroupsController,
    ActivitySeriesController,
    ActivityMessagesController,
  ],
  providers: [
    ActivitiesService,
    ParticipantsService,
    ActivityNotificationsService,
    ActivityGroupsService,
    ActivitySeriesService,
    ActivityMessagesService,
    ActivityMessageAutomationService,
  ],
  exports: [ActivitiesService, ParticipantsService, ActivityGroupsService, ActivitySeriesService, ActivityMessagesService],
})
export class ActivitiesModule { }

