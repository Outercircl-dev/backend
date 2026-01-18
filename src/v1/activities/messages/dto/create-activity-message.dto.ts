import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateActivityMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsIn(['user', 'announcement'])
  messageType?: 'user' | 'announcement';

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

