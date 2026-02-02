import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import type { MembershipTierRules } from 'src/config/membership-tiers.model';

export function isVerifiedHost(user?: AuthenticatedUser | null): boolean {
  return Boolean(user && user.role === 'authenticated');
}

export function assertVerifiedHost(user?: AuthenticatedUser | null) {
  if (!isVerifiedHost(user)) {
    throw new ForbiddenException('Only verified hosts can create or manage activities');
  }
}

export function assertHostCapacity(tierRules: MembershipTierRules, requested: number) {
  const maxAllowed = tierRules.hosting.maxParticipantsPerActivity;
  if (maxAllowed === null) {
    return;
  }
  const enforceExact = tierRules.hosting.enforceExactMaxParticipants;
  if (enforceExact && requested !== maxAllowed) {
    throw new ForbiddenException(`Free tier hosts must set max participants to ${maxAllowed}`);
  }
  if (!enforceExact && requested > maxAllowed) {
    throw new ForbiddenException(`Max participants cannot exceed ${maxAllowed} for your tier`);
  }
}

export function assertHostMonthlyLimit(tierRules: MembershipTierRules, hostedCount: number) {
  const maxHosts = tierRules.hosting.maxHostsPerMonth;
  if (maxHosts === null) {
    return;
  }
  if (hostedCount >= maxHosts) {
    throw new ForbiddenException(`Free tier hosts may only create ${maxHosts} activities per month`);
  }
}

export function assertGroupsEnabled(tierRules: MembershipTierRules) {
  if (!tierRules.groups.enabled) {
    throw new ForbiddenException('Only premium hosts can use groups');
  }
}

export function assertGroupSize(tierRules: MembershipTierRules, requested: number) {
  const maxMembers = tierRules.groups.maxMembers;
  if (requested > maxMembers) {
    throw new ForbiddenException(`Group size cannot exceed ${maxMembers}`);
  }
}

