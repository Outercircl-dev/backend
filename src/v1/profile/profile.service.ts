import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma } from "src/generated/prisma/client";

export interface ProfileInput {
    supabaseUserId: string;
    username: string;
    fullName: string;
    dateOfBirth: string;
    gender: "male" | "female" | "other" | "prefer_not_to_say";
    profilePictureUrl?: string;
    interests: string[];
    bio?: string;
    hobbies?: string[];
    distanceRadiusKm?: number;
    availability?: Record<string, boolean>;
    acceptedTos: boolean;
    acceptedGuidelines: boolean;
    confirmedAge: boolean;
    confirmedPlatonic: boolean;
}

export interface ProfileUpdateInput {
    username?: string;
    fullName?: string;
    gender?: "male" | "female" | "other" | "prefer_not_to_say";
    profilePictureUrl?: string;
    interests?: string[];
    bio?: string;
    hobbies?: string[];
    distanceRadiusKm?: number;
    availability?: Record<string, boolean>;
}

@Injectable()
export class ProfileService {
    constructor(private readonly prisma: PrismaService) { }

    async upsertProfile(input: ProfileInput) {
        const {
            supabaseUserId,
            username,
            fullName,
            dateOfBirth,
            gender,
            profilePictureUrl,
            interests,
            bio,
            hobbies,
            distanceRadiusKm = 25,
            availability,
            acceptedTos,
            acceptedGuidelines,
            confirmedAge,
            confirmedPlatonic,
        } = input;
        const normalizedUsername = this.normalizeUsernameOrThrow(username);
        const parsedDob = this.parseDateOrThrow(dateOfBirth);

        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.claimUsernameOrThrow(tx, normalizedUsername, supabaseUserId);

                return tx.user_profiles.upsert({
                    where: { user_id: supabaseUserId },
                    update: {
                        username: normalizedUsername,
                        full_name: fullName,
                        date_of_birth: parsedDob,
                        gender,
                        profile_picture_url: profilePictureUrl,
                        interests,
                        bio,
                        hobbies: hobbies ?? [],
                        availability: availability ?? {},
                        distance_radius_km: distanceRadiusKm ?? 25,
                        accepted_tos: acceptedTos,
                        accepted_guidelines: acceptedGuidelines,
                        confirmed_age: confirmedAge,
                        confirmed_platonic: confirmedPlatonic,
                        profile_completed: true, // Mark profile as completed when saving via POST
                    } as any,
                    create: {
                        user_id: supabaseUserId,
                        username: normalizedUsername,
                        full_name: fullName,
                        date_of_birth: parsedDob,
                        gender,
                        profile_picture_url: profilePictureUrl,
                        interests,
                        bio,
                        hobbies: hobbies ?? [],
                        availability: availability ?? {},
                        distance_radius_km: distanceRadiusKm ?? 25,
                        accepted_tos: acceptedTos,
                        accepted_guidelines: acceptedGuidelines,
                        confirmed_age: confirmedAge,
                        confirmed_platonic: confirmedPlatonic,
                        profile_completed: true, // Mark profile as completed when creating via POST
                    } as any,
                });
            });
        } catch (error) {
            if (this.isUsernameConflict(error)) {
                throw this.buildUsernameTakenException(normalizedUsername);
            }
            throw error;
        }
    }

    async updateProfile(userId: string, input: ProfileUpdateInput) {
        const updateData: Record<string, any> = {};

        if (input.username !== undefined) {
            updateData.username = this.normalizeUsernameOrThrow(input.username);
        }
        if (input.fullName !== undefined) updateData.full_name = input.fullName;
        if (input.gender !== undefined) updateData.gender = input.gender;
        if (input.profilePictureUrl !== undefined) updateData.profile_picture_url = input.profilePictureUrl;
        if (input.interests !== undefined) updateData.interests = input.interests;
        if (input.bio !== undefined) updateData.bio = input.bio;
        if (input.hobbies !== undefined) updateData.hobbies = input.hobbies;
        if (input.distanceRadiusKm !== undefined) updateData.distance_radius_km = input.distanceRadiusKm;
        if (input.availability !== undefined) updateData.availability = input.availability;

        try {
            if (updateData.username === undefined) {
                return this.prisma.user_profiles.update({
                    where: { user_id: userId },
                    data: updateData,
                });
            }

            return await this.prisma.$transaction(async (tx) => {
                await this.claimUsernameOrThrow(tx, updateData.username, userId);

                return tx.user_profiles.update({
                    where: { user_id: userId },
                    data: updateData,
                });
            });
        } catch (error) {
            if (this.isUsernameConflict(error)) {
                throw this.buildUsernameTakenException(updateData.username);
            }
            throw error;
        }
    }

    async getProfile(userId: string) {
        return this.prisma.user_profiles.findUnique({
            where: { user_id: userId },
        });
    }

    async deleteProfile(userId: string) {
        const profile = await this.prisma.user_profiles.findUnique({
            where: { user_id: userId },
            select: { id: true },
        });

        if (!profile) {
            throw new NotFoundException("Profile not found");
        }

        // Clean up hosted activities before deleting the profile to avoid FK violations.
        return this.prisma.$transaction([
            this.prisma.activity.deleteMany({
                where: { host_id: profile.id },
            }),
            this.prisma.user_profiles.delete({
                where: { user_id: userId },
            }),
        ]);
    }

    private parseDateOrThrow(dateString: string): Date {
        const trimmed = dateString?.trim();
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

        if (!trimmed || !isoDateRegex.test(trimmed)) {
            throw new BadRequestException('dateOfBirth must be in YYYY-MM-DD format');
        }

        const parsed = new Date(trimmed);
        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException('dateOfBirth must be in YYYY-MM-DD format');
        }

        return parsed;
    }

    private normalizeUsernameOrThrow(username: string): string {
        const normalized = (username ?? '').trim().toLowerCase();
        const twitterStyleUsernameRegex = /^[a-z0-9_]{3,15}$/;

        if (!twitterStyleUsernameRegex.test(normalized)) {
            throw new BadRequestException({
                statusCode: 400,
                message: 'Invalid username',
                details: [{
                    field: 'username',
                    code: 'invalid_format',
                    message: 'Username must be 3-15 characters and contain only lowercase letters, numbers, or underscores',
                }],
                timestamp: new Date().toISOString(),
            });
        }

        return normalized;
    }

    private async claimUsernameOrThrow(
        tx: Prisma.TransactionClient,
        username: string,
        supabaseUserId: string,
    ) {
        const existingReservation = await tx.usernames.findUnique({
            where: { username },
        });

        if (existingReservation && existingReservation.claimed_by_user_id !== supabaseUserId) {
            throw this.buildUsernameTakenException(username);
        }

        if (!existingReservation) {
            await tx.usernames.create({
                data: {
                    username,
                    claimed_by_user_id: supabaseUserId,
                },
            });
        }
    }

    private isUsernameConflict(error: unknown): boolean {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
            return false;
        }

        if (error.code !== 'P2002') {
            return false;
        }

        const target = Array.isArray(error.meta?.target)
            ? error.meta?.target.join(',')
            : String(error.meta?.target ?? '');

        return target.includes('username');
    }

    private buildUsernameTakenException(username: string): BadRequestException {
        return new BadRequestException({
            statusCode: 400,
            message: 'Username is already taken',
            details: [{
                field: 'username',
                code: 'already_taken',
                message: `@${username} is already taken`,
            }],
            timestamp: new Date().toISOString(),
        });
    }
}

