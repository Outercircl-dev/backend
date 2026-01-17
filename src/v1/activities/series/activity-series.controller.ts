import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { ActivitySeriesService } from './activity-series.service';
import { CreateActivitySeriesDto } from './dto/create-activity-series.dto';

@Controller('activities/series')
@UseGuards(SupabaseAuthGuard)
export class ActivitySeriesController {
  constructor(private readonly seriesService: ActivitySeriesService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateActivitySeriesDto) {
    if (!req.user) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.seriesService.createSeries(req.user, body);
  }
}

