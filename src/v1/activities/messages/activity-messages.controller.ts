import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { ActivityMessagesService } from './activity-messages.service';
import { CreateActivityMessageDto } from './dto/create-activity-message.dto';
import { PinActivityMessageDto } from './dto/pin-activity-message.dto';
import { ReportActivityMessageDto } from './dto/report-activity-message.dto';

@Controller('activities/:activityId/messages')
@UseGuards(SupabaseAuthGuard)
export class ActivityMessagesController {
  constructor(private readonly messagesService: ActivityMessagesService) {}

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!req.user?.supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;

    return this.messagesService.listMessages(activityId, req.user, pageNum, limitNum);
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Body() body: CreateActivityMessageDto,
  ) {
    if (!req.user?.supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.messagesService.createMessage(activityId, req.user, body);
  }

  @Patch(':messageId/pin')
  async pin(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Param('messageId') messageId: string,
    @Body() body: PinActivityMessageDto,
  ) {
    if (!req.user?.supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.messagesService.pinMessage(activityId, messageId, req.user, body);
  }

  @Post(':messageId/report')
  async report(
    @Req() req: AuthenticatedRequest,
    @Param('activityId') activityId: string,
    @Param('messageId') messageId: string,
    @Body() body: ReportActivityMessageDto,
  ) {
    if (!req.user?.supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.messagesService.reportMessage(activityId, messageId, req.user, body);
  }
}

