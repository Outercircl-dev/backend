import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

export interface ProfileInput {
    supabaseUserId: string;
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
        const parsedDob = this.parseDateOrThrow(dateOfBirth);

        return this.prisma.user_profiles.upsert({
            where: { user_id: supabaseUserId },
            update: {
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
            } as any,
            create: {
                user_id: supabaseUserId,
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
            } as any,
        });
    }

    async updateProfile(userId: string, input: ProfileUpdateInput) {
        const updateData: Record<string, any> = {};

        if (input.fullName !== undefined) updateData.full_name = input.fullName;
        if (input.gender !== undefined) updateData.gender = input.gender;
        if (input.profilePictureUrl !== undefined) updateData.profile_picture_url = input.profilePictureUrl;
        if (input.interests !== undefined) updateData.interests = input.interests;
        if (input.bio !== undefined) updateData.bio = input.bio;
        if (input.hobbies !== undefined) updateData.hobbies = input.hobbies;
        if (input.distanceRadiusKm !== undefined) updateData.distance_radius_km = input.distanceRadiusKm;
        if (input.availability !== undefined) updateData.availability = input.availability;

        return this.prisma.user_profiles.update({
            where: { user_id: userId },
            data: updateData,
        });
    }

    async getProfile(userId: string) {
        return this.prisma.user_profiles.findUnique({
            where: { user_id: userId },
        });
    }

    async deleteProfile(userId: string) {
        return this.prisma.user_profiles.delete({
            where: { user_id: userId },
        });
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
}

