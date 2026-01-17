import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, participation_status } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityNotificationsService } from '../activity-notifications.service';
import { JoinActivityDto } from './dto/join-activity.dto';
import { UpdateParticipationDto } from './dto/update-participation.dto';

export interface ParticipantSummaryDto {
  id: string;
  profileId: string;
  supabaseUserId: string;
  fullName: string | null;
  avatarUrl: string | null;
  status: participation_status;
  waitlistPosition: number | null;
  approvalMessage?: string | null;
  joinedAt: Date | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
}

const PARTICIPANT_STATUS_ORDER: Record<participation_status, number> = {
  confirmed: 0,
  pending: 1,
  waitlisted: 2,
  cancelled: 3,
};

@Injectable()
export class ParticipantsService {
  private readonly logger = new Logger(ParticipantsService.name, { timestamp: true });

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: ActivityNotificationsService,
  ) {}

  async join(activityId: string, supabaseUserId: string, dto: JoinActivityDto): Promise<ParticipantSummaryDto> {
    const profile = await this.getProfileOrThrow(supabaseUserId);

    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.findUnique({
        where: { id: activityId },
      });

      if (!activity) {
        throw new NotFoundException(`Activity with ID ${activityId} not found`);
      }

      if (activity.host_id === supabaseUserId) {
        throw new BadRequestException('Hosts cannot join their own activities');
      }

      if (activity.status !== 'published') {
        throw new BadRequestException('Activity is not accepting new participants');
      }

      const existing = await tx.activityParticipant.findUnique({
        where: {
          activity_id_profile_id: {
            activity_id: activityId,
            profile_id: profile.id,
          },
        },
      });

      if (existing && existing.status !== 'cancelled') {
        throw new BadRequestException('You have already joined or requested to join this activity');
      }

      const [confirmedCount, waitlistedCount] = await Promise.all([
        tx.activityParticipant.count({ where: { activity_id: activityId, status: 'confirmed' } }),
        tx.activityParticipant.count({ where: { activity_id: activityId, status: 'waitlisted' } }),
      ]);

      let status: participation_status = 'confirmed';
      let waitlistPosition: number | null = null;

      if (!activity.is_public) {
        status = 'pending';
      } else if (confirmedCount >= activity.max_participants) {
        status = 'waitlisted';
        waitlistPosition = waitlistedCount + 1;
      }

      const participant = existing
        ? await tx.activityParticipant.update({
            where: { id: existing.id },
            data: {
              status,
              waitlist_position: waitlistPosition,
              approval_message: dto.message ?? existing.approval_message,
              invite_code: dto.inviteCode ?? existing.invite_code,
              joined_at: existing.joined_at ?? new Date(),
              cancelled_at: null,
            },
          })
        : await tx.activityParticipant.create({
            data: {
              activity_id: activityId,
              profile_id: profile.id,
              status,
              waitlist_position: waitlistPosition,
              approval_message: dto.message,
              invite_code: dto.inviteCode,
            },
          });

      await this.emitJoinNotification(activityId, participant.id, supabaseUserId, status, waitlistPosition);

      const hydrated = await tx.activityParticipant.findUnique({
        where: { id: participant.id },
        include: {
          profile: {
            select: { id: true, user_id: true, full_name: true, profile_picture_url: true },
          },
        },
      });

      if (!hydrated) {
        throw new NotFoundException('Participation record could not be hydrated');
      }

      return this.mapParticipantSummary(hydrated);
    });
  }

  async cancelParticipation(
    activityId: string,
    participantId: string,
    supabaseUserId: string,
  ): Promise<ParticipantSummaryDto> {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.activityParticipant.findUnique({
        where: { id: participantId },
        include: {
          activity: true,
          profile: {
            select: { id: true, user_id: true, full_name: true, profile_picture_url: true },
          },
        },
      });

      if (!participant || participant.activity_id !== activityId) {
        throw new NotFoundException('Participation record not found');
      }

      const isSelf = participant.profile.user_id === supabaseUserId;
      const isHost = participant.activity.host_id === supabaseUserId;

      if (!isSelf && !isHost) {
        throw new ForbiddenException('You do not have permission to cancel this participation');
      }

      if (participant.status === 'cancelled') {
        return this.mapParticipantSummary(participant);
      }

      const updated = await tx.activityParticipant.update({
        where: { id: participantId },
        data: {
          status: 'cancelled',
          waitlist_position: null,
          cancelled_at: new Date(),
        },
      });

      if (participant.status === 'waitlisted') {
        await this.resequenceWaitlist(tx, activityId);
      }

      if (participant.status === 'confirmed') {
        await this.promoteNextWaitlisted(tx, participant.activity);
      }

      await this.notifications.emit({
        activityId,
        participantId,
        userId: participant.profile.user_id,
        type: 'activity.cancelled',
      });

      return this.mapParticipantSummary({
        ...participant,
        ...updated,
      });
    });
  }

  async moderateParticipant(
    activityId: string,
    participantId: string,
    supabaseUserId: string,
    dto: UpdateParticipationDto,
  ): Promise<ParticipantSummaryDto> {
    return this.prisma.$transaction(async (tx) => {
      const participant = await tx.activityParticipant.findUnique({
        where: { id: participantId },
        include: {
          activity: true,
          profile: {
            select: { id: true, user_id: true, full_name: true, profile_picture_url: true },
          },
        },
      });

      if (!participant || participant.activity_id !== activityId) {
        throw new NotFoundException('Participation record not found');
      }

      if (participant.activity.host_id !== supabaseUserId) {
        throw new ForbiddenException('Only the host can approve or reject participants');
      }

      if (dto.action === 'approve') {
        if (participant.status === 'confirmed') {
          return this.mapParticipantSummary(participant);
        }

        const confirmedCount = await tx.activityParticipant.count({
          where: { activity_id: activityId, status: 'confirmed' },
        });

        if (confirmedCount >= participant.activity.max_participants) {
          throw new BadRequestException('Activity is already at capacity');
        }

        const updated = await tx.activityParticipant.update({
          where: { id: participantId },
          data: {
            status: 'confirmed',
            waitlist_position: null,
            approved_at: new Date(),
            joined_at: participant.joined_at ?? new Date(),
          },
        });

        await this.notifications.emit({
          activityId,
          participantId,
          userId: participant.profile.user_id,
          type: 'activity.approved',
        });

        await this.resequenceWaitlist(tx, activityId);

        return this.mapParticipantSummary({
          ...participant,
          ...updated,
        });
      }

      const updated = await tx.activityParticipant.update({
        where: { id: participantId },
        data: {
          status: 'cancelled',
          waitlist_position: null,
          cancelled_at: new Date(),
          approval_message: dto.message ?? participant.approval_message,
        },
      });

      await this.notifications.emit({
        activityId,
        participantId,
        userId: participant.profile.user_id,
        type: 'activity.rejected',
        metadata: dto.message ? { message: dto.message } : undefined,
      });

      await this.resequenceWaitlist(tx, activityId);

      return this.mapParticipantSummary({
        ...participant,
        ...updated,
      });
    });
  }

  async listParticipants(activityId: string, supabaseUserId: string): Promise<ParticipantSummaryDto[]> {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { host_id: true },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${activityId} not found`);
    }

    if (activity.host_id !== supabaseUserId) {
      throw new ForbiddenException('Only the host can view the participant roster');
    }

    const participants = await this.prisma.activityParticipant.findMany({
      where: { activity_id: activityId },
      include: {
        profile: {
          select: { id: true, user_id: true, full_name: true, profile_picture_url: true },
        },
      },
    });

    return participants
      .sort((a, b) => {
        const statusDelta = PARTICIPANT_STATUS_ORDER[a.status] - PARTICIPANT_STATUS_ORDER[b.status];
        if (statusDelta !== 0) {
          return statusDelta;
        }
        if (a.waitlist_position !== null && b.waitlist_position !== null) {
          return a.waitlist_position - b.waitlist_position;
        }
        return (a.joined_at?.getTime() ?? 0) - (b.joined_at?.getTime() ?? 0);
      })
      .map((participant) => this.mapParticipantSummary(participant));
  }

  private async getProfileOrThrow(supabaseUserId: string) {
    const profile = await this.prisma.user_profiles.findUnique({
      where: { user_id: supabaseUserId },
      select: { id: true, user_id: true },
    });

    if (!profile) {
      throw new BadRequestException('Complete your profile before joining activities');
    }

    return profile;
  }

  private mapParticipantSummary(
    participant: Prisma.ActivityParticipantGetPayload<{
      include: { profile: { select: { id: true; user_id: true; full_name: true; profile_picture_url: true } } };
    }>,
  ): ParticipantSummaryDto {
    return {
      id: participant.id,
      profileId: participant.profile.id,
      supabaseUserId: participant.profile.user_id,
      fullName: participant.profile.full_name,
      avatarUrl: participant.profile.profile_picture_url,
      status: participant.status,
      waitlistPosition: participant.waitlist_position ?? null,
      approvalMessage: participant.approval_message,
      joinedAt: participant.joined_at ?? null,
      approvedAt: participant.approved_at ?? null,
      cancelledAt: participant.cancelled_at ?? null,
    };
  }

  private async resequenceWaitlist(tx: Prisma.TransactionClient, activityId: string) {
    const waitlisted = await tx.activityParticipant.findMany({
      where: { activity_id: activityId, status: 'waitlisted' },
      orderBy: [{ waitlist_position: 'asc' }, { joined_at: 'asc' }],
    });

    await Promise.all(
      waitlisted.map((participant, index) =>
        tx.activityParticipant.update({
          where: { id: participant.id },
          data: { waitlist_position: index + 1 },
        }),
      ),
    );
  }

  private async promoteNextWaitlisted(tx: Prisma.TransactionClient, activity: { id: string; max_participants: number }) {
    const confirmedCount = await tx.activityParticipant.count({
      where: { activity_id: activity.id, status: 'confirmed' },
    });

    if (confirmedCount >= activity.max_participants) {
      return;
    }

    const next = await tx.activityParticipant.findFirst({
      where: { activity_id: activity.id, status: 'waitlisted' },
      orderBy: [{ waitlist_position: 'asc' }, { joined_at: 'asc' }],
    });

    if (!next) {
      return;
    }

    const updated = await tx.activityParticipant.update({
      where: { id: next.id },
      data: {
        status: 'confirmed',
        waitlist_position: null,
        approved_at: new Date(),
      },
    });

    const profile = await tx.user_profiles.findUnique({
      where: { id: updated.profile_id },
      select: { user_id: true },
    });

    if (profile) {
      await this.notifications.emit({
        activityId: activity.id,
        participantId: updated.id,
        userId: profile.user_id,
        type: 'activity.promoted',
      });
    }

    await this.resequenceWaitlist(tx, activity.id);
  }

  private async emitJoinNotification(
    activityId: string,
    participantId: string,
    supabaseUserId: string,
    status: participation_status,
    waitlistPosition: number | null,
  ) {
    switch (status) {
      case 'confirmed':
        await this.notifications.emit({
          activityId,
          participantId,
          userId: supabaseUserId,
          type: 'activity.joined',
        });
        break;
      case 'waitlisted':
        await this.notifications.emit({
          activityId,
          participantId,
          userId: supabaseUserId,
          type: 'activity.waitlisted',
          metadata: waitlistPosition ? { waitlistPosition } : undefined,
        });
        break;
      default:
        await this.notifications.emit({
          activityId,
          participantId,
          userId: supabaseUserId,
          type: 'activity.approval_pending',
        });
        break;
    }
  }
}

