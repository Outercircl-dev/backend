import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
} from 'src/generated/prisma/client';
import type { notification_channel, notification_delivery_status, notification_type } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationEmailService } from './providers/email.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type NotificationPreferenceFlag =
  | 'recommended_activities'
  | 'upcoming_activity_reminders'
  | 'host_join_cancel_updates'
  | 'time_location_change_alerts'
  | 'safety_alerts';

export interface CreateNotificationInput {
  recipientUserId: string;
  actorUserId?: string;
  activityId?: string;
  type: notification_type;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  channels?: {
    inApp?: boolean;
    email?: boolean;
    browser?: boolean;
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name, { timestamp: true });

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEmailService: NotificationEmailService,
  ) {}

  async listForUser(userId: string, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) {
    const normalizedPage = Number.isFinite(page) ? Math.max(1, page) : DEFAULT_PAGE;
    const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(1, limit), MAX_LIMIT) : DEFAULT_LIMIT;
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipient_user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: normalizedLimit,
      }),
      this.prisma.notification.count({
        where: { recipient_user_id: userId },
      }),
    ]);

    return {
      items: items.map((item) => this.mapNotification(item)),
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        recipient_user_id: userId,
        is_read: false,
      },
    });

    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const now = new Date();
    const updated = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipient_user_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: now,
      },
    });

    if (updated.count === 0) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          recipient_user_id: userId,
        },
      });
      if (!existing) {
        return { updated: false };
      }
    }

    return { updated: true };
  }

  async markAllRead(userId: string) {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: {
        recipient_user_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: now,
      },
    });

    return { updatedCount: result.count };
  }

  async getPreferences(userId: string) {
    const preference = await this.ensurePreferences(userId);
    return this.mapPreferences(preference);
  }

  async updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    const updated = await this.prisma.notificationPreference.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        recommended_activities: dto.recommendedActivities ?? true,
        upcoming_activity_reminders: dto.upcomingActivityReminders ?? true,
        host_join_cancel_updates: dto.hostJoinCancelUpdates ?? true,
        time_location_change_alerts: dto.timeLocationChangeAlerts ?? true,
        safety_alerts: dto.safetyAlerts ?? true,
        channel_in_app: dto.channelInApp ?? true,
        channel_email: dto.channelEmail ?? true,
        channel_browser: dto.channelBrowser ?? true,
      },
      update: {
        ...(dto.recommendedActivities !== undefined
          ? { recommended_activities: dto.recommendedActivities }
          : {}),
        ...(dto.upcomingActivityReminders !== undefined
          ? { upcoming_activity_reminders: dto.upcomingActivityReminders }
          : {}),
        ...(dto.hostJoinCancelUpdates !== undefined
          ? { host_join_cancel_updates: dto.hostJoinCancelUpdates }
          : {}),
        ...(dto.timeLocationChangeAlerts !== undefined
          ? { time_location_change_alerts: dto.timeLocationChangeAlerts }
          : {}),
        ...(dto.safetyAlerts !== undefined ? { safety_alerts: dto.safetyAlerts } : {}),
        ...(dto.channelInApp !== undefined ? { channel_in_app: dto.channelInApp } : {}),
        ...(dto.channelEmail !== undefined ? { channel_email: dto.channelEmail } : {}),
        ...(dto.channelBrowser !== undefined ? { channel_browser: dto.channelBrowser } : {}),
      },
    });

    return this.mapPreferences(updated);
  }

  async createNotification(input: CreateNotificationInput) {
    const preference = await this.ensurePreferences(input.recipientUserId);
    if (!this.isTypeEnabled(preference, input.type)) {
      return null;
    }

    const deliverInApp = preference.channel_in_app && (input.channels?.inApp ?? true);
    const deliverEmail = preference.channel_email && (input.channels?.email ?? true);
    const deliverBrowser = preference.channel_browser && (input.channels?.browser ?? true);

    if (!deliverInApp && !deliverEmail && !deliverBrowser) {
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        recipient_user_id: input.recipientUserId,
        actor_user_id: input.actorUserId ?? null,
        activity_id: input.activityId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: (input.payload ?? {}) as Prisma.JsonObject,
        deliver_in_app: deliverInApp,
        deliver_email: deliverEmail,
        deliver_browser: deliverBrowser,
      },
    });

    await this.createDeliveryRecords(notification.id, {
      deliverInApp,
      deliverEmail,
      deliverBrowser,
    });

    if (deliverInApp) {
      await this.updateDeliveryStatus(notification.id, 'in_app', 'sent', {
        deliveredAt: new Date(),
      });
    }

    if (deliverBrowser) {
      await this.updateDeliveryStatus(notification.id, 'browser', 'pending');
    }

    if (deliverEmail) {
      const emailResult = await this.notificationEmailService.sendNotificationEmail(
        input.recipientUserId,
        input.title,
        input.body,
      );

      if (emailResult.status === 'sent') {
        await this.updateDeliveryStatus(notification.id, 'email', 'sent', {
          deliveredAt: new Date(),
          providerMessageId: emailResult.providerMessageId,
        });
      } else if (emailResult.status === 'skipped') {
        await this.updateDeliveryStatus(notification.id, 'email', 'skipped', {
          errorMessage: emailResult.errorMessage,
        });
      } else {
        await this.updateDeliveryStatus(notification.id, 'email', 'failed', {
          errorMessage: emailResult.errorMessage,
        });
      }
    }

    return this.mapNotification(notification);
  }

  async createForRecipients(
    recipientUserIds: string[],
    input: Omit<CreateNotificationInput, 'recipientUserId'>,
  ): Promise<number> {
    let createdCount = 0;
    for (const recipientUserId of recipientUserIds) {
      const created = await this.createNotification({ ...input, recipientUserId });
      if (created) {
        createdCount += 1;
      }
    }
    return createdCount;
  }

  async maybeCreateNotification(
    input: CreateNotificationInput & { dedupeHours?: number },
  ): Promise<boolean> {
    const dedupeHours = input.dedupeHours ?? 12;
    const shouldSkip = await this.hasRecentNotification(
      input.recipientUserId,
      input.type,
      input.activityId,
      dedupeHours,
    );
    if (shouldSkip) {
      return false;
    }

    const created = await this.createNotification(input);
    return Boolean(created);
  }

  async dispatchUpcomingActivityReminders(): Promise<number> {
    const now = new Date();
    const upperBound = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const activities = await this.prisma.activity.findMany({
      where: {
        status: 'published',
        activity_date: {
          lte: upperBound,
        },
      },
      select: {
        id: true,
        title: true,
        activity_date: true,
        start_time: true,
      },
      take: 250,
    });

    let createdCount = 0;

    for (const activity of activities) {
      const startsAt = this.buildActivityStart(activity.activity_date, activity.start_time);
      const minutesUntilStart = Math.round((startsAt.getTime() - now.getTime()) / 60_000);
      const shouldNotify =
        (minutesUntilStart >= 55 && minutesUntilStart <= 65) ||
        (minutesUntilStart >= 23 * 60 + 30 && minutesUntilStart <= 24 * 60 + 30);

      if (!shouldNotify) {
        continue;
      }

      const participants = await this.prisma.activityParticipant.findMany({
        where: {
          activity_id: activity.id,
          status: 'confirmed',
        },
        select: {
          profile: {
            select: {
              user_id: true,
            },
          },
        },
      });

      for (const participant of participants) {
        const created = await this.maybeCreateNotification({
          recipientUserId: participant.profile.user_id,
          activityId: activity.id,
          type: 'upcoming_activity',
          title: 'Upcoming activity reminder',
          body: `${activity.title} starts soon. Check details and be ready.`,
          payload: { minutesUntilStart },
          dedupeHours: 6,
        });
        if (created) {
          createdCount += 1;
        }
      }
    }

    if (createdCount > 0) {
      this.logger.log(`Created ${createdCount} upcoming activity reminder notifications`);
    }
    return createdCount;
  }

  async dispatchRecommendationMatches(): Promise<number> {
    const profiles = await this.prisma.user_profiles.findMany({
      select: {
        user_id: true,
        interests: true,
      },
      take: 250,
    });

    const activities = await this.prisma.activity.findMany({
      where: {
        status: 'published',
      },
      select: {
        id: true,
        host_id: true,
        title: true,
        interests: true,
        activity_date: true,
      },
      orderBy: {
        activity_date: 'asc',
      },
      take: 500,
    });

    let createdCount = 0;

    for (const profile of profiles) {
      const userInterests = this.toStringArray(profile.interests);
      if (userInterests.length === 0) {
        continue;
      }

      const matched = activities.find((activity) => {
        if (activity.host_id === profile.user_id) {
          return false;
        }
        const activityInterests = this.toStringArray(activity.interests);
        return activityInterests.some((interest) => userInterests.includes(interest));
      });

      if (!matched) {
        continue;
      }

      const isAlreadyParticipant = await this.prisma.activityParticipant.findFirst({
        where: {
          activity_id: matched.id,
          profile: {
            user_id: profile.user_id,
          },
          status: {
            in: ['pending', 'confirmed', 'waitlisted'],
          },
        },
        select: { id: true },
      });
      if (isAlreadyParticipant) {
        continue;
      }

      const created = await this.maybeCreateNotification({
        recipientUserId: profile.user_id,
        activityId: matched.id,
        type: 'recommendation_match',
        title: 'Recommended activity for you',
        body: `${matched.title} matches your interests.`,
        payload: { source: 'interest-match' },
        dedupeHours: 24,
      });
      if (created) {
        createdCount += 1;
      }
    }

    if (createdCount > 0) {
      this.logger.log(`Created ${createdCount} recommendation notifications`);
    }
    return createdCount;
  }

  private async hasRecentNotification(
    recipientUserId: string,
    type: notification_type,
    activityId?: string,
    hours = 24,
  ) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const existing = await this.prisma.notification.findFirst({
      where: {
        recipient_user_id: recipientUserId,
        type,
        ...(activityId ? { activity_id: activityId } : {}),
        created_at: {
          gte: since,
        },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private async ensurePreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
      },
      update: {},
    });
  }

  private async createDeliveryRecords(
    notificationId: string,
    channels: { deliverInApp: boolean; deliverEmail: boolean; deliverBrowser: boolean },
  ) {
    const rows: Prisma.NotificationDeliveryCreateManyInput[] = [];
    if (channels.deliverInApp) {
      rows.push({
        notification_id: notificationId,
        channel: 'in_app',
        status: 'pending',
      });
    }
    if (channels.deliverEmail) {
      rows.push({
        notification_id: notificationId,
        channel: 'email',
        status: 'pending',
      });
    }
    if (channels.deliverBrowser) {
      rows.push({
        notification_id: notificationId,
        channel: 'browser',
        status: 'pending',
      });
    }
    if (rows.length === 0) {
      return;
    }
    await this.prisma.notificationDelivery.createMany({ data: rows, skipDuplicates: true });
  }

  private async updateDeliveryStatus(
    notificationId: string,
    channel: notification_channel,
    status: notification_delivery_status,
    options?: {
      providerMessageId?: string;
      errorMessage?: string;
      deliveredAt?: Date;
    },
  ) {
    await this.prisma.notificationDelivery.updateMany({
      where: {
        notification_id: notificationId,
        channel,
      },
      data: {
        status,
        provider_message_id: options?.providerMessageId ?? null,
        error_message: options?.errorMessage ?? null,
        delivered_at: options?.deliveredAt ?? null,
      },
    });
  }

  private isTypeEnabled(
    preference: {
      recommended_activities: boolean;
      upcoming_activity_reminders: boolean;
      host_join_cancel_updates: boolean;
      time_location_change_alerts: boolean;
      safety_alerts: boolean;
    },
    type: notification_type,
  ): boolean {
    const key = this.preferenceFlagForType(type);
    return preference[key];
  }

  private preferenceFlagForType(type: notification_type): NotificationPreferenceFlag {
    if (type === 'recommendation_match') {
      return 'recommended_activities';
    }
    if (type === 'upcoming_activity') {
      return 'upcoming_activity_reminders';
    }
    if (type === 'participant_joined' || type === 'participant_cancelled') {
      return 'host_join_cancel_updates';
    }
    if (type === 'activity_time_changed' || type === 'activity_location_changed') {
      return 'time_location_change_alerts';
    }
    return 'safety_alerts';
  }

  private mapNotification(notification: {
    id: string;
    type: notification_type;
    title: string;
    body: string;
    payload: Prisma.JsonValue | null;
    is_read: boolean;
    read_at: Date | null;
    created_at: Date | null;
    deliver_in_app: boolean;
    deliver_email: boolean;
    deliver_browser: boolean;
    activity_id?: string | null;
    actor_user_id?: string | null;
  }) {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: notification.payload ?? {},
      isRead: notification.is_read,
      readAt: notification.read_at,
      createdAt: notification.created_at,
      activityId: notification.activity_id ?? null,
      actorUserId: notification.actor_user_id ?? null,
      channels: {
        inApp: notification.deliver_in_app,
        email: notification.deliver_email,
        browser: notification.deliver_browser,
      },
    };
  }

  private mapPreferences(preference: {
    recommended_activities: boolean;
    upcoming_activity_reminders: boolean;
    host_join_cancel_updates: boolean;
    time_location_change_alerts: boolean;
    safety_alerts: boolean;
    channel_in_app: boolean;
    channel_email: boolean;
    channel_browser: boolean;
    updated_at: Date | null;
  }) {
    return {
      recommendedActivities: preference.recommended_activities,
      upcomingActivityReminders: preference.upcoming_activity_reminders,
      hostJoinCancelUpdates: preference.host_join_cancel_updates,
      timeLocationChangeAlerts: preference.time_location_change_alerts,
      safetyAlerts: preference.safety_alerts,
      channelInApp: preference.channel_in_app,
      channelEmail: preference.channel_email,
      channelBrowser: preference.channel_browser,
      updatedAt: preference.updated_at,
    };
  }

  private buildActivityStart(activityDate: Date, startTime: Date | string): Date {
    const date = new Date(activityDate);
    if (typeof startTime === 'string') {
      const [hours, minutes, seconds = '0'] = startTime.split(':');
      date.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10), 0);
      return date;
    }
    date.setHours(startTime.getHours(), startTime.getMinutes(), startTime.getSeconds(), 0);
    return date;
  }

  private toStringArray(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
  }
}

