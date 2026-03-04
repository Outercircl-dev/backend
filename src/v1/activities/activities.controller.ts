import {
  Body,
  Controller,
  Delete,
  Get,
  BadRequestException,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import { OptionalSupabaseAuthGuard } from 'src/auth/optional-supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import type { OptionalAuthenticatedRequest } from 'src/common/interfaces/optional-authenticated-request.interface';

@Controller('activities')
export class ActivitiesController {
  private readonly logger = new Logger(ActivitiesController.name, {
    timestamp: true,
  });

  constructor(private readonly activitiesService: ActivitiesService) {}

  @UseGuards(SupabaseAuthGuard)
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateActivityDto,
  ) {
    this.logger.debug('Creating a new activity');
    const supabaseUserId = req.user?.supabaseUserId;

    if (!supabaseUserId) {
      throw new UnauthorizedException(
        'supabaseUserId missing from authenticated request',
      );
    }

    const activity = await this.activitiesService.create(req.user, body);
    return activity;
  }

  @UseGuards(OptionalSupabaseAuthGuard)
  @Get()
  async findAll(
    @Req() req: OptionalAuthenticatedRequest,
    @Query('status') status?: string,
    @Query('hostId') hostId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.debug('Fetching activities list');
    const pageNum = page !== undefined ? parseInt(page, 10) : undefined;
    const limitNum = limit !== undefined ? parseInt(limit, 10) : undefined;

    if (pageNum !== undefined && (isNaN(pageNum) || pageNum < 1)) {
      throw new BadRequestException('Page must be a positive integer');
    }

    if (
      limitNum !== undefined &&
      (isNaN(limitNum) || limitNum < 1 || limitNum > 100)
    ) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    return this.activitiesService.findAll(
      {
        status,
        hostId,
        page: pageNum,
        limit: limitNum,
      },
      req.user?.supabaseUserId,
    );
  }

  @UseGuards(SupabaseAuthGuard)
  @Get('joined/past')
  async findJoinedPast(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const supabaseUserId = req.user?.supabaseUserId;
    if (!supabaseUserId) {
      throw new UnauthorizedException(
        'supabaseUserId missing from authenticated request',
      );
    }
    const pageNum = page !== undefined ? parseInt(page, 10) : 1;
    const limitNum = limit !== undefined ? parseInt(limit, 10) : 20;
    return this.activitiesService.findJoinedPast(req.user, pageNum, limitNum);
  }

  @UseGuards(OptionalSupabaseAuthGuard)
  @Get(':id')
  async findOne(
    @Req() req: OptionalAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    this.logger.debug(`Fetching activity with ID: ${id}`);
    return this.activitiesService.findOne(id, req.user?.supabaseUserId);
  }

  @UseGuards(SupabaseAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateActivityDto,
  ) {
    this.logger.debug(`Updating activity with ID: ${id}`);
    const supabaseUserId = req.user?.supabaseUserId;

    if (!supabaseUserId) {
      throw new UnauthorizedException(
        'supabaseUserId missing from authenticated request',
      );
    }

    const activity = await this.activitiesService.update(id, req.user, body);
    return activity;
  }

  @UseGuards(SupabaseAuthGuard)
  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    this.logger.debug(`Deleting activity with ID: ${id}`);
    const supabaseUserId = req.user?.supabaseUserId;

    if (!supabaseUserId) {
      throw new UnauthorizedException(
        'supabaseUserId missing from authenticated request',
      );
    }

    await this.activitiesService.remove(id, req.user);
    return { success: true, message: 'Activity deleted successfully' };
  }
}
