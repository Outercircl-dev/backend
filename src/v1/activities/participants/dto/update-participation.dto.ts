import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateParticipationDto {
  @IsString()
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

