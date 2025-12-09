import { Controller, Get, UseGuards, Req } from '@nestjs/common'
import { FeedService } from './feed.service'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { Request } from 'express'

interface AuthenticatedRequest extends Request {
    user: {
        id: string
        supabaseUserId: string
        email: string
        hasOnboarded: boolean
        role: string
    }
}

@Controller('feed')
export class FeedController {
    constructor(private readonly feedService: FeedService) { }

    @UseGuards(SupabaseAuthGuard)
    @Get()
    async getFeed(@Req() req: AuthenticatedRequest) {
        const userId = req.user.id // or supabaseUserId, depending on your design
        return this.feedService.getFeedForUser(userId)
    }
}
