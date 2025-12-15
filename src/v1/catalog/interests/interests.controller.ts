import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { InterestsService } from './interests.service';


@Controller('interests')
export class InterestsController {

    constructor(private readonly interests: InterestsService) { }

    @UseGuards(SupabaseAuthGuard)
    @Get()
    async list(@Req() req: AuthenticatedRequest) {
        // Placeholder response; replace with actual interests once service exists
        return { categories: await this.interests.getInterestsCatalog() }
    }
}
