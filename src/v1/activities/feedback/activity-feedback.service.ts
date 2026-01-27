import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { isPremium } from '../hosting-rules';
import type { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import { CreateActivityFeedbackDto } from './dto/create-activity-feedback.dto';

export interface FeedbackParticipantSummary {
  profileId: string;
  supabaseUserId: string;
  fullName: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  ratingSummary?: UserRatingSummary;
}

export interface FeedbackSubmissionSummary {
  rating: number;
  comment: string | null;
  consentToAnalysis: boolean;
  participantRatings: Array<{
    profileId: string;
    rating: number;
    comment: string | null;
  }>;
}

export interface FeedbackFormResponse {
  activityId: string;
  eligible: boolean;
  activityEnded: boolean;
  submitted: boolean;
  reason?: string;
  participants: FeedbackParticipantSummary[];
  feedback?: FeedbackSubmissionSummary;
}

export interface UserRatingSummary {
  averageRating: number | null;
  ratingsCount: number;
  activityCount: number;
}

const LOW_RATING_THRESHOLD = 2;
const LOW_RATING_REVIEW_COUNT = 3;

@Injectable()
export class ActivityFeedbackService {
  private readonly logger = new Logger(ActivityFeedbackService.name, { timestamp: true });

  constructor(private readonly prisma: PrismaService) {}

  async getFeedbackForm(activityId: string, user: AuthenticatedUser): Promise<FeedbackFormResponse> {
    const profile = await this.getProfileOrThrow(user.supabaseUserId);
    const activity = await this.getActivityOrThrow(activityId);
    const activityEnded = this.isActivityEnded(activity);
    const isHost = activity.host_id === user.supabaseUserId;

    const participant = await this.prisma.activityParticipant.findUnique({
      where: {
        activity_id_profile_id: { activity_id: activityId, profile_id: profile.id },
      },
      select: { status: true },
    });

    const hasConfirmedParticipation = participant?.status === 'confirmed';
    const eligible = activityEnded && (hasConfirmedParticipation || isHost);
    const reason = !activityEnded
      ? 'Activity has not ended yet'
      : !hasConfirmedParticipation && !isHost
        ? 'Only confirmed participants can leave feedback'
        : undefined;

    const existingFeedback = await this.prisma.activityFeedback.findUnique({
      where: { activity_id_author_profile_id: { activity_id: activityId, author_profile_id: profile.id } },
      include: {
        ratings: {
          select: { target_profile_id: true, rating: true, comment: true },
        },
      },
    });

    const participants = isHost || hasConfirmedParticipation
      ? await this.getParticipantsForRating(activity, profile.id, isPremium(user))
      : [];

    return {
      activityId,
      eligible,
      activityEnded,
      submitted: Boolean(existingFeedback),
      reason,
      participants,
      feedback: existingFeedback
        ? {
            rating: existingFeedback.rating,
            comment: existingFeedback.comment ?? null,
            consentToAnalysis: existingFeedback.consent_to_analysis,
            participantRatings: existingFeedback.ratings.map((rating) => ({
              profileId: rating.target_profile_id,
              rating: rating.rating,
              comment: rating.comment ?? null,
            })),
          }
        : undefined,
    };
  }

  async submitFeedback(
    activityId: string,
    user: AuthenticatedUser,
    dto: CreateActivityFeedbackDto,
  ): Promise<FeedbackSubmissionSummary> {
    const profile = await this.getProfileOrThrow(user.supabaseUserId);
    const activity = await this.getActivityOrThrow(activityId);
    const activityEnded = this.isActivityEnded(activity);

    if (!activityEnded) {
      throw new ForbiddenException('Feedback can only be submitted after the activity ends');
    }

    const isHost = activity.host_id === user.supabaseUserId;
    const participant = await this.prisma.activityParticipant.findUnique({
      where: {
        activity_id_profile_id: { activity_id: activityId, profile_id: profile.id },
      },
      select: { status: true },
    });

    if (!isHost && participant?.status !== 'confirmed') {
      throw new ForbiddenException('Only confirmed participants can leave feedback');
    }

    if (!dto.consentToAnalysis) {
      throw new BadRequestException('Consent is required to submit feedback');
    }

    const existing = await this.prisma.activityFeedback.findUnique({
      where: { activity_id_author_profile_id: { activity_id: activityId, author_profile_id: profile.id } },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Feedback has already been submitted');
    }

    const participantRatings = this.normalizeParticipantRatings(dto.participantRatings);
    const validTargets = await this.getValidRatingTargets(activity, profile.id);

    for (const rating of participantRatings) {
      if (rating.profileId === profile.id) {
        throw new BadRequestException('You cannot rate yourself');
      }
      if (!validTargets.has(rating.profileId)) {
        throw new BadRequestException('Ratings must target participants in this activity');
      }
    }

    const [feedback, ratings] = await this.prisma.$transaction(async (tx) => {
      const createdFeedback = await tx.activityFeedback.create({
        data: {
          activity_id: activityId,
          author_profile_id: profile.id,
          rating: dto.rating,
          comment: this.normalizeComment(dto.comment),
          consent_to_analysis: dto.consentToAnalysis,
        },
      });

      if (participantRatings.length === 0) {
        return [createdFeedback, []] as const;
      }

      const lowRatingTargets = Array.from(
        new Set(participantRatings.filter((item) => item.rating <= LOW_RATING_THRESHOLD).map((item) => item.profileId)),
      );

      const createRows = participantRatings.map((item) => ({
        activity_id: activityId,
        feedback_id: createdFeedback.id,
        reviewer_profile_id: profile.id,
        target_profile_id: item.profileId,
        rating: item.rating,
        comment: item.comment,
        flagged_for_review: false,
      }));

      await tx.activityParticipantRating.createMany({ data: createRows });

      for (const targetProfileId of lowRatingTargets) {
        const lowRatingCount = await tx.activityParticipantRating.count({
          where: {
            target_profile_id: targetProfileId,
            rating: { lte: LOW_RATING_THRESHOLD },
          },
        });

        if (lowRatingCount >= LOW_RATING_REVIEW_COUNT) {
          await tx.activityParticipantRating.updateMany({
            where: {
              feedback_id: createdFeedback.id,
              target_profile_id: targetProfileId,
              rating: { lte: LOW_RATING_THRESHOLD },
            },
            data: { flagged_for_review: true },
          });
        }
      }

      return [createdFeedback, createRows] as const;
    });

    return {
      rating: feedback.rating,
      comment: feedback.comment ?? null,
      consentToAnalysis: feedback.consent_to_analysis,
      participantRatings: ratings.map((item) => ({
        profileId: item.target_profile_id,
        rating: item.rating,
        comment: item.comment ?? null,
      })),
    };
  }

  async getUserRatingSummary(
    activityId: string,
    profileId: string,
    viewer: AuthenticatedUser,
  ): Promise<UserRatingSummary> {
    if (!isPremium(viewer)) {
      throw new ForbiddenException('Only premium members can view user ratings');
    }

    const activity = await this.getActivityOrThrow(activityId);
    await this.assertViewerInActivity(activity.id, viewer.supabaseUserId);
    await this.assertTargetInActivity(activity, profileId);

    return this.computeUserRatingSummary(profileId);
  }

  private async getProfileOrThrow(supabaseUserId?: string | null) {
    if (!supabaseUserId) {
      throw new BadRequestException('supabaseUserId is required');
    }

    const profile = await this.prisma.user_profiles.findUnique({
      where: { user_id: supabaseUserId },
      select: { id: true, user_id: true, full_name: true, profile_picture_url: true },
    });

    if (!profile) {
      throw new BadRequestException('Complete your profile before leaving feedback');
    }

    return profile;
  }

  private async getActivityOrThrow(activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        host_id: true,
        status: true,
        activity_date: true,
        start_time: true,
        end_time: true,
        timezone_name: true,
      },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${activityId} not found`);
    }

    return activity;
  }

  private async getParticipantsForRating(
    activity: { id: string; host_id: string },
    viewerProfileId: string,
    includeRatingSummary: boolean,
  ): Promise<FeedbackParticipantSummary[]> {
    const [participants, hostProfile] = await Promise.all([
      this.prisma.activityParticipant.findMany({
        where: { activity_id: activity.id, status: 'confirmed' },
        include: {
          profile: {
            select: { id: true, user_id: true, full_name: true, profile_picture_url: true },
          },
        },
      }),
      this.prisma.user_profiles.findUnique({
        where: { user_id: activity.host_id },
        select: { id: true, user_id: true, full_name: true, profile_picture_url: true },
      }),
    ]);

    const summaries: FeedbackParticipantSummary[] = participants.map((participant) => ({
      profileId: participant.profile.id,
      supabaseUserId: participant.profile.user_id,
      fullName: participant.profile.full_name,
      avatarUrl: participant.profile.profile_picture_url,
      isHost: participant.profile.user_id === activity.host_id,
    }));

    if (hostProfile && !summaries.some((item) => item.profileId === hostProfile.id)) {
      summaries.push({
        profileId: hostProfile.id,
        supabaseUserId: hostProfile.user_id,
        fullName: hostProfile.full_name,
        avatarUrl: hostProfile.profile_picture_url,
        isHost: true,
      });
    }

    const filtered = summaries.filter((participant) => participant.profileId !== viewerProfileId);

    if (!includeRatingSummary) {
      return filtered;
    }

    const summariesWithRatings = await Promise.all(
      filtered.map(async (participant) => ({
        ...participant,
        ratingSummary: await this.computeUserRatingSummary(participant.profileId),
      })),
    );

    return summariesWithRatings;
  }

  private async getValidRatingTargets(activity: { id: string; host_id: string }, viewerProfileId: string) {
    const participants = await this.prisma.activityParticipant.findMany({
      where: { activity_id: activity.id, status: 'confirmed' },
      select: { profile_id: true },
    });

    const validTargets = new Set(participants.map((participant) => participant.profile_id));

    const hostProfile = await this.prisma.user_profiles.findUnique({
      where: { user_id: activity.host_id },
      select: { id: true },
    });

    if (hostProfile) {
      validTargets.add(hostProfile.id);
    }

    validTargets.delete(viewerProfileId);
    return validTargets;
  }

  private normalizeParticipantRatings(input?: CreateActivityFeedbackDto['participantRatings']) {
    if (!input || input.length === 0) {
      return [];
    }

    const deduped = new Map<string, { profileId: string; rating: number; comment: string | null }>();
    for (const item of input) {
      const normalizedComment = this.normalizeComment(item.comment);
      deduped.set(item.profileId, {
        profileId: item.profileId,
        rating: item.rating,
        comment: normalizedComment,
      });
    }
    return Array.from(deduped.values());
  }

  private normalizeComment(comment?: string | null) {
    const trimmed = comment?.trim();
    return trimmed ? trimmed : null;
  }

  private isActivityEnded(activity: {
    status: string;
    activity_date: Date;
    start_time: Date;
    end_time: Date | null;
    timezone_name?: string | null;
  }) {
    if (activity.status === 'completed') {
      return true;
    }
    const endDateTime = this.buildActivityDateTime(
      activity.activity_date,
      activity.end_time ?? activity.start_time,
      activity.timezone_name ?? undefined,
    );
    return Date.now() >= endDateTime.getTime();
  }

  private buildActivityDateTime(activityDate: Date, time: Date | string, timezoneName?: string): Date {
    const { hours, minutes, seconds } = this.parseActivityTime(time);
    const year = activityDate.getUTCFullYear();
    const month = activityDate.getUTCMonth();
    const day = activityDate.getUTCDate();
    const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds, 0));

    if (!timezoneName) {
      return utcDate;
    }

    return this.applyTimeZoneOffset(utcDate, timezoneName);
  }

  private parseActivityTime(time: Date | string): { hours: number; minutes: number; seconds: number } {
    if (typeof time !== 'string') {
      if (Number.isNaN(time.getTime())) {
        this.logger.warn('Invalid time value received for activity time; defaulting to 00:00:00');
        return { hours: 0, minutes: 0, seconds: 0 };
      }
      return {
        hours: time.getHours(),
        minutes: time.getMinutes(),
        seconds: time.getSeconds(),
      };
    }

    const trimmed = time.trim();
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
    if (!match) {
      this.logger.warn(`Invalid time string "${time}" for activity time; defaulting to 00:00:00`);
      return { hours: 0, minutes: 0, seconds: 0 };
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? '0');

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      Number.isNaN(seconds) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59 ||
      seconds < 0 ||
      seconds > 59
    ) {
      this.logger.warn(`Out-of-range time string "${time}" for activity time; defaulting to 00:00:00`);
      return { hours: 0, minutes: 0, seconds: 0 };
    }

    return { hours, minutes, seconds };
  }

  private applyTimeZoneOffset(utcDate: Date, timezoneName: string): Date {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezoneName,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(utcDate);
      const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
      const zonedYear = Number(lookup('year'));
      const zonedMonth = Number(lookup('month')) - 1;
      const zonedDay = Number(lookup('day'));
      const zonedHour = Number(lookup('hour'));
      const zonedMinute = Number(lookup('minute'));
      const zonedSecond = Number(lookup('second'));

      const zonedAsUtc = Date.UTC(zonedYear, zonedMonth, zonedDay, zonedHour, zonedMinute, zonedSecond);
      const offsetMs = zonedAsUtc - utcDate.getTime();

      return new Date(utcDate.getTime() - offsetMs);
    } catch (error) {
      this.logger.warn(`Failed to apply timezone ${timezoneName}; falling back to UTC time`, error as Error);
      return utcDate;
    }
  }

  private async computeUserRatingSummary(profileId: string): Promise<UserRatingSummary> {
    const recentActivities = await this.prisma.activityParticipant.findMany({
      where: { profile_id: profileId, status: 'confirmed' },
      select: { activity_id: true },
      orderBy: { activity: { activity_date: 'desc' } },
      take: 10,
    });

    const activityIds = recentActivities.map((item) => item.activity_id);
    if (activityIds.length === 0) {
      return { averageRating: null, ratingsCount: 0, activityCount: 0 };
    }

    const ratings = await this.prisma.activityParticipantRating.findMany({
      where: { target_profile_id: profileId, activity_id: { in: activityIds } },
      select: { rating: true },
    });

    if (ratings.length === 0) {
      return { averageRating: null, ratingsCount: 0, activityCount: activityIds.length };
    }

    const total = ratings.reduce((sum, item) => sum + item.rating, 0);
    const average = total / ratings.length;

    return {
      averageRating: Number(average.toFixed(2)),
      ratingsCount: ratings.length,
      activityCount: activityIds.length,
    };
  }

  private async assertViewerInActivity(activityId: string, supabaseUserId?: string | null) {
    if (!supabaseUserId) {
      throw new ForbiddenException('Missing user identifier');
    }

    const [profile, activity] = await Promise.all([
      this.prisma.user_profiles.findUnique({
        where: { user_id: supabaseUserId },
        select: { id: true },
      }),
      this.prisma.activity.findUnique({
        where: { id: activityId },
        select: { host_id: true },
      }),
    ]);

    if (!profile || !activity) {
      throw new ForbiddenException('Access denied');
    }

    if (activity.host_id === supabaseUserId) {
      return;
    }

    const participant = await this.prisma.activityParticipant.findUnique({
      where: {
        activity_id_profile_id: { activity_id: activityId, profile_id: profile.id },
      },
      select: { id: true },
    });

    if (!participant) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async assertTargetInActivity(
    activity: { id: string; host_id: string },
    targetProfileId: string,
  ) {
    const targetProfile = await this.prisma.user_profiles.findUnique({
      where: { id: targetProfileId },
      select: { user_id: true },
    });

    if (targetProfile?.user_id === activity.host_id) {
      return;
    }

    const participant = await this.prisma.activityParticipant.findUnique({
      where: {
        activity_id_profile_id: { activity_id: activity.id, profile_id: targetProfileId },
      },
      select: { id: true },
    });

    if (!participant) {
      throw new ForbiddenException('Target user is not part of this activity');
    }
  }
}

