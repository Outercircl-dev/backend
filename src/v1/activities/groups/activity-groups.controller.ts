import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { ActivityGroupsService } from './activity-groups.service';
import { CreateActivityGroupDto } from './dto/create-activity-group.dto';
import { UpdateActivityGroupDto } from './dto/update-activity-group.dto';

@Controller('activities/groups')
@UseGuards(SupabaseAuthGuard)
export class ActivityGroupsController {
  constructor(private readonly groupsService: ActivityGroupsService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    if (!req.user) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.groupsService.listGroups(req.user);
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateActivityGroupDto) {
    if (!req.user) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.groupsService.createGroup(req.user, body);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateActivityGroupDto,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('supabaseUserId missing from authenticated request');
    }
    return this.groupsService.updateGroup(id, req.user, body);
  }
}

