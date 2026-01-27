import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { verifySupabaseJwt } from "./supabase-jwks";
import { Strategy } from "passport-custom";
import { SubscriptionTier } from "src/common/enums/subscription-tier.enum";

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
            const sanitizedPayload = this.sanitizePayload(payload);
            const payloadPreview = typeof sanitizedPayload === 'object' ? JSON.stringify(sanitizedPayload) : String(sanitizedPayload);
            this.logger.debug(`JWT Token verification completed. payload=${payloadPreview}`);

            if (!payload.sub) {
                throw new UnauthorizedException("Missing sub in JWT");
            }

            return {
                supabaseUserId: payload.sub,
                email: payload.email,
                role: payload.role,
                type: this.extractSubscriptionTier(payload),
                raw: payload,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Supabase JWT verification error: ${message}`, err instanceof Error ? err.stack : undefined);
            throw new UnauthorizedException("Invalid Supabase token");
        }
    }

    private sanitizePayload(payload: SupabaseJwtPayload | unknown): Record<string, unknown> {
        if (!payload || typeof payload !== 'object') {
            return { type: typeof payload };
        }

        const input = payload as SupabaseJwtPayload;
        const sanitized: Record<string, unknown> = {};

        if (input.sub) sanitized.sub = this.maskValue(input.sub);
        if (input.iss) sanitized.iss = input.iss;
        if (input.aud) sanitized.aud = input.aud;
        if (input.iat) sanitized.iat = input.iat;
        if (input.exp) sanitized.exp = input.exp;
        if (input.role) sanitized.role = input.role;
        if (input.app_metadata?.subscription_tier) sanitized.subscription_tier = input.app_metadata.subscription_tier;
        if (input.user_metadata?.subscription_tier) sanitized.subscription_tier = input.user_metadata.subscription_tier;

        return sanitized;
    }

    private maskValue(value: string): string {
        if (!value) return '';
        if (value.length <= 6) return `${value[0]}***${value[value.length - 1]}`;
        return `${value.slice(0, 3)}***${value.slice(-3)}`;
    }

    private extractSubscriptionTier(payload: SupabaseJwtPayload | Record<string, any> | unknown): SubscriptionTier | undefined {
        if (!payload || typeof payload !== 'object') {
            return undefined;
        }

        const rawPayload = payload as Record<string, any>;
        const rawTier =
            rawPayload?.app_metadata?.subscription_tier ??
            rawPayload?.user_metadata?.subscription_tier ??
            rawPayload?.subscription_tier;

        if (!rawTier || typeof rawTier !== 'string') {
            return undefined;
        }

        const normalized = rawTier.toUpperCase();
        if (normalized === SubscriptionTier.PREMIUM) {
            return SubscriptionTier.PREMIUM;
        }
        if (normalized === SubscriptionTier.FREEMIUM) {
            return SubscriptionTier.FREEMIUM;
        }
        return undefined;
    }
}