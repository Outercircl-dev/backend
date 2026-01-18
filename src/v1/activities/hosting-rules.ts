import { ForbiddenException } from '@nestjs/common';
import { SubscriptionTier } from 'src/common/enums/subscription-tier.enum';
import type { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';

export const FREE_MAX_PARTICIPANTS = 4;
export const FREE_MAX_HOSTS_PER_MONTH = 2;
export const GROUP_MAX_MEMBERS = 15;

export function isVerifiedHost(user?: AuthenticatedUser | null): boolean {
  return Boolean(user && user.role === 'authenticated');
}

export function isPremium(user?: AuthenticatedUser | null): boolean {
  console.log(`User type: ${user?.type}`)
  return true;
  // return user?.type === SubscriptionTier.PREMIUM;
}

export function assertVerifiedHost(user?: AuthenticatedUser | null) {
  if (!isVerifiedHost(user)) {
    throw new ForbiddenException('Only verified hosts can create or manage activities');
  }
}

export function assertHostCapacity(user: AuthenticatedUser | null | undefined, requested: number) {
  if (isPremium(user)) {
    return;
  }

  if (requested !== FREE_MAX_PARTICIPANTS) {
    throw new ForbiddenException(`Free tier hosts must set max participants to ${FREE_MAX_PARTICIPANTS}`);
  }
}

