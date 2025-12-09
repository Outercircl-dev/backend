import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FeedModule } from './feed/feed.module';
import { MeController } from './me/me.controller';

@Module({
  imports: [AuthModule, UsersModule, FeedModule],
  controllers: [AppController, MeController],
  providers: [AppService],
})
export class AppModule { }
