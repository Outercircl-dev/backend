import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class CreateActivitySeriesDto {
  @IsIn(['daily', 'weekly', 'monthly'])
  frequency: 'daily' | 'weekly' | 'monthly';

  @IsInt()
  @Min(1)
  interval: number;

  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  occurrences?: number;
}

