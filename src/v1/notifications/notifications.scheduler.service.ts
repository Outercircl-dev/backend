import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsSchedulerService {
  private readonly logger = new Logger(NotificationsSchedulerService.name, { timestamp: true });

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron('*/15 * * * *')
  async dispatchUpcomingActivityReminders() {
    const created = await this.notificationsService.dispatchUpcomingActivityReminders();
    if (created > 0) {
      this.logger.log(`Upcoming reminders dispatched: ${created}`);
    }
  }

  @Cron('0 * * * *')
  async dispatchRecommendationMatches() {
    const created = await this.notificationsService.dispatchRecommendationMatches();
    if (created > 0) {
      this.logger.log(`Recommendation matches dispatched: ${created}`);
    }
  }
}

