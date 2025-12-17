import { AuthenticatedUser } from "./authenticated-user.interface";
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser
}