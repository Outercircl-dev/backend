import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { ActivityFeedbackService } from './activity-feedback.service';
import { CreateActivityFeedbackDto } from './dto/create-activity-feedback.dto';

@Controller('activities/:activityId/feedback')
@UseGuards(SupabaseAuthGuard)
export class ActivityFeedbackController {
  constructor(private readonly feedbackService: ActivityFeedbackService) {}

  @Get('form')
  async getForm(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
  ) {
    if (!req.user?.supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.feedbackService.getFeedbackForm(activityId, req.user);
  }

  @Post()
  async submit(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Body() body: CreateActivityFeedbackDto,
  ) {
    if (!req.user?.supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.feedbackService.submitFeedback(activityId, req.user, body);
  }

  @Get('ratings/:profileId')
  async getRatingSummary(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Param('profileId') profileId: string,
  ) {
    if (!req.user?.supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.feedbackService.getUserRatingSummary(activityId, profileId, req.user);
  }
}

