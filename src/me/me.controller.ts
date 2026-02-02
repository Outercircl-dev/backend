import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { MembershipTierKey, MembershipTierRules } from 'src/config/membership-tiers.model';
import { MembershipTiersService } from 'src/config/membership-tiers.service';
import { UsersService } from 'src/users/users.service';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { ProfileService } from 'src/v1/profile/profile.service';
import { MembershipSubscriptionsService } from 'src/membership/membership-subscriptions.service';

interface BackendMeResponse {
  id: string;
  supabaseUserId: string;
  email: string;
  hasOnboarded: boolean;
  role: string;
  type: MembershipTierKey;
  tierRules: MembershipTierRules;
}

interface UpdateMeRequest {
  hasOnboarded: boolean;
}

@Controller('me')
export class MeController {
  private readonly logger = new Logger(MeController.name, { timestamp: true });

  constructor(
    private readonly usersService: UsersService,
    private readonly profileService: ProfileService,
    private readonly membershipTiersService: MembershipTiersService,
    private readonly membershipSubscriptionsService: MembershipSubscriptionsService,
  ) { }

  @UseGuards(SupabaseAuthGuard)
  @Get()
  async me(@Req() req: AuthenticatedRequest): Promise<BackendMeResponse> {
    const user = req.user ?? {};

    if (!user.role || !user.supabaseUserId || !user.email) {
      throw new BadRequestException(
        'Authenticated user is missing required identifiers',
      );
    }

    this.logger.log('User', user)

    const profile = await this.profileService.getProfile(user.supabaseUserId);

    const tierKey = await this.membershipSubscriptionsService.resolveTierForUserId(user.supabaseUserId);
    const tierRules = this.membershipTiersService.getTierRules(tierKey);

    return {
      id: user.supabaseUserId,
      supabaseUserId: user.supabaseUserId,
      email: user.email,
      hasOnboarded: Boolean(profile),
      role: user.role,
      type: tierKey,
      tierRules,
    };
  }

  @UseGuards(SupabaseAuthGuard)
  @Put()
  async updateMe(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateMeRequest,
  ): Promise<BackendMeResponse> {
    const user = req.user ?? {};

    if (typeof body?.hasOnboarded !== 'boolean') {
      throw new BadRequestException(
        'hasOnboarded must be provided as a boolean',
      );
    }

    if (!user.supabaseUserId || !user.email || !user.role) {
      throw new BadRequestException(
        'Authenticated user is missing required identifiers',
      );
    }

    const updatedUser = await this.usersService.upsertHasOnboardedStatus(
      user.supabaseUserId,
      body.hasOnboarded,
      user.email,
      user.role,
      user.type ?? this.membershipTiersService.getDefaultTier(),
    );

    const tierKey = await this.membershipSubscriptionsService.resolveTierForUserId(updatedUser.supabaseId);
    const tierRules = this.membershipTiersService.getTierRules(tierKey);

    return {
      id: updatedUser.supabaseId,
      supabaseUserId: updatedUser.supabaseId,
      email: updatedUser.email,
      hasOnboarded: updatedUser.hasOnboarded,
      role: updatedUser.role,
      type: tierKey,
      tierRules,
    };
  }
}
