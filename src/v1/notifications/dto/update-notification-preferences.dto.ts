import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  recommendedActivities?: boolean;

  @IsOptional()
  @IsBoolean()
  upcomingActivityReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  hostJoinCancelUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  timeLocationChangeAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  safetyAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  channelInApp?: boolean;

  @IsOptional()
  @IsBoolean()
  channelEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  channelBrowser?: boolean;
}

