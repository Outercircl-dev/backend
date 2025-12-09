import { Controller, Get, Logger, Req, UseGuards } from "@nestjs/common";
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

@Controller('me')
export class MeController {
    private readonly logger = new Logger(MeController.name, { timestamp: true });

    @UseGuards(SupabaseAuthGuard)
    @Get()
    async me(@Req() req: AuthenticatedRequest) {
        this.logger.log('Getting Profile information')
        this.logger.debug(`Request = ${req}`)
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