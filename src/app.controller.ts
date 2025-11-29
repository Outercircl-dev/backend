import { Controller, Post, UseGuards, UnauthorizedException, Get, Req } from '@nestjs/common';
import { LocalAuthGuard } from './auth/local-auth.guard';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import type { Request } from 'express';

@Controller()
export class AppController {
  constructor(private authService: AuthService) { }

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  async login(@Req() req: Request) {
    return this.authService.login(req.user);
  }

  @UseGuards(LocalAuthGuard)
  @Post('auth/logout')
  async logout(@Req() req: Request) {
    return req.logout((err: any) => {
      throw new UnauthorizedException(err)
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: Request) {
    return req.user
  }

}
