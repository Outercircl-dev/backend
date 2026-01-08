import { BadRequestException, Body, Controller, Delete, Get, HttpException, HttpStatus, Logger, Patch, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
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
            throw new HttpException(
                this.buildErrorResponse(
                    HttpStatus.NOT_FOUND,
                    req?.url ?? '/profile',
                    'Profile not found',
                    [{
                        field: 'profile',
                        code: 'not_found',
                        message: 'No profile found for this user',
                    }],
                ),
                HttpStatus.NOT_FOUND,
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
        const dobTrimmed = body.dateOfBirth?.trim();
        if (!dobTrimmed) {
            errors.push({
                field: 'dateOfBirth',
                code: 'required',
                message: 'Date of birth is required',
            });
        } else {
            const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!isoDateRegex.test(dobTrimmed)) {
                errors.push({
                    field: 'dateOfBirth',
                    code: 'invalid_format',
                    message: 'Date of birth must be in YYYY-MM-DD format',
                });
            } else {
                const parsed = new Date(dobTrimmed);
                if (Number.isNaN(parsed.getTime())) {
                    errors.push({
                        field: 'dateOfBirth',
                        code: 'invalid_format',
                        message: 'Date of birth must be in YYYY-MM-DD format',
                    });
                }
            }
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
                HttpStatus.BAD_REQUEST,
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
                HttpStatus.BAD_REQUEST,
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

    private buildErrorResponse(statusCode: number, path: string, message: string, details: ErrorDetail[]): StandardErrorResponse {
        return {
            statusCode,
            message,
            path,
            details,
            timestamp: new Date().toISOString(),
        };
    }
}