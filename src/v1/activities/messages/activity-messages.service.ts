import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, activity_message_type } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import { CreateActivityMessageDto } from './dto/create-activity-message.dto';
import { PinActivityMessageDto } from './dto/pin-activity-message.dto';
import { ReportActivityMessageDto } from './dto/report-activity-message.dto';
import { NotificationsService } from 'src/v1/notifications/notifications.service';

export interface ActivityMessageSummary {
  id: string;
  activityId: string;
  authorProfileId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  content: string;
  messageType: activity_message_type;
  isPinned: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

@Injectable()
export class ActivityMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listMessages(
    activityId: string,
    user: AuthenticatedUser,
    page = 1,
    limit = 50,
  ): Promise<{
    items: ActivityMessageSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const supabaseUserId = this.requireSupabaseUserId(user);
    const profile = await this.getProfileForUser(supabaseUserId);
    await this.assertCanAccessActivity(activityId, supabaseUserId, profile.id);

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.activityMessage.findMany({
        where: { activity_id: activityId },
        include: {
          author: {
            select: { id: true, full_name: true, profile_picture_url: true },
          },
        },
        orderBy: [{ is_pinned: 'desc' }, { created_at: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.activityMessage.count({ where: { activity_id: activityId } }),
    ]);

    return {
      items: items.map((message) => this.mapMessage(message)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async createMessage(
    activityId: string,
    user: AuthenticatedUser,
    dto: CreateActivityMessageDto,
  ) {
    const supabaseUserId = this.requireSupabaseUserId(user);
    const profile = await this.getProfileForUser(supabaseUserId);
    const activity = await this.assertCanAccessActivity(
      activityId,
      supabaseUserId,
      profile.id,
    );
    const isHost = activity.host_id === supabaseUserId;

    const wantsAnnouncement =
      dto.messageType === 'announcement' || Boolean(dto.isPinned);
    if (wantsAnnouncement && !isHost) {
      throw new ForbiddenException('Only the host can post announcements');
    }

    const messageType: activity_message_type = wantsAnnouncement
      ? 'announcement'
      : 'user';

    const message = await this.prisma.activityMessage.create({
      data: {
        activity_id: activityId,
        author_profile_id: profile.id,
        content: dto.content.trim(),
        message_type: messageType,
        is_pinned: dto.isPinned ?? false,
      },
      include: {
        author: {
          select: { id: true, full_name: true, profile_picture_url: true },
        },
      },
    });

    if (dto.isPinned) {
      await this.prisma.activityMessage.updateMany({
        where: {
          activity_id: activityId,
          id: { not: message.id },
          is_pinned: true,
        },
        data: { is_pinned: false },
      });
    }

    await this.notifyGroupMessage(activity, {
      activityId,
      actorUserId: supabaseUserId,
      authorName: message.author?.full_name ?? 'A participant',
      messageType,
    });

    return this.mapMessage(message);
  }

  async pinMessage(
    activityId: string,
    messageId: string,
    user: AuthenticatedUser,
    dto: PinActivityMessageDto,
  ) {
    const supabaseUserId = this.requireSupabaseUserId(user);
    const profile = await this.getProfileForUser(supabaseUserId);
    const activity = await this.assertCanAccessActivity(
      activityId,
      supabaseUserId,
      profile.id,
    );
    const isHost = activity.host_id === supabaseUserId;

    if (!isHost) {
      throw new ForbiddenException('Only the host can pin announcements');
    }

    const message = await this.prisma.activityMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.activity_id !== activityId) {
      throw new NotFoundException('Message not found');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPinned) {
        await tx.activityMessage.updateMany({
          where: {
            activity_id: activityId,
            id: { not: messageId },
            is_pinned: true,
          },
          data: { is_pinned: false },
        });
      }

      const updated = await tx.activityMessage.update({
        where: { id: messageId },
        data: {
          is_pinned: dto.isPinned,
          message_type: dto.isPinned ? 'announcement' : message.message_type,
        },
        include: {
          author: {
            select: { id: true, full_name: true, profile_picture_url: true },
          },
        },
      });

      return this.mapMessage(updated);
    });
  }

  async reportMessage(
    activityId: string,
    messageId: string,
    user: AuthenticatedUser,
    dto: ReportActivityMessageDto,
  ) {
    const supabaseUserId = this.requireSupabaseUserId(user);
    const profile = await this.getProfileForUser(supabaseUserId);
    const activity = await this.assertCanAccessActivity(
      activityId,
      supabaseUserId,
      profile.id,
    );

    const message = await this.prisma.activityMessage.findUnique({
      where: { id: messageId },
      select: { id: true, activity_id: true, author_profile_id: true },
    });

    if (!message || message.activity_id !== activityId) {
      throw new NotFoundException('Message not found');
    }

    try {
      const report = await this.prisma.activityMessageReport.create({
        data: {
          message_id: messageId,
          reporter_profile_id: profile.id,
          reason: dto.reason,
          details: dto.details ?? null,
        },
      });
      await this.notificationsService.createNotification({
        recipientUserId: activity.host_id,
        actorUserId: supabaseUserId,
        activityId,
        type: 'safety_alert',
        title: 'Message reported in activity chat',
        body: `A participant reported a message in "${activity.title}".`,
        payload: {
          messageId: message.id,
          reason: dto.reason,
          details: dto.details ?? null,
        },
      });
      return report;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('You have already reported this message');
      }
      throw error;
    }
  }

  async createSystemMessage(
    activityId: string,
    content: string,
    metadata?: Record<string, unknown>,
    messageType: activity_message_type = 'system',
  ) {
    const message = await this.prisma.activityMessage.create({
      data: {
        activity_id: activityId,
        author_profile_id: null,
        content,
        message_type: messageType,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
      include: {
        author: {
          select: { id: true, full_name: true, profile_picture_url: true },
        },
      },
    });

    return this.mapMessage(message);
  }

  private async getProfileForUser(supabaseUserId: string) {
    const profile = await this.prisma.user_profiles.findUnique({
      where: { user_id: supabaseUserId },
      select: { id: true },
    });
    if (!profile) {
      throw new BadRequestException(
        'Complete your profile before sending messages',
      );
    }
    return profile;
  }

  private async assertCanAccessActivity(
    activityId: string,
    supabaseUserId: string,
    profileId: string,
  ) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { id: true, host_id: true, title: true },
    });
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    if (activity.host_id === supabaseUserId) {
      return activity;
    }

