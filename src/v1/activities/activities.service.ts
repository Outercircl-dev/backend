import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import {
  ActivityResponseDto,
  ViewerParticipationMeta,
  ParticipationState,
} from './dto/activity-response.dto';
import { Prisma } from 'src/generated/prisma/client';
import type { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import {
  assertGroupsEnabled,
  assertHostCapacity,
  assertHostMonthlyLimit,
  assertVerifiedHost,
} from './hosting-rules';
import { ActivityMessagesService } from './messages/activity-messages.service';
import { MembershipTiersService } from 'src/config/membership-tiers.service';
import { MembershipSubscriptionsService } from 'src/membership/membership-subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesService: ActivityMessagesService,
    private readonly membershipTiersService: MembershipTiersService,
    private readonly membershipSubscriptionsService: MembershipSubscriptionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateActivityDto,
  ): Promise<ActivityResponseDto> {
    assertVerifiedHost(user);
    if (!user?.supabaseUserId) {
      throw new BadRequestException(
        'supabaseUserId missing from authenticated request',
      );
    }

    const tierKey =
      await this.membershipSubscriptionsService.resolveTierForUserId(
        user.supabaseUserId,
      );
    const tierRules = this.membershipTiersService.getTierRules(tierKey);
    assertHostCapacity(tierRules, dto.maxParticipants);
    // Validate interests exist in the interests table
    if (dto.interests && dto.interests.length > 0) {
      const existingInterests = await this.prisma.interest.findMany({
        where: {
          slug: { in: dto.interests },
        },
        select: { slug: true },
      });

      const existingSlugs = existingInterests.map(
        (interest: { slug: string }) => interest.slug,
      );
      const invalidInterests = dto.interests.filter(
        (slug: string) => !existingSlugs.includes(slug),
      );

      if (invalidInterests.length > 0) {
        throw new BadRequestException(
          `Invalid interest slugs: ${invalidInterests.join(', ')}`,
        );
      }
    }

    // Parse activity date (DTO already validates format via @IsDateString)
    const activityDate = new Date(dto.activityDate);
    const timezone = dto.timezone ?? 'UTC';
    this.assertStartDateTimeIsInFuture(
      dto.activityDate,
      dto.startTime,
      timezone,
    );

    // Validate end time is after start time (including seconds)
    const startTimeParts = dto.startTime.split(':');
    const endTimeParts = dto.endTime.split(':');
    const startSeconds =
      parseInt(startTimeParts[0]) * 3600 +
      parseInt(startTimeParts[1]) * 60 +
      parseInt(startTimeParts[2] || '0');
    const endSeconds =
      parseInt(endTimeParts[0]) * 3600 +
      parseInt(endTimeParts[1]) * 60 +
      parseInt(endTimeParts[2] || '0');
    if (endSeconds <= startSeconds) {
      throw new BadRequestException('End time must be after start time');
    }

    // Convert time strings to Date objects for Prisma Time fields
    // Prisma Time fields expect Date objects with time components set
    const startTimeDate = this.convertTimeStringToDate(dto.startTime);
    const endTimeDate = this.convertTimeStringToDate(dto.endTime);

    if (tierRules.hosting.maxHostsPerMonth !== null) {
      const { start, end } = this.getMonthRange(new Date());
      const hostedCount = await this.prisma.activity.count({
        where: {
          host_id: user.supabaseUserId,
          created_at: {
            gte: start,
            lt: end,
          },
        },
      });
      assertHostMonthlyLimit(tierRules, hostedCount);
    }

    const profile = await this.getProfileForUser(user.supabaseUserId);

    let groupId: string | null = null;
    if (dto.groupId) {
      assertGroupsEnabled(tierRules);
      const group = await this.prisma.activityGroup.findUnique({
        where: { id: dto.groupId },
        select: { id: true, owner_profile_id: true },
      });
      if (!group) {
        throw new BadRequestException('Group not found');
      }
      const membership = await this.prisma.activityGroupMember.findUnique({
        where: {
          group_id_profile_id: {
            group_id: dto.groupId,
            profile_id: profile.id,
          },
        },
      });
      if (!membership && group.owner_profile_id !== profile.id) {
        throw new ForbiddenException('You are not a member of this group');
      }
      groupId = dto.groupId;
    }

    let seriesId: string | null = null;
    if (dto.recurrence) {
      const series = await this.prisma.activitySeries.create({
        data: {
          owner_profile_id: profile.id,
          frequency: dto.recurrence.frequency,
          interval: dto.recurrence.interval,
          ends_on: dto.recurrence.endsOn
            ? new Date(dto.recurrence.endsOn)
            : null,
          occurrences: dto.recurrence.occurrences ?? null,
        },
      });
      seriesId = series.id;
    }

    // Create activity with default status 'published' so members can join immediately.
    const activity = await this.prisma.activity.create({
      data: {
        host_id: user.supabaseUserId,
        title: dto.title,
        description: dto.description || null,
        image_url: dto.imageUrl || null,
        category: dto.category,
        interests: dto.interests,
        location: dto.location as any, // Cast to any for Prisma JSON type
        activity_date: activityDate,
        start_time: startTimeDate,
        end_time: endTimeDate,
        max_participants: dto.maxParticipants,
        current_participants: 0,
        status: 'published' as const,
        is_public: dto.isPublic ?? true,
        group: groupId ? { connect: { id: groupId } } : undefined,
        series: seriesId ? { connect: { id: seriesId } } : undefined,
      },
    });

    return this.mapToResponseDto(activity, user.supabaseUserId);
  }

  async findAll(
    filters?: {
      status?: string;
      hostId?: string;
      page?: number;
      limit?: number;
    },
    viewerId?: string,
  ): Promise<{
    items: ActivityResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityWhereInput = {};
    if (filters?.status) {
      // Validate and cast status to enum type
      const validStatuses = [
        'draft',
        'published',
        'completed',
        'cancelled',
      ] as const;
      if (validStatuses.includes(filters.status as any)) {
        where.status = filters.status as any; // Cast to any to satisfy Prisma enum type
      } else {
        throw new BadRequestException(
          `Invalid status: ${filters.status}. Must be one of: ${validStatuses.join(', ')}`,
        );
      }
    }
    if (filters?.hostId) {
      where.host_id = filters.hostId;
    }

    const [activities, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.activity.count({ where }),
    ]);

    const items = await Promise.all(
      activities.map((item: any) => this.mapToResponseDto(item, viewerId)),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, viewerId?: string): Promise<ActivityResponseDto> {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    return this.mapToResponseDto(activity, viewerId);
  }

  async findJoinedPast(
    user: AuthenticatedUser,
    page = 1,
    limit = 20,
  ): Promise<{
    items: ActivityResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    if (!user?.supabaseUserId) {
      throw new BadRequestException(
        'supabaseUserId missing from authenticated request',
      );
    }
    const profile = await this.getProfileForUser(user.supabaseUserId);
    const where: Prisma.ActivityParticipantWhereInput = {
      profile_id: profile.id,
      status: {
        in: ['pending', 'confirmed', 'waitlisted'],
      },
    };

    const participations = await this.prisma.activityParticipant.findMany({
      where,
      orderBy: [{ activity: { activity_date: 'desc' } }, { joined_at: 'desc' }],
      include: {
        activity: true,
      },
    });

    const pastParticipations = participations.filter((item) =>
      this.isActivityPast(item.activity),
    );
    const total = pastParticipations.length;
    const skip = (page - 1) * limit;
    const pagedParticipations = pastParticipations.slice(skip, skip + limit);

    const items = await Promise.all(
      pagedParticipations.map((item) =>
        this.mapToResponseDto(item.activity, user.supabaseUserId),
      ),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateActivityDto,
  ): Promise<ActivityResponseDto> {
    assertVerifiedHost(user);
    if (!user?.supabaseUserId) {
      throw new BadRequestException(
        'supabaseUserId missing from authenticated request',
      );
    }
    // Check if activity exists
    const existing = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    // Check if user is the host
    if (existing.host_id !== user.supabaseUserId) {
      throw new ForbiddenException('You can only update your own activities');
    }

    if (this.hasActivityStarted(existing)) {
      throw new ForbiddenException(
        'Activity has already started and can no longer be edited',
      );
    }

    // Validate interests if provided
    if (dto.interests && dto.interests.length > 0) {
      const existingInterests = await this.prisma.interest.findMany({
        where: {
          slug: { in: dto.interests },
        },
        select: { slug: true },
      });

      const existingSlugs = existingInterests.map(
        (interest: { slug: string }) => interest.slug,
      );
      const invalidInterests = dto.interests.filter(
        (slug: string) => !existingSlugs.includes(slug),
      );

      if (invalidInterests.length > 0) {
        throw new BadRequestException(
          `Invalid interest slugs: ${invalidInterests.join(', ')}`,
        );
      }
    }

    // Parse activity date (DTO already validates format via @IsDateString)
    const activityDate = new Date(dto.activityDate);

    // Handle times
    const startTime = this.convertTimeStringToDate(dto.startTime);
    const endTime = dto.endTime
      ? this.convertTimeStringToDate(dto.endTime)
      : existing.end_time;

    // Validate end time is after start time (including seconds)
    if (dto.endTime) {
      const startTimeParts = dto.startTime.split(':');
      const endTimeParts = dto.endTime.split(':');
      const startSeconds =
        parseInt(startTimeParts[0]) * 3600 +
        parseInt(startTimeParts[1]) * 60 +
        parseInt(startTimeParts[2] || '0');
      const endSeconds =
        parseInt(endTimeParts[0]) * 3600 +
        parseInt(endTimeParts[1]) * 60 +
        parseInt(endTimeParts[2] || '0');
      if (endSeconds <= startSeconds) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    const changeNotes: string[] = [];
    let hasTimeChange = false;
    let hasLocationChange = false;
    let hasNonScheduleDetailChange = false;
    if (dto.title.trim() !== existing.title.trim()) {
      changeNotes.push('title updated');
      hasNonScheduleDetailChange = true;
    }
    if ((dto.description ?? null) !== (existing.description ?? null)) {
      changeNotes.push('description updated');
      hasNonScheduleDetailChange = true;
    }
    if ((dto.imageUrl ?? null) !== (existing.image_url ?? null)) {
      changeNotes.push('image updated');
      hasNonScheduleDetailChange = true;
    }
    if ((dto.category ?? null) !== (existing.category ?? null)) {
      changeNotes.push('category updated');
      hasNonScheduleDetailChange = true;
    }
    if (JSON.stringify(dto.interests) !== JSON.stringify(existing.interests)) {
      changeNotes.push('interests updated');
      hasNonScheduleDetailChange = true;
    }
    if (dto.maxParticipants !== existing.max_participants) {
      changeNotes.push('participant limit updated');
      hasNonScheduleDetailChange = true;
    }
    if (dto.isPublic !== undefined && dto.isPublic !== existing.is_public) {
      changeNotes.push('visibility updated');
      hasNonScheduleDetailChange = true;
    }
    if (
      dto.activityDate &&
      activityDate.toISOString().split('T')[0] !==
        existing.activity_date.toISOString().split('T')[0]
    ) {
      changeNotes.push('date updated');
      hasTimeChange = true;
    }
    if (
      dto.startTime &&
      this.convertDateToTimeString(startTime) !==
        this.convertDateToTimeString(existing.start_time)
    ) {
      changeNotes.push('start time updated');
      hasTimeChange = true;
    }
    if (dto.endTime) {
      const existingEnd = existing.end_time
        ? this.convertDateToTimeString(existing.end_time)
        : null;
      const nextEnd = endTime ? this.convertDateToTimeString(endTime) : null;
      if (existingEnd !== nextEnd) {
        changeNotes.push('end time updated');
        hasTimeChange = true;
      }
    }
    if (
      dto.location &&
      JSON.stringify(dto.location) !== JSON.stringify(existing.location)
    ) {
      changeNotes.push('location updated');
      hasLocationChange = true;
    }

    // Build update data
    const updateData: Prisma.ActivityUpdateInput = {
      title: dto.title,
      description: dto.description || null,
      image_url: dto.imageUrl || null,
      category: dto.category,
      interests: dto.interests,
      location: dto.location as any, // Cast to any for Prisma JSON type
      activity_date: activityDate,
      start_time: startTime,
      end_time: endTime,
    };
    const tierKey =
      await this.membershipSubscriptionsService.resolveTierForUserId(
        user.supabaseUserId,
      );
    const tierRules = this.membershipTiersService.getTierRules(tierKey);
    assertHostCapacity(tierRules, dto.maxParticipants);
    updateData.max_participants = dto.maxParticipants;
    if (dto.isPublic !== undefined) updateData.is_public = dto.isPublic;
    if (dto.groupId !== undefined) {
      if (dto.groupId === null) {
        updateData.group = { disconnect: true };
      } else {
        assertGroupsEnabled(tierRules);
        const profile = await this.getProfileForUser(user.supabaseUserId);
        const group = await this.prisma.activityGroup.findUnique({
          where: { id: dto.groupId },
          select: { id: true, owner_profile_id: true },
        });
        if (!group) {
          throw new BadRequestException('Group not found');
        }
        const membership = await this.prisma.activityGroupMember.findUnique({
          where: {
            group_id_profile_id: {
              group_id: dto.groupId,
              profile_id: profile.id,
            },
          },
        });
        if (!membership && group.owner_profile_id !== profile.id) {
          throw new ForbiddenException('You are not a member of this group');
        }
        updateData.group = { connect: { id: dto.groupId } };
      }
    }

    if (dto.recurrence !== undefined) {
      const profile = await this.getProfileForUser(user.supabaseUserId);
      if (dto.recurrence === null) {
        updateData.series = { disconnect: true };
      } else {
        const series = await this.prisma.activitySeries.create({
          data: {
            owner_profile_id: profile.id,
            frequency: dto.recurrence.frequency,
            interval: dto.recurrence.interval,
            ends_on: dto.recurrence.endsOn
              ? new Date(dto.recurrence.endsOn)
              : null,
            occurrences: dto.recurrence.occurrences ?? null,
          },
        });
        updateData.series = { connect: { id: series.id } };
      }
    }

    const activity = await this.prisma.activity.update({
      where: { id },
      data: updateData,
    });

    if (changeNotes.length > 0) {
      await this.messagesService.createSystemMessage(
        activity.id,
        `Activity details updated: ${changeNotes.join(', ')}.`,
        { changes: changeNotes },
      );
    }

    if (hasTimeChange || hasLocationChange) {
      await this.notifyParticipantsOfScheduleChange(
        activity,
        user.supabaseUserId,
        {
          hasTimeChange,
          hasLocationChange,
        },
      );
    }
    if (hasNonScheduleDetailChange) {
      await this.notifyParticipantsOfDetailChanges(
        activity,
        user.supabaseUserId,
        changeNotes,
      );
    }

    return this.mapToResponseDto(activity, user.supabaseUserId);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    assertVerifiedHost(user);
    if (!user?.supabaseUserId) {
      throw new BadRequestException(
        'supabaseUserId missing from authenticated request',
      );
    }
    const activity = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    if (activity.host_id !== user.supabaseUserId) {
      throw new ForbiddenException('You can only delete your own activities');
    }

    await this.prisma.activity.delete({
      where: { id },
    });
  }

  private hasActivityStarted(activity: {
    activity_date: Date;
    start_time: Date | string;
  }): boolean {
    const start = this.buildActivityStart(
      activity.activity_date,
      activity.start_time,
    );
    return start.getTime() <= Date.now();
  }

  private isActivityPast(activity: {
    status: 'draft' | 'published' | 'completed' | 'cancelled';
    activity_date: Date;
    start_time: Date | string;
    end_time?: Date | string | null;
  }): boolean {
    if (activity.status === 'completed' || activity.status === 'cancelled') {
      return true;
    }
    const reference = this.buildActivityStart(
      activity.activity_date,
      activity.end_time ?? activity.start_time,
    );
    return reference.getTime() <= Date.now();
  }

  private buildActivityStart(
    activityDate: Date,
    startTime: Date | string,
  ): Date {
    const date = new Date(activityDate);
    if (typeof startTime === 'string') {
      const [hours, minutes, seconds = '0'] = startTime.split(':');
      date.setHours(
        parseInt(hours, 10),
        parseInt(minutes, 10),
        parseInt(seconds, 10),
        0,
      );
      return date;
    }
    date.setHours(
      startTime.getHours(),
      startTime.getMinutes(),
      startTime.getSeconds(),
      0,
    );
    return date;
  }

  private getMonthRange(reference: Date): { start: Date; end: Date } {
    const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
    return { start, end };
  }

  private async getProfileForUser(supabaseUserId: string) {
    const profile = await this.prisma.user_profiles.findUnique({
      where: { user_id: supabaseUserId },
      select: { id: true },
    });
    if (!profile) {
      throw new BadRequestException(
        'Complete your profile before hosting activities',
      );
    }
    return profile;
  }

  private async mapToResponseDto(
    activity: any,
    viewerId?: string,
  ): Promise<ActivityResponseDto> {
    const [
      confirmedCount,
      waitlistCount,
      viewerProfile,
      group,
      series,
      hostProfile,
    ] = await Promise.all([
      this.prisma.activityParticipant.count({
        where: { activity_id: activity.id, status: 'confirmed' },
      }),
      this.prisma.activityParticipant.count({
        where: { activity_id: activity.id, status: 'waitlisted' },
      }),
      viewerId
        ? this.prisma.user_profiles.findUnique({
            where: { user_id: viewerId },
            select: { id: true },
          })
        : Promise.resolve(null),
      activity.group_id
        ? this.prisma.activityGroup.findUnique({
            where: { id: activity.group_id },
            select: { id: true, name: true, is_public: true },
          })
        : Promise.resolve(null),
      activity.series_id
        ? this.prisma.activitySeries.findUnique({
            where: { id: activity.series_id },
            select: {
              id: true,
              frequency: true,
              interval: true,
              ends_on: true,
              occurrences: true,
            },
          })
        : Promise.resolve(null),
      this.prisma.user_profiles.findUnique({
        where: { user_id: activity.host_id },
        select: { username: true, full_name: true },
      }),
    ]);

    let viewerParticipation: any | null = null;
    if (viewerProfile) {
      viewerParticipation = await this.prisma.activityParticipant.findUnique({
        where: {
          activity_id_profile_id: {
            activity_id: activity.id,
            profile_id: viewerProfile.id,
          },
        },
      });
    }

    const viewerMeta = this.formatViewerParticipation(viewerParticipation);
    const canSeeLocation =
      (viewerId && activity.host_id === viewerId) ||
      (viewerParticipation && viewerParticipation.status === 'confirmed');

    const response: ActivityResponseDto = {
      id: activity.id,
      hostId: activity.host_id,
      hostUsername: hostProfile?.username ?? null,
      hostName: hostProfile?.full_name ?? null,
      title: activity.title,
      description: activity.description,
      imageUrl: activity.image_url ?? null,
      category: activity.category,
      interests: activity.interests as string[],
      location: this.prepareLocationForViewer(
        activity.location,
        Boolean(canSeeLocation),
      ),
      activityDate: activity.activity_date.toISOString().split('T')[0],
      startTime: this.convertDateToTimeString(activity.start_time),
      endTime: activity.end_time
        ? this.convertDateToTimeString(activity.end_time)
        : null,
      maxParticipants: activity.max_participants,
      currentParticipants: confirmedCount,
      waitlistCount,
      status: activity.status,
      isPublic: activity.is_public,
      group: group
        ? {
            id: group.id,
            name: group.name,
            isPublic: group.is_public,
          }
        : null,
      recurrence: series
        ? {
            id: series.id,
            frequency: series.frequency,
            interval: series.interval,
            endsOn: series.ends_on
              ? series.ends_on.toISOString().split('T')[0]
              : null,
            occurrences: series.occurrences ?? null,
          }
        : null,
      createdAt: activity.created_at,
      updatedAt: activity.updated_at,
      meetingPointHidden: !canSeeLocation,
    };

    if (viewerMeta) {
      response.viewerParticipation = viewerMeta;
    }

    return response;
  }

  private prepareLocationForViewer(
    rawLocation: any,
    revealExactLocation: boolean,
  ): { latitude: number; longitude: number; address?: string; placeId?: string } {
    if (!rawLocation) {
      return { latitude: 0, longitude: 0 };
    }

    const location = rawLocation as {
      latitude: number;
      longitude: number;
      address?: string;
      placeId?: string;
    };
    if (revealExactLocation) {
      return location;
    }

    const { address: _address, ...rest } = location;
    return {
      ...rest,
      latitude: this.roundCoordinate(location.latitude, 2),
      longitude: this.roundCoordinate(location.longitude, 2),
    };
  }

  private roundCoordinate(value: number, decimals: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private formatViewerParticipation(
    participation: any | null,
  ): ViewerParticipationMeta | undefined {
    if (!participation) {
      return undefined;
    }

    if (participation.status === 'cancelled') {
      return undefined;
    }

    return {
      participantId: participation.id,
      status: participation.status as ParticipationState,
      waitlistPosition: participation.waitlist_position ?? null,
      joinedAt: participation.joined_at ?? null,
      approvedAt: participation.approved_at ?? null,
    };
  }

  private async notifyParticipantsOfScheduleChange(
    activity: { id: string; title: string },
    hostUserId: string,
    flags: { hasTimeChange: boolean; hasLocationChange: boolean },
  ) {
    const recipientUserIds = await this.getParticipantRecipientUserIds(
      activity.id,
      hostUserId,
    );

    if (recipientUserIds.length === 0) {
      return;
    }

    if (flags.hasTimeChange) {
      await this.notificationsService.createForRecipients(recipientUserIds, {
        actorUserId: hostUserId,
        activityId: activity.id,
        type: 'activity_time_changed',
        title: 'Activity time updated',
        body: `The host updated the date/time for "${activity.title}".`,
      });
    }

    if (flags.hasLocationChange) {
      await this.notificationsService.createForRecipients(recipientUserIds, {
        actorUserId: hostUserId,
        activityId: activity.id,
        type: 'activity_location_changed',
        title: 'Activity location updated',
        body: `The host updated the location for "${activity.title}".`,
      });
    }
  }

  private async notifyParticipantsOfDetailChanges(
    activity: { id: string; title: string },
    hostUserId: string,
    changeNotes: string[],
  ) {
    const recipientUserIds = await this.getParticipantRecipientUserIds(
      activity.id,
      hostUserId,
    );

    if (recipientUserIds.length === 0) {
      return;
    }

    await this.notificationsService.createForRecipients(recipientUserIds, {
      actorUserId: hostUserId,
      activityId: activity.id,
      type: 'host_update',
      title: 'Activity details updated',
      body: `The host updated activity details for "${activity.title}".`,
      payload: {
        changes: changeNotes,
      },
    });
  }

  private async getParticipantRecipientUserIds(
    activityId: string,
    hostUserId: string,
  ): Promise<string[]> {
    const participants = await this.prisma.activityParticipant.findMany({
      where: {
        activity_id: activityId,
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

    return participants
      .map((participant) => participant.profile.user_id)
      .filter((userId) => userId !== hostUserId);
  }

  /**
   * Convert time string (HH:mm or HH:mm:ss) to Date object for Prisma Time field
   */
  private convertTimeStringToDate(timeString: string): Date {
    const [hours, minutes, seconds = '0'] = timeString.split(':');
    const date = new Date();
    date.setHours(
      parseInt(hours, 10),
      parseInt(minutes, 10),
      parseInt(seconds, 10),
      0,
    );
    return date;
  }

  /**
   * Convert Date object or time string (from Prisma Time field) to time string (HH:mm:ss)
   * Handles both Date objects and string formats for flexibility
   */
  private convertDateToTimeString(date: Date | string): string {
    // If it's already a string, return it (ensuring HH:mm:ss format)
    if (typeof date === 'string') {
      const parts = date.split(':');
      if (parts.length === 2) {
        // HH:mm format, add seconds
        return `${parts[0]}:${parts[1]}:00`;
      }
      // Already in HH:mm:ss format
      return date;
    }

    // It's a Date object
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  private assertStartDateTimeIsInFuture(
    activityDate: string,
    startTime: string,
    timezone: string,
  ): void {
    if (!this.isValidIanaTimezone(timezone)) {
      throw new BadRequestException(
        'Invalid timezone. Please use a valid IANA timezone identifier.',
      );
    }

    const now = new Date();
    const currentDateInTimezone = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const currentTimeInTimezone = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);

    const targetTime = this.normalizeTimeString(startTime);
    if (
      activityDate < currentDateInTimezone ||
      (activityDate === currentDateInTimezone &&
        targetTime <= currentTimeInTimezone)
    ) {
      throw new BadRequestException(
        'Activity start date/time must be in the future',
      );
    }
  }

  private isValidIanaTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  private normalizeTimeString(timeString: string): string {
    const [hours, minutes, seconds = '00'] = timeString.split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
  }
}
