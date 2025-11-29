import { AuthService } from './auth/auth.service';
import type { Request } from 'express';
export declare class AppController {
    private authService;
    constructor(authService: AuthService);
    login(req: Request): Promise<{
        access_token: string;
    }>;
    logout(req: Request): Promise<void>;
    getProfile(req: Request): Express.User | undefined;
}
