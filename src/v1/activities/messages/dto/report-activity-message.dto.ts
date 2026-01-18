import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportActivityMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}

