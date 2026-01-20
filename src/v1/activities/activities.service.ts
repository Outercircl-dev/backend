import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityResponseDto, ViewerParticipationMeta, ParticipationState } from './dto/activity-response.dto';
import { Prisma } from 'src/generated/prisma/client';
import type { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import { assertHostCapacity, assertVerifiedHost, FREE_MAX_HOSTS_PER_MONTH, isPremium } from './hosting-rules';
import { ActivityMessagesService } from './messages/activity-messages.service';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesService: ActivityMessagesService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateActivityDto): Promise<ActivityResponseDto> {
    assertVerifiedHost(user);
    if (!user?.supabaseUserId) {
      throw new BadRequestException('supabaseUserId missing from authenticated request');
    }

    assertHostCapacity(user, dto.maxParticipants);
    // Validate interests exist in the interests table
    if (dto.interests && dto.interests.length > 0) {
      const existingInterests = await this.prisma.interest.findMany({
        where: {
          slug: { in: dto.interests },
        },
        select: { slug: true },
      });

      const existingSlugs = existingInterests.map((interest: { slug: string }) => interest.slug);
      const invalidInterests = dto.interests.filter((slug: string) => !existingSlugs.includes(slug));

      if (invalidInterests.length > 0) {
        throw new BadRequestException(
          `Invalid interest slugs: ${invalidInterests.join(', ')}`,
        );
      }
    }

    // Parse activity date (DTO already validates format via @IsDateString)
    const activityDate = new Date(dto.activityDate);

    // Validate end time is after start time (including seconds)
    if (dto.endTime) {
      const startTimeParts = dto.startTime.split(':');
      const endTimeParts = dto.endTime.split(':');
      const startSeconds = parseInt(startTimeParts[0]) * 3600 + 
                          parseInt(startTimeParts[1]) * 60 + 
                          (parseInt(startTimeParts[2] || '0'));
      const endSeconds = parseInt(endTimeParts[0]) * 3600 + 
                        parseInt(endTimeParts[1]) * 60 + 
                        (parseInt(endTimeParts[2] || '0'));
      if (endSeconds <= startSeconds) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    // Convert time strings to Date objects for Prisma Time fields
    // Prisma Time fields expect Date objects with time components set
    const startTimeDate = this.convertTimeStringToDate(dto.startTime);
    const endTimeDate = dto.endTime ? this.convertTimeStringToDate(dto.endTime) : null;

    if (!isPremium(user)) {
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
      if (hostedCount >= FREE_MAX_HOSTS_PER_MONTH) {
        throw new ForbiddenException(`Free tier hosts may only create ${FREE_MAX_HOSTS_PER_MONTH} activities per month`);
      }
    }

    const profile = await this.getProfileForUser(user.supabaseUserId);

    let groupId: string | null = null;
    if (dto.groupId) {
      if (!isPremium(user)) {
        throw new ForbiddenException('Only premium hosts can use groups');
      }
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
          ends_on: dto.recurrence.endsOn ? new Date(dto.recurrence.endsOn) : null,
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
  ): Promise<{ items: ActivityResponseDto[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityWhereInput = {};
    if (filters?.status) {
      // Validate and cast status to enum type
      const validStatuses = ['draft', 'published', 'completed', 'cancelled'] as const;
      if (validStatuses.includes(filters.status as any)) {
        where.status = filters.status as any; // Cast to any to satisfy Prisma enum type
      } else {
        throw new BadRequestException(`Invalid status: ${filters.status}. Must be one of: ${validStatuses.join(', ')}`);
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

  async update(id: string, user: AuthenticatedUser, dto: UpdateActivityDto): Promise<ActivityResponseDto> {
    assertVerifiedHost(user);
    if (!user?.supabaseUserId) {
      throw new BadRequestException('supabaseUserId missing from authenticated request');
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
      throw new ForbiddenException('Activity has already started and can no longer be edited');
    }

    // Validate interests if provided
    if (dto.interests && dto.interests.length > 0) {
      const existingInterests = await this.prisma.interest.findMany({
        where: {
          slug: { in: dto.interests },
        },
        select: { slug: true },
      });

      const existingSlugs = existingInterests.map((interest: { slug: string }) => interest.slug);
      const invalidInterests = dto.interests.filter((slug: string) => !existingSlugs.includes(slug));

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
    const endTime = dto.endTime ? this.convertTimeStringToDate(dto.endTime) : existing.end_time;

    // Validate end time is after start time (including seconds)
    if (dto.endTime) {
      const startTimeParts = dto.startTime.split(':');
      const endTimeParts = dto.endTime.split(':');
      const startSeconds = parseInt(startTimeParts[0]) * 3600 + 
                          parseInt(startTimeParts[1]) * 60 + 
                          (parseInt(startTimeParts[2] || '0'));
      const endSeconds = parseInt(endTimeParts[0]) * 3600 + 
                        parseInt(endTimeParts[1]) * 60 + 
                        (parseInt(endTimeParts[2] || '0'));
      if (endSeconds <= startSeconds) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    const changeNotes: string[] = [];
    if (dto.activityDate && activityDate.toISOString().split('T')[0] !== existing.activity_date.toISOString().split('T')[0]) {
      changeNotes.push('date updated');
    }
    if (dto.startTime && this.convertDateToTimeString(startTime) !== this.convertDateToTimeString(existing.start_time)) {
      changeNotes.push('start time updated');
    }
    if (dto.endTime) {
      const existingEnd = existing.end_time ? this.convertDateToTimeString(existing.end_time) : null;
      const nextEnd = endTime ? this.convertDateToTimeString(endTime) : null;
      if (existingEnd !== nextEnd) {
        changeNotes.push('end time updated');
      }
    }
    if (dto.location && JSON.stringify(dto.location) !== JSON.stringify(existing.location)) {
      changeNotes.push('location updated');
    }

    // Build update data
    const updateData: Prisma.ActivityUpdateInput = {
      title: dto.title,
      description: dto.description || null,
      category: dto.category,
      interests: dto.interests,
      location: dto.location as any, // Cast to any for Prisma JSON type
      activity_date: activityDate,
      start_time: startTime,
      end_time: endTime,
    };
    assertHostCapacity(user, dto.maxParticipants);
    updateData.max_participants = dto.maxParticipants;
    if (dto.isPublic !== undefined) updateData.is_public = dto.isPublic;
    if (dto.groupId !== undefined) {
      if (dto.groupId === null) {
        updateData.group = { disconnect: true };
      } else {
        if (!isPremium(user)) {
          throw new ForbiddenException('Only premium hosts can use groups');
        }
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
            ends_on: dto.recurrence.endsOn ? new Date(dto.recurrence.endsOn) : null,
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

    return this.mapToResponseDto(activity, user.supabaseUserId);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    assertVerifiedHost(user);
    if (!user?.supabaseUserId) {
      throw new BadRequestException('supabaseUserId missing from authenticated request');
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

  private hasActivityStarted(activity: { activity_date: Date; start_time: Date | string }): boolean {
    const start = this.buildActivityStart(activity.activity_date, activity.start_time);
    return start.getTime() <= Date.now();
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
      throw new BadRequestException('Complete your profile before hosting activities');
    }
    return profile;
  }

  private async mapToResponseDto(activity: any, viewerId?: string): Promise<ActivityResponseDto> {
    const [confirmedCount, waitlistCount, viewerProfile, group, series] = await Promise.all([
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
      title: activity.title,
      description: activity.description,
      category: activity.category,
      interests: activity.interests as string[],
      location: this.prepareLocationForViewer(activity.location, Boolean(canSeeLocation)),
      activityDate: activity.activity_date.toISOString().split('T')[0],
      startTime: this.convertDateToTimeString(activity.start_time),
      endTime: activity.end_time ? this.convertDateToTimeString(activity.end_time) : null,
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
            endsOn: series.ends_on ? series.ends_on.toISOString().split('T')[0] : null,
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
  ): { latitude: number; longitude: number; address?: string } {
    if (!rawLocation) {
      return { latitude: 0, longitude: 0 };
    }

    const location = rawLocation as { latitude: number; longitude: number; address?: string };
    if (revealExactLocation || !location.address) {
      return location;
    }

    const { address, ...rest } = location;
    return rest;
  }

  private formatViewerParticipation(participation: any | null): ViewerParticipationMeta | undefined {
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

  /**
   * Convert time string (HH:mm or HH:mm:ss) to Date object for Prisma Time field
   */
  private convertTimeStringToDate(timeString: string): Date {
    const [hours, minutes, seconds = '0'] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10), 0);
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
}

