import { SubscriptionTier } from "../enums/subscription-tier.enum";

export interface AuthenticatedUser {
    id?: string;
    supabaseUserId?: string;
    email?: string;
    hasOnboarded?: boolean;
    role?: string;
    type?: SubscriptionTier;
}

