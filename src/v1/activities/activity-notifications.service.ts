import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export type ActivityNotificationType =
  | 'activity.joined'
  | 'activity.waitlisted'
  | 'activity.cancelled'
  | 'activity.promoted'
  | 'activity.approval_pending'
  | 'activity.approved'
  | 'activity.rejected';

export interface ActivityNotificationPayload {
  activityId: string;
  participantId: string;
  userId: string;
  type: ActivityNotificationType;
  metadata?: Record<string, unknown>;
}

/**
 * Notification adapter for participation events.
 * Routes activity participation transitions into FR9 notifications.
 */
@Injectable()
export class ActivityNotificationsService {
  private readonly logger = new Logger(ActivityNotificationsService.name, { timestamp: true });

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async emit(payload: ActivityNotificationPayload) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: payload.activityId },
      select: { id: true, host_id: true, title: true },
    });
    if (!activity) {
      this.logger.warn(`Skipping notification emission for missing activity ${payload.activityId}`);
      return;
    }

    if (payload.type === 'activity.joined') {
      await this.notificationsService.createNotification({
        recipientUserId: activity.host_id,
        actorUserId: payload.userId,
        activityId: activity.id,
        type: 'participant_joined',
        title: 'Participant joined your activity',
        body: `A participant has joined "${activity.title}".`,
        payload: {
          participantId: payload.participantId,
        },
      });
      return;
    }

    if (payload.type === 'activity.cancelled') {
      await this.notificationsService.createNotification({
        recipientUserId: activity.host_id,
        actorUserId: payload.userId,
        activityId: activity.id,
        type: 'participant_cancelled',
        title: 'Participant cancelled',
        body: `A participant has cancelled from "${activity.title}".`,
        payload: {
          participantId: payload.participantId,
        },
      });
      return;
    }

    // Non-host moderation/status transitions are sent to the participant.
    if (
      payload.type === 'activity.waitlisted' ||
      payload.type === 'activity.promoted' ||
      payload.type === 'activity.approval_pending' ||
      payload.type === 'activity.approved' ||
      payload.type === 'activity.rejected'
    ) {
      await this.notificationsService.createNotification({
        recipientUserId: payload.userId,
        actorUserId: activity.host_id,
        activityId: activity.id,
        type: 'host_update',
        title: 'Host update',
        body: this.buildHostUpdateBody(payload.type, activity.title),
        payload: payload.metadata,
      });
    }
  }

  private buildHostUpdateBody(type: ActivityNotificationType, title: string): string {
    switch (type) {
      case 'activity.waitlisted':
        return `You were added to the waitlist for "${title}".`;
      case 'activity.promoted':
        return `Good news: you were promoted from the waitlist for "${title}".`;
      case 'activity.approval_pending':
        return `Your participation request for "${title}" is pending host approval.`;
      case 'activity.approved':
        return `Your participation request for "${title}" was approved.`;
      case 'activity.rejected':
        return `Your participation request for "${title}" was declined by the host.`;
      default:
        return `There is an update for "${title}".`;
    }
  }
}

