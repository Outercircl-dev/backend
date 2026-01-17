import { IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinActivityDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  inviteCode?: string;
}

