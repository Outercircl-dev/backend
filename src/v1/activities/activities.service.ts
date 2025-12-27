import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { Prisma, Activity } from '@prisma/client';

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

      const existingSlugs = existingInterests.map((i) => i.slug);
      const invalidInterests = dto.interests.filter((slug) => !existingSlugs.includes(slug));

      if (invalidInterests.length > 0) {
        throw new BadRequestException(
          `Invalid interest slugs: ${invalidInterests.join(', ')}`,
        );
      }
    }

    // Validate location format
    if (!dto.location.latitude || !dto.location.longitude) {
      throw new BadRequestException('Location must have latitude and longitude');
    }

    // Validate date/time
    const activityDate = new Date(dto.activityDate);
    if (isNaN(activityDate.getTime())) {
      throw new BadRequestException('Invalid activity date format');
    }

    // Validate time format using regex (hours 00-23, minutes/seconds 00-59)
    const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
    if (!timeFormatRegex.test(dto.startTime)) {
      throw new BadRequestException('Invalid start time format. Use HH:mm or HH:mm:ss');
    }

    if (dto.endTime) {
      if (!timeFormatRegex.test(dto.endTime)) {
        throw new BadRequestException('Invalid end time format. Use HH:mm or HH:mm:ss');
      }
      // Basic validation: end time should be after start time
      const startTimeParts = dto.startTime.split(':');
      const endTimeParts = dto.endTime.split(':');
      const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
      const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1]);
      if (endMinutes <= startMinutes) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    // Create activity with default status 'draft'
    const activity = await this.prisma.activity.create({
      data: {
        host_id: hostId,
        title: dto.title,
        description: dto.description || null,
        category: dto.category || null,
        interests: dto.interests,
        location: dto.location,
        activity_date: activityDate,
        start_time: dto.startTime,
        end_time: dto.endTime || null,
        max_participants: dto.maxParticipants,
        current_participants: 0,
        status: 'draft',
        is_public: dto.isPublic ?? true,
      },
    });

    return this.mapToResponseDto(activity);
  }

  async findAll(filters?: {
    status?: string;
    hostId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: ActivityResponseDto[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityWhereInput = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.hostId) {
      where.host_id = filters.hostId;
    }

    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      items: items.map((item: Activity) => this.mapToResponseDto(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<ActivityResponseDto> {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    return this.mapToResponseDto(activity);
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

      const existingSlugs = existingInterests.map((i) => i.slug);
      const invalidInterests = dto.interests.filter((slug) => !existingSlugs.includes(slug));

      if (invalidInterests.length > 0) {
        throw new BadRequestException(
          `Invalid interest slugs: ${invalidInterests.join(', ')}`,
        );
      }
    }

    // Validate location if provided
    if (dto.location) {
      if (!dto.location.latitude || !dto.location.longitude) {
        throw new BadRequestException('Location must have latitude and longitude');
      }
    }

    // Validate date/time if provided
    let activityDate = existing.activity_date;
    if (dto.activityDate) {
      activityDate = new Date(dto.activityDate);
      if (isNaN(activityDate.getTime())) {
        throw new BadRequestException('Invalid activity date format');
      }
    }

    // Validate times if provided
    const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
    let startTime = existing.start_time;
    let endTime = existing.end_time;
    if (dto.startTime) {
      if (!timeFormatRegex.test(dto.startTime)) {
        throw new BadRequestException('Invalid start time format. Use HH:mm or HH:mm:ss');
      }
      startTime = dto.startTime;
    }

    if (dto.endTime) {
      if (!timeFormatRegex.test(dto.endTime)) {
        throw new BadRequestException('Invalid end time format. Use HH:mm or HH:mm:ss');
      }
      endTime = dto.endTime;

      // Validate end time is after start time
      const startTimeParts = (dto.startTime || existing.start_time).split(':');
      const endTimeParts = dto.endTime.split(':');
      const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
      const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1]);
      if (endMinutes <= startMinutes) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    // Build update data
    const updateData: Prisma.ActivityUpdateInput = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.category !== undefined) updateData.category = dto.category || null;
    if (dto.interests !== undefined) updateData.interests = dto.interests;
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.activityDate !== undefined) updateData.activity_date = activityDate;
    if (dto.startTime !== undefined) updateData.start_time = startTime;
    if (dto.endTime !== undefined) updateData.end_time = endTime || null;
    if (dto.maxParticipants !== undefined) updateData.max_participants = dto.maxParticipants;
    if (dto.isPublic !== undefined) updateData.is_public = dto.isPublic;

    const activity = await this.prisma.activity.update({
      where: { id },
      data: updateData,
    });

    return this.mapToResponseDto(activity);
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

  async incrementParticipants(id: string): Promise<ActivityResponseDto> {
    // Use atomic update with capacity check to prevent race conditions
    // First, verify activity exists
    const activity = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    // Use raw SQL for atomic conditional update to prevent race conditions
    // This ensures only one concurrent request can increment when under capacity
    const updateResult = await this.prisma.$executeRaw`
      UPDATE activities
      SET current_participants = current_participants + 1,
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND current_participants < max_participants
    `;

    // If no rows were updated, the activity is at capacity
    if (updateResult === 0) {
      throw new BadRequestException('Activity is already at full capacity');
    }

    // Fetch the updated activity
    const updated = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!updated) {
      throw new NotFoundException(`Activity with ID ${id} not found after update`);
    }

    return this.mapToResponseDto(updated);
  }

  async decrementParticipants(id: string): Promise<ActivityResponseDto> {
    // Use atomic update to prevent race conditions
    // First, verify activity exists
    const activity = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    // Use raw SQL for atomic conditional update to prevent race conditions
    // This ensures only one concurrent request can decrement when above zero
    const updateResult = await this.prisma.$executeRaw`
      UPDATE activities
      SET current_participants = current_participants - 1,
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND current_participants > 0
    `;

    // If no rows were updated, the activity already has zero participants
    if (updateResult === 0) {
      throw new BadRequestException('Activity already has zero participants');
    }

    // Fetch the updated activity
    const updated = await this.prisma.activity.findUnique({
      where: { id },
    });

    if (!updated) {
      throw new NotFoundException(`Activity with ID ${id} not found after update`);
    }

    return this.mapToResponseDto(updated);
  }

  private mapToResponseDto(activity: Activity): ActivityResponseDto {
    return {
      id: activity.id,
      hostId: activity.host_id,
      title: activity.title,
      description: activity.description,
      category: activity.category,
      interests: activity.interests as string[],
      location: activity.location as { latitude: number; longitude: number; address?: string },
      activityDate: activity.activity_date.toISOString().split('T')[0],
      startTime: activity.start_time,
      endTime: activity.end_time,
      maxParticipants: activity.max_participants,
      currentParticipants: activity.current_participants,
      status: activity.status,
      isPublic: activity.is_public,
      createdAt: activity.created_at,
      updatedAt: activity.updated_at,
    };
  }
}

