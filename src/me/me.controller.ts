import { BadRequestException, Body, Controller, Get, Logger, Put, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "src/auth/supabase-auth.guard";
import { SubscriptionTier } from "src/common/enums/subscription-tier.enum";
import { UsersService } from "src/users/users.service";
import { Request } from "express";

interface AuthenticatedUser {
    id?: string
    supabaseUserId?: string
    email?: string
    hasOnboarded?: boolean
    role?: string
    type?: SubscriptionTier
}

interface BackendMeResponse {
    id: string
    supabaseUserId: string
    email: string
    hasOnboarded: boolean
    role: string
    type: SubscriptionTier
}

interface UpdateMeRequest {
    hasOnboarded: boolean
}

interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser
}

@Controller('me')
export class MeController {
    private readonly logger = new Logger(MeController.name, { timestamp: true });

    constructor(private readonly usersService: UsersService) { }

    @UseGuards(SupabaseAuthGuard)
    @Get()
    async me(@Req() req: AuthenticatedRequest): Promise<BackendMeResponse> {
        this.logger.log('Getting Profile information')
        this.logger.debug(`Request = ${JSON.stringify(req.user)}`)
        const user = req.user ?? {}

        if (!user.role || !user.supabaseUserId || !user.email) {
            throw new BadRequestException("Authenticated user is missing required identifiers");
        }

        return {
            id: user.supabaseUserId,
            supabaseUserId: user.supabaseUserId,
            email: user.email,
            hasOnboarded: user.hasOnboarded ?? false,
            role: user.role,
            type: user.type ?? SubscriptionTier.FREEMIUM
        }
    }

    @UseGuards(SupabaseAuthGuard)
    @Put()
    async updateMe(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdateMeRequest,
    ): Promise<BackendMeResponse> {
        const user = req.user ?? {}

        if (typeof body?.hasOnboarded !== "boolean") {
            throw new BadRequestException("hasOnboarded must be provided as a boolean");
        }

        if (!user.supabaseUserId || !user.email || !user.role) {
            throw new BadRequestException("Authenticated user is missing required identifiers");
        }

        const updatedUser = await this.usersService.upsertHasOnboardedStatus(
            user.supabaseUserId,
            body.hasOnboarded,
            user.email,
            user.role,
            user.type ?? SubscriptionTier.FREEMIUM,
        );

        return {
            id: updatedUser.supabaseId,
            supabaseUserId: updatedUser.supabaseId,
            email: updatedUser.email,
            hasOnboarded: updatedUser.hasOnboarded,
            role: updatedUser.role,
            type: updatedUser.type ?? SubscriptionTier.FREEMIUM,
        }
    }
}