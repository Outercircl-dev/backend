import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
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
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import type { ErrorDetail, StandardErrorResponse } from 'src/common/interfaces/standard-error-response.interface';

@Controller('activities')
export class ActivitiesController {
  private readonly logger = new Logger(ActivitiesController.name, { timestamp: true });

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
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }

    try {
      const activity = await this.activitiesService.create(supabaseUserId, body);
      return activity;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Error creating activity', error);
      throw new HttpException(
        this.buildErrorResponse(
          req?.url ?? '/activities',
          'Failed to create activity',
          [
            {
              field: 'activity',
              code: 'creation_failed',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          ],
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('hostId') hostId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.debug('Fetching activities list');
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    if (pageNum && (isNaN(pageNum) || pageNum < 1)) {
      throw new HttpException(
        this.buildErrorResponse(
          '/activities',
          'Invalid page parameter',
          [
            {
              field: 'page',
              code: 'invalid',
              message: 'Page must be a positive integer',
            },
          ],
        ),
        HttpStatus.BAD_REQUEST,
      );
    }

    if (limitNum && (isNaN(limitNum) || limitNum < 1 || limitNum > 100)) {
      throw new HttpException(
        this.buildErrorResponse(
          '/activities',
          'Invalid limit parameter',
          [
            {
              field: 'limit',
              code: 'invalid',
              message: 'Limit must be between 1 and 100',
            },
          ],
        ),
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.activitiesService.findAll({
      status,
      hostId,
      page: pageNum,
      limit: limitNum,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    this.logger.debug(`Fetching activity with ID: ${id}`);
    return this.activitiesService.findOne(id);
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
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }

    try {
      const activity = await this.activitiesService.update(id, supabaseUserId, body);
      return activity;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error updating activity ${id}`, error);
      throw new HttpException(
        this.buildErrorResponse(
          req?.url ?? `/activities/${id}`,
          'Failed to update activity',
          [
            {
              field: 'activity',
              code: 'update_failed',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          ],
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @UseGuards(SupabaseAuthGuard)
  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    this.logger.debug(`Deleting activity with ID: ${id}`);
    const supabaseUserId = req.user?.supabaseUserId;

    if (!supabaseUserId) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }

    try {
      await this.activitiesService.remove(id, supabaseUserId);
      return { success: true, message: 'Activity deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Error deleting activity ${id}`, error);
      throw new HttpException(
        this.buildErrorResponse(
          req?.url ?? `/activities/${id}`,
          'Failed to delete activity',
          [
            {
              field: 'activity',
              code: 'delete_failed',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          ],
        ),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private buildErrorResponse(
    path: string,
    message: string,
    details: ErrorDetail[],
  ): StandardErrorResponse {
    return {
      success: false,
      error: message,
      path,
      details,
      timestamp: new Date().toISOString(),
    };
  }
}

