import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async listNotifications(@Req() req: AuthenticatedRequest, @Query() query: NotificationQueryDto) {
    const userId = this.getUserIdOrThrow(req);
    return this.notificationsService.listForUser(userId, query.page, query.limit);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserIdOrThrow(req);
    return this.notificationsService.getUnreadCount(userId);
  }

  @Post(':id/read')
  async markRead(@Req() req: AuthenticatedRequest, @Param('id') notificationId: string) {
    const userId = this.getUserIdOrThrow(req);
    return this.notificationsService.markRead(userId, notificationId);
  }

  @Post('read-all')
  async markAllRead(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserIdOrThrow(req);
    return this.notificationsService.markAllRead(userId);
  }

  @Get('preferences')
  async getPreferences(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserIdOrThrow(req);
    return this.notificationsService.getPreferences(userId);
  }

  @Put('preferences')
  async updatePreferences(@Req() req: AuthenticatedRequest, @Body() dto: UpdateNotificationPreferencesDto) {
    const userId = this.getUserIdOrThrow(req);
    return this.notificationsService.updatePreferences(userId, dto);
  }

  private getUserIdOrThrow(req: AuthenticatedRequest): string {
    const userId = req.user?.supabaseUserId;
    if (!userId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return userId;
  }
}

