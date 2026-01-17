import { Injectable, Logger } from '@nestjs/common';

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
 * Minimal notification facade for participation events. For now it simply logs the
 * event, but it centralises the behaviour so we can plug in email/SMS/web push
 * without touching the business logic again.
 */
@Injectable()
export class ActivityNotificationsService {
  private readonly logger = new Logger(ActivityNotificationsService.name, { timestamp: true });

  async emit(payload: ActivityNotificationPayload) {
    this.logger.log(
      `[${payload.type}] activity=${payload.activityId} participant=${payload.participantId} user=${payload.userId} metadata=${JSON.stringify(
        payload.metadata ?? {},
      )}`,
    );
    // Future work: enqueue real notification jobs (email, push, etc.)
  }
}

