import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, Max, ValidateNested } from 'class-validator';
import { ParticipantRatingDto } from './participant-rating.dto';

export class CreateActivityFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsBoolean()
  consentToAnalysis: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantRatingDto)
  participantRatings?: ParticipantRatingDto[];
}

