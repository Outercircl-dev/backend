import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

export class ParticipantRatingDto {
  @IsString()
  @IsNotEmpty()
  profileId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

