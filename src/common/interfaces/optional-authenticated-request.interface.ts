import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.interface';

/**
 * Express request shape that may or may not include an authenticated user.
 * Useful for endpoints that should behave differently for signed-in viewers
 * without strictly requiring authentication.
 */
export interface OptionalAuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

