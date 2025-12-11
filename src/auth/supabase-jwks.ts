import { createRemoteJWKSet, decodeProtectedHeader, JWTPayload, jwtVerify } from "jose";

let supabaseIssuer: string | undefined;
let supabaseJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let supabaseJwtSecret: Uint8Array | undefined;

function getSupabaseIssuer(): string {
    if (!supabaseIssuer) {
        const projectRef = process.env.SUPABASE_PROJECT_REF;

        if (!projectRef) {
            throw new Error("Missing SUPABASE_PROJECT_REF env variable");
        }

        supabaseIssuer = `https://${projectRef}.supabase.co/auth/v1`;
    }

    return supabaseIssuer;
}

function getSupabaseJwks() {
    if (!supabaseJwks) {
        const issuer = getSupabaseIssuer();
        supabaseJwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    }

    return supabaseJwks;
}

function getSupabaseJwtSecret(): Uint8Array {
    if (!supabaseJwtSecret) {
        const secret = process.env.SUPABASE_SECRET_KEY;

        if (!secret) {
            throw new Error("Missing SUPABASE_SECRET_KEY env variable");
        }

        supabaseJwtSecret = new TextEncoder().encode(secret);
    }

    return supabaseJwtSecret;
}

export async function verifySupabaseJwt(token: string): Promise<JWTPayload> {
    const issuer = getSupabaseIssuer();
    const { alg } = decodeProtectedHeader(token);

    if (alg?.startsWith("HS")) {
        const secret = getSupabaseJwtSecret();
        const { payload } = await jwtVerify(token, secret, { issuer });
        return payload;
    }

    const jwks = getSupabaseJwks();
    const { payload } = await jwtVerify(token, jwks, { issuer });

    return payload;
}