    const participant = await this.prisma.activityParticipant.findUnique({
      where: {
        activity_id_profile_id: {
          activity_id: activityId,
          profile_id: profileId,
        },
      },
      select: { status: true },
    });

    if (!participant || participant.status === 'cancelled') {
      throw new ForbiddenException(
        'You are not a participant in this activity',
      );
    }

    return activity;
  }

  private async notifyGroupMessage(
    activity: { id: string; host_id: string; title: string },
    input: {
      activityId: string;
      actorUserId: string;
      authorName: string;
      messageType: activity_message_type;
    },
  ) {
    const participants = await this.prisma.activityParticipant.findMany({
      where: {
        activity_id: input.activityId,
        status: {
          in: ['pending', 'confirmed', 'waitlisted'],
        },
      },
      select: {
        profile: {
          select: { user_id: true },
        },
      },
    });

    const recipients = new Set<string>([
      activity.host_id,
      ...participants.map((participant) => participant.profile.user_id),
    ]);
    recipients.delete(input.actorUserId);

    if (recipients.size === 0) {
      return;
    }

    const isAnnouncement = input.messageType === 'announcement';
    await this.notificationsService.createForRecipients(
      Array.from(recipients),
      {
        actorUserId: input.actorUserId,
        activityId: input.activityId,
        type: 'host_update',
        title: isAnnouncement
          ? 'New activity announcement'
          : 'New activity group message',
        body: isAnnouncement
          ? `${input.authorName} posted an announcement in "${activity.title}".`
          : `${input.authorName} sent a message in "${activity.title}".`,
      },
    );
  }

  private requireSupabaseUserId(user: AuthenticatedUser): string {
    if (!user?.supabaseUserId) {
      throw new BadRequestException(
        'supabaseUserId missing from authenticated request',
      );
    }
    return user.supabaseUserId;
  }

  private mapMessage(
    message: Prisma.ActivityMessageGetPayload<{
      include: {
        author: {
          select: { id: true; full_name: true; profile_picture_url: true };
        };
      };
    }>,
  ): ActivityMessageSummary {
    return {
      id: message.id,
      activityId: message.activity_id,
      authorProfileId: message.author_profile_id,
      authorName: message.author?.full_name ?? null,
      authorAvatarUrl: message.author?.profile_picture_url ?? null,
      content: message.content,
      messageType: message.message_type,
      isPinned: message.is_pinned,
      metadata: (message.metadata as Record<string, unknown> | null) ?? null,
      createdAt: message.created_at ?? null,
      updatedAt: message.updated_at ?? null,
    };
  }
}
