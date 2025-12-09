import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { jwtConstants } from "./constants";
import { UsersService } from "src/users/users.service";

export interface SupabaseJwtPayload {
    sub: string
    email?: string
    role?: string
    [key: string]: any
}

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(Strategy, 'supabase-jwt') {
    constructor(private readonly usersService: UsersService) {
        if (!process.env.SUPABASE_JWT_SECRET) {
            throw new Error('SUPABASE_JWT_SECRET is not set')
        }
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.SUPABASE_SECRET_KEY || jwtConstants.secret,
            algorithms: ['HS256']
        })
    }

    async validate(payload: SupabaseJwtPayload) {
        if (payload.role && payload.role !== 'authenticated') {
            throw new UnauthorizedException('Invalid Supabase Role')
        }
        // Fetch user data from DB
        const user = await this.usersService.findOrCreateFromSupabasePayload(payload);
        // If fetching failed raise Unauthorized Exception
        if (!user) {
            throw new UnauthorizedException('User not found or could not be created');
        }

        return {
            id: user.id,
            supabaseUserId: user.supabaseId,
            email: user.email,
            hasOnboarded: user.hasOnboarded,
            role: user.role,
        }
    }
}