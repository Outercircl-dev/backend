import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from 'src/auth/supabase-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { CreateActivityImageUploadDto } from './dto/create-activity-image-upload.dto';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @UseGuards(SupabaseAuthGuard)
  @Post('activity-image/presign')
  async createActivityImagePresign(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateActivityImageUploadDto,
  ) {
    if (!req.user?.supabaseUserId) {
      throw new UnauthorizedException(
        'supabaseUserId missing from authenticated request',
      );
    }
    return this.uploadsService.createActivityImagePresign(body);
  }
}
