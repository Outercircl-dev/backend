import type { MembershipTierKey } from "../../config/membership-tiers.model";

export interface AuthenticatedUser {
    id?: string;
    supabaseUserId?: string;
    email?: string;
    hasOnboarded?: boolean;
    role?: string;
    type?: MembershipTierKey;
    tierClass?: string;
}

