import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { verifySupabaseJwt } from "./supabase-jwks";
import { Strategy } from "passport-custom";

export interface SupabaseJwtPayload {
    sub: string
    email?: string
    role?: string
    [key: string]: any
}

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(Strategy, 'supabase-jwt') {
    private readonly logger = new Logger(SupabaseJwtStrategy.name, { timestamp: true });

    async validate(req: Request): Promise<any> {
        this.logger.debug('Initiating JWT Validation using Supabase JWKS Strategy');
        const authHeader = (req.headers as any).authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            throw new UnauthorizedException("Missing or invalid Authorization header");
        }

        const token = authHeader.split(" ")[1];
        // Log minimal token diagnostics to help debug verification issues.
        this.logger.debug(`Supabase JWT header present. tokenLength=${token?.length ?? 0} tokenPrefix=${token?.slice(0, 12) ?? ''}`);

        try {
            const payload = await verifySupabaseJwt(token);
            const payloadPreview = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
            this.logger.debug(`JWT Token verification completed. payload=${payloadPreview}`);

            if (!payload.sub) {
                throw new UnauthorizedException("Missing sub in JWT");
            }

            return {
                supabaseUserId: payload.sub,
                email: payload.email,
                role: payload.role,
                raw: payload,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Supabase JWT verification error: ${message}`, err instanceof Error ? err.stack : undefined);
            throw new UnauthorizedException("Invalid Supabase token");
        }
    }
}