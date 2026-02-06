export interface MembershipTierHostingRules {
  maxParticipantsPerActivity: number | null;
  maxHostsPerMonth: number | null;
  enforceExactMaxParticipants: boolean;
}

export interface MembershipTierGroupRules {
  enabled?: boolean;
  maxMembers: number;
  notes?: string;
}

export interface MembershipTierAdsRules {
  showsAds: boolean;
}

export interface MembershipTierVerificationRules {
  requiresVerifiedHostForHosting: boolean;
}

export interface MembershipTierMessagingRules {
  groupChatEnabled: boolean;
  automatedMessagesEnabled: boolean;
  notes?: string;
}

export interface MembershipTierRules {
  metadata?: {
    tierClass?: string;
    displayName?: string;
  };
  hosting: MembershipTierHostingRules;
  groups: MembershipTierGroupRules;
  ads: MembershipTierAdsRules;
  verification: MembershipTierVerificationRules;
  messaging: MembershipTierMessagingRules;
}

export interface MembershipTierLogic {
  differences: string[];
}

export type MembershipTierKey = string;

export interface MembershipTierModel {
  version: string;
  lastUpdated: string;
  defaultTier?: MembershipTierKey;
  tiers: Record<MembershipTierKey, MembershipTierRules>;
  logic: MembershipTierLogic;
}
