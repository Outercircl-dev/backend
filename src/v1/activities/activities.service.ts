import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityResponseDto, ViewerParticipationMeta, ParticipationState } from './dto/activity-response.dto';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(hostId: string, dto: CreateActivityDto): Promise<ActivityResponseDto> {
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

    // Create activity with default status 'draft'
    const activity = await this.prisma.activity.create({
      data: {
        host_id: hostId,
        title: dto.title,
        description: dto.description || null,
        category: dto.category || null,
        interests: dto.interests,
        location: dto.location as any, // Cast to any for Prisma JSON type
        activity_date: activityDate,
        start_time: startTimeDate,
        end_time: endTimeDate,
        max_participants: dto.maxParticipants,
        current_participants: 0,
        status: 'draft' as const,
        is_public: dto.isPublic ?? true,
      },
    });

    return this.mapToResponseDto(activity, hostId);
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

  async update(id: string, hostId: string, dto: UpdateActivityDto): Promise<ActivityResponseDto> {
    // Check if activity exists
    const existing = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    // Check if user is the host
    if (existing.host_id !== hostId) {
      throw new ForbiddenException('You can only update your own activities');
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

    // Parse activity date if provided (DTO already validates format via @IsDateString)
    let activityDate = existing.activity_date;
    if (dto.activityDate) {
      activityDate = new Date(dto.activityDate);
    }

    // Handle times if provided
    let startTime = existing.start_time;
    let endTime = existing.end_time;
    
    // Convert existing time (Date) to string for comparison
    const existingStartTimeStr = this.convertDateToTimeString(existing.start_time);
    
    if (dto.startTime) {
      startTime = this.convertTimeStringToDate(dto.startTime);
    }

    if (dto.endTime) {
      endTime = this.convertTimeStringToDate(dto.endTime);

      // Validate end time is after start time (including seconds)
      const startTimeStr = dto.startTime || existingStartTimeStr;
      const startTimeParts = startTimeStr.split(':');
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

    // Build update data
    const updateData: Prisma.ActivityUpdateInput = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.category !== undefined) updateData.category = dto.category || null;
    if (dto.interests !== undefined) updateData.interests = dto.interests;
    if (dto.location !== undefined) updateData.location = dto.location as any; // Cast to any for Prisma JSON type
    if (dto.activityDate !== undefined) updateData.activity_date = activityDate;
    if (dto.startTime !== undefined) updateData.start_time = startTime;
    if (dto.endTime !== undefined) updateData.end_time = endTime || null;
    if (dto.maxParticipants !== undefined) updateData.max_participants = dto.maxParticipants;
    if (dto.isPublic !== undefined) updateData.is_public = dto.isPublic;

    const activity = await this.prisma.activity.update({
      where: { id },
      data: updateData,
    });

    return this.mapToResponseDto(activity, hostId);
  }

  async remove(id: string, hostId: string): Promise<void> {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    if (activity.host_id !== hostId) {
      throw new ForbiddenException('You can only delete your own activities');
    }

    await this.prisma.activity.delete({
      where: { id },
    });
  }

  private async mapToResponseDto(activity: any, viewerId?: string): Promise<ActivityResponseDto> {
    const [confirmedCount, waitlistCount, viewerProfile] = await Promise.all([
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

