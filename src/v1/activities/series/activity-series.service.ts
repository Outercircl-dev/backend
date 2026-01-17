import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import { assertVerifiedHost } from '../hosting-rules';
import { CreateActivitySeriesDto } from './dto/create-activity-series.dto';

@Injectable()
export class ActivitySeriesService {
  constructor(private readonly prisma: PrismaService) {}

  async createSeries(user: AuthenticatedUser, dto: CreateActivitySeriesDto) {
    assertVerifiedHost(user);
    if (!user?.supabaseUserId) {
      throw new BadRequestException('supabaseUserId missing from authenticated request');
    }

    const profile = await this.prisma.user_profiles.findUnique({
      where: { user_id: user.supabaseUserId },
      select: { id: true },
    });

    if (!profile) {
      throw new BadRequestException('Complete your profile before creating a series');
    }

    return this.prisma.activitySeries.create({
      data: {
        owner_profile_id: profile.id,
        frequency: dto.frequency,
        interval: dto.interval,
        ends_on: dto.endsOn ? new Date(dto.endsOn) : null,
        occurrences: dto.occurrences ?? null,
      },
    });
  }
}

