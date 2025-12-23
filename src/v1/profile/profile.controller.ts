import { BadRequestException, Body, Controller, Delete, Get, Logger, NotFoundException, Patch, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ProfileService, type ProfileInput, type ProfileUpdateInput } from "./profile.service";
import type { AuthenticatedRequest } from "src/common/interfaces/authenticated-request.interface";
import { SupabaseAuthGuard } from "src/auth/supabase-auth.guard";
import type { ErrorDetail, StandardErrorResponse } from "src/common/interfaces/standard-error-response.interface";

@Controller('profile')
export class ProfileController {
    private readonly logger = new Logger(ProfileController.name, { timestamp: true });

    constructor(private readonly profiles: ProfileService) { }

    @UseGuards(SupabaseAuthGuard)
    @Get()
    async getProfile(@Req() req: AuthenticatedRequest) {
        this.logger.debug('Fetching a Profile');
        const supabaseUserId = req.user?.supabaseUserId;

        if (!supabaseUserId) {
            throw new UnauthorizedException("supabaseUserId missing from authenticated request");
        }

        const profile = await this.profiles.getProfile(supabaseUserId);
        if (!profile) {
            throw new NotFoundException(
                this.buildErrorResponse(
                    req?.url ?? '/profile',
                    'Profile not found',
                    [{
                        field: 'profile',
                        code: 'not_found',
                        message: 'No profile found for this user',
                    }],
                ),
            );
        }

        return profile;
    }

    @UseGuards(SupabaseAuthGuard)
    @Post()
    async saveProfile(
        @Req() req: AuthenticatedRequest,
        @Body() body: Omit<ProfileInput, 'supabaseUserId'>,
    ) {
        this.logger.debug('Saving a Profile');
        const supabaseUserId = req.user?.supabaseUserId;

        if (!supabaseUserId) {
            throw new UnauthorizedException("supabaseUserId missing from authenticated request");
        }

        const errors: ErrorDetail[] = [];
        if (!body.fullName?.trim()) {
            errors.push({
                field: 'fullName',
                code: 'required',
                message: 'Full name is required',
            });
        }
        if (!body.dateOfBirth?.trim()) {
            errors.push({
                field: 'dateOfBirth',
                code: 'required',
                message: 'Date of birth is required',
            });
        }
        if (!body.gender?.trim()) {
            errors.push({
                field: 'gender',
                code: 'required',
                message: 'Gender is required',
            });
        }
        if (!Array.isArray(body.interests) || body.interests.length === 0) {
            errors.push({
                field: 'interests',
                code: 'required',
                message: 'At least one interest is required',
            });
        }

        if (body.acceptedTos !== true) {
            errors.push({
                field: 'acceptedTos',
                code: 'required_true',
                message: 'Terms of service must be accepted',
            });
        }
        if (body.acceptedGuidelines !== true) {
            errors.push({
                field: 'acceptedGuidelines',
                code: 'required_true',
                message: 'Community guidelines must be accepted',
            });
        }
        if (body.confirmedAge !== true) {
            errors.push({
                field: 'confirmedAge',
                code: 'required_true',
                message: 'Age confirmation is required',
            });
        }
        if (body.confirmedPlatonic !== true) {
            errors.push({
                field: 'confirmedPlatonic',
                code: 'required_true',
                message: 'Platonic-only confirmation is required',
            });
        }

        if (errors.length > 0) {
            const errorResponse = this.buildErrorResponse(
                req?.url ?? '/profile',
                'Missing required fields',
                errors,
            );
            throw new BadRequestException(errorResponse);
        }

        const profileInput: ProfileInput = {
            ...body,
            supabaseUserId,
        };

        const profile = await this.profiles.upsertProfile(profileInput);
        return profile;
    }

    @UseGuards(SupabaseAuthGuard)
    @Patch()
    async updateProfile(
        @Req() req: AuthenticatedRequest,
        @Body() body: ProfileUpdateInput,
    ) {
        this.logger.debug('Updating a Profile');
        const supabaseUserId = req.user?.supabaseUserId;

        if (!supabaseUserId) {
            throw new UnauthorizedException("supabaseUserId missing from authenticated request");
        }

        const updatableKeys: (keyof ProfileUpdateInput)[] = [
            'fullName',
            'gender',
            'profilePictureUrl',
            'interests',
            'bio',
            'hobbies',
            'distanceRadiusKm',
            'availability',
        ];
        const hasAtLeastOneField = updatableKeys.some((key) => body[key] !== undefined);

        if (!hasAtLeastOneField) {
            const errorResponse = this.buildErrorResponse(
                req?.url ?? '/profile',
                'No updatable fields provided',
                [{
                    field: 'body',
                    code: 'required_one',
                    message: 'Provide at least one updatable field',
                }],
            );
            throw new BadRequestException(errorResponse);
        }

        const profile = await this.profiles.updateProfile(supabaseUserId, body);
        return profile;
    }

    @UseGuards(SupabaseAuthGuard)
    @Delete()
    async deleteProfile(@Req() req: AuthenticatedRequest) {
        this.logger.debug('Deleting a Profile');
        const supabaseUserId = req.user?.supabaseUserId;

        if (!supabaseUserId) {
            throw new UnauthorizedException("supabaseUserId missing from authenticated request");
        }

        await this.profiles.deleteProfile(supabaseUserId);
        return { success: true };
    }

    private buildErrorResponse(path: string, message: string, details: ErrorDetail[]): StandardErrorResponse {
        return {
            statusCode: 400,
            error: 'Bad Request',
            message,
            details,
            path,
            timestamp: new Date().toISOString(),
        };
    }
}