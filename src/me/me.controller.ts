import { Get, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "src/auth/supabase-auth.guard";

interface AuthenticatedUser {
    id: string
    supabaseUserId: string
    email: string
    hasOnboarded: boolean
    role: string
}

interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser
}

export class MeController {
    @UseGuards(SupabaseAuthGuard)
    @Get('me')
    async me(@Req() req: AuthenticatedRequest) {
        const user = req.user
        return {
            id: user.id,
            supabaseUserId: user.supabaseUserId,
            email: user.email,
            hasOnboarded: user.hasOnboarded,
            role: user.role,
        }
    }
}