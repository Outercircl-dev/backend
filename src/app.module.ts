import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FeedModule } from './feed/feed.module';
import { MeController } from './me/me.controller';
import { ConfigModule } from '@nestjs/config';
import { MeModule } from './me/me.module';

@Module({
  imports: [AuthModule, UsersModule, FeedModule, ConfigModule.forRoot(), MeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
