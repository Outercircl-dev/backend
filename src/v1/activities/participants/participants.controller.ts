import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { ActivitiesService } from '../activities.service';
import { ParticipantsService } from './participants.service';
import { JoinActivityDto } from './dto/join-activity.dto';
import { UpdateParticipationDto } from './dto/update-participation.dto';

@Controller('activities/:activityId/participants')
@UseGuards(SupabaseAuthGuard)
export class ParticipantsController {
  constructor(
    private readonly participantsService: ParticipantsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  @Post()
  async join(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Body() body: JoinActivityDto,
  ) {
    const supabaseUserId = req.user?.supabaseUserId;
    if (!supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }

    const participation = await this.participantsService.join(activityId, supabaseUserId, body);
    const activity = await this.activitiesService.findOne(activityId, supabaseUserId);
    return { participation, activity };
  }

  @Delete(':participantId')
  async cancel(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Param('participantId') participantId: string,
  ) {
    const supabaseUserId = req.user?.supabaseUserId;
    if (!supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }

    const participation = await this.participantsService.cancelParticipation(
      activityId,
      participantId,
      supabaseUserId,
    );
    const activity = await this.activitiesService.findOne(activityId, supabaseUserId);
    return { participation, activity };
  }

  @Patch(':participantId')
  async moderate(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Param('participantId') participantId: string,
    @Body() body: UpdateParticipationDto,
  ) {
    const supabaseUserId = req.user?.supabaseUserId;
    if (!supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }

    const participation = await this.participantsService.moderateParticipant(
      activityId,
      participantId,
      supabaseUserId,
      body,
    );
    const activity = await this.activitiesService.findOne(activityId, supabaseUserId);
    return { participation, activity };
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest, @Param('activityId') activityId: string) {
    const supabaseUserId = req.user?.supabaseUserId;
    if (!supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }

    const participants = await this.participantsService.listParticipants(activityId, supabaseUserId);
    return { participants };
  }
}

