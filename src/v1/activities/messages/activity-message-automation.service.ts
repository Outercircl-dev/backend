import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityMessagesService } from './activity-messages.service';

@Injectable()
export class ActivityMessageAutomationService {
  private readonly logger = new Logger(ActivityMessageAutomationService.name, { timestamp: true });

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesService: ActivityMessagesService,
  ) {}

  @Cron('*/30 * * * *')
  async runAutomation() {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const activities = await this.prisma.activity.findMany({
      where: {
        status: 'published',
        activity_date: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      select: {
        id: true,
        activity_date: true,
        start_time: true,
        end_time: true,
      },
    });

    for (const activity of activities) {
      const startDateTime = this.buildActivityDateTime(activity.activity_date, activity.start_time);
      const endDateTime = this.buildActivityDateTime(
        activity.activity_date,
        activity.end_time ?? activity.start_time,
      );

      await this.ensurePreMessage(activity.id, now, startDateTime);
      await this.ensurePostMessage(activity.id, now, endDateTime);
      await this.ensureSurveyMessage(activity.id, now, endDateTime);
    }
  }

  private async ensurePreMessage(activityId: string, now: Date, start: Date) {
    const threshold = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    if (now < threshold || now >= start) {
      return;
    }

    const exists = await this.prisma.activityMessage.findFirst({
      where: {
        activity_id: activityId,
        message_type: 'system',
        metadata: {
          path: ['auto'],
          equals: 'pre',
        },
      },
      select: { id: true },
    });

    if (exists) {
      return;
    }

    await this.messagesService.createSystemMessage(activityId, 'Reminder: your activity starts within 24 hours.', {
      auto: 'pre',
    });
  }

  private async ensurePostMessage(activityId: string, now: Date, end: Date) {
    if (now < end) {
      return;
    }

    const exists = await this.prisma.activityMessage.findFirst({
      where: {
        activity_id: activityId,
        message_type: 'system',
        metadata: {
          path: ['auto'],
          equals: 'post',
        },
      },
      select: { id: true },
    });

    if (exists) {
      return;
    }

    await this.messagesService.createSystemMessage(activityId, 'Thanks for joining the activity! We hope you had a great time.', {
      auto: 'post',
    });
  }

  private async ensureSurveyMessage(activityId: string, now: Date, end: Date) {
    if (now < end) {
      return;
    }

    const exists = await this.prisma.activityMessage.findFirst({
      where: {
        activity_id: activityId,
        message_type: 'survey',
      },
      select: { id: true },
    });

    if (exists) {
      return;
    }

    await this.messagesService.createSystemMessage(
      activityId,
      'Please take a moment to complete the post-activity survey and share your feedback.',
      { auto: 'survey', survey: 'post_activity' },
      'survey',
    );
  }

  private buildActivityDateTime(activityDate: Date, time: Date | string): Date {
    const date = new Date(activityDate);
    if (typeof time === 'string') {
      const [hours, minutes, seconds = '0'] = time.split(':');
      date.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10), 0);
      return date;
    }
    date.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
    return date;
  }
}

