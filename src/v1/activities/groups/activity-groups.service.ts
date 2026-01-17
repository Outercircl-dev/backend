import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import { assertVerifiedHost, GROUP_MAX_MEMBERS, isPremium } from '../hosting-rules';
import { CreateActivityGroupDto } from './dto/create-activity-group.dto';
import { UpdateActivityGroupDto } from './dto/update-activity-group.dto';

@Injectable()
export class ActivityGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(user: AuthenticatedUser, dto: CreateActivityGroupDto) {
    assertVerifiedHost(user);
    if (!isPremium(user)) {
      throw new ForbiddenException('Only premium hosts can create groups');
    }
    if (!user?.supabaseUserId) {
      throw new BadRequestException('supabaseUserId missing from authenticated request');
    }

    const profile = await this.getProfileForUser(user.supabaseUserId);

    if (dto.maxMembers && dto.maxMembers > GROUP_MAX_MEMBERS) {
      throw new BadRequestException(`Group size cannot exceed ${GROUP_MAX_MEMBERS}`);
    }

    const group = await this.prisma.activityGroup.create({
      data: {
        owner_profile_id: profile.id,
        name: dto.name,
        description: dto.description ?? null,
        is_public: dto.isPublic ?? false,
        max_members: dto.maxMembers ?? GROUP_MAX_MEMBERS,
      },
    });

    await this.prisma.activityGroupMember.create({
      data: {
        group_id: group.id,
        profile_id: profile.id,
        role: 'owner',
      },
    });

    return group;
  }

  async listGroups(user: AuthenticatedUser) {
    assertVerifiedHost(user);
    if (!user?.supabaseUserId) {
      throw new BadRequestException('supabaseUserId missing from authenticated request');
    }

    const profile = await this.getProfileForUser(user.supabaseUserId);

    return this.prisma.activityGroup.findMany({
      where: {
        OR: [
          { owner_profile_id: profile.id },
          { members: { some: { profile_id: profile.id } } },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateGroup(id: string, user: AuthenticatedUser, dto: UpdateActivityGroupDto) {
    assertVerifiedHost(user);
    if (!isPremium(user)) {
      throw new ForbiddenException('Only premium hosts can manage groups');
    }
    if (!user?.supabaseUserId) {
      throw new BadRequestException('supabaseUserId missing from authenticated request');
    }

    const profile = await this.getProfileForUser(user.supabaseUserId);
    const group = await this.prisma.activityGroup.findUnique({
      where: { id },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.owner_profile_id !== profile.id) {
      throw new ForbiddenException('Only group owners can update group details');
    }

    if (dto.maxMembers && dto.maxMembers > GROUP_MAX_MEMBERS) {
      throw new BadRequestException(`Group size cannot exceed ${GROUP_MAX_MEMBERS}`);
    }

    return this.prisma.activityGroup.update({
      where: { id },
      data: {
        name: dto.name ?? group.name,
        description: dto.description ?? group.description,
        is_public: dto.isPublic ?? group.is_public,
        max_members: dto.maxMembers ?? group.max_members,
      },
    });
  }

  private async getProfileForUser(supabaseUserId: string) {
    const profile = await this.prisma.user_profiles.findUnique({
      where: { user_id: supabaseUserId },
      select: { id: true },
    });
    if (!profile) {
      throw new BadRequestException('Complete your profile before managing groups');
    }
    return profile;
  }
}

