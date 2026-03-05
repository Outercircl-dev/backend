import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
  IsDateString,
  IsInt,
  Min,
  IsBoolean,
  ValidateNested,
  IsNumber,
  MinLength,
  Max,
  ArrayMinSize,
  Matches,
  IsIn,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

class LocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(160)
  @Matches(/^(?=.*[\p{L}])[\p{L}\p{M}0-9\s,.'#/()&-]+$/u, {
    message:
      'address must contain letters and only standard address characters',
  })
  address: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[-A-Za-z0-9_]+$/, {
    message: 'placeId must only contain letters, numbers, hyphens, or underscores',
  })
  placeId?: string;
}

class RecurrenceDto {
  @IsString()
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

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(1024)
  imageUrl?: string | null;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @ArrayMinSize(1)
  interests: string[];

  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @IsDateString()
  activityDate: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
    message: 'startTime must be in HH:mm or HH:mm:ss format',
  })
  startTime: string; // Format: "HH:mm:ss" or "HH:mm"

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
    message: 'endTime must be in HH:mm or HH:mm:ss format',
  })
  endTime: string; // Format: "HH:mm:ss" or "HH:mm"

  @IsInt()
  @Min(1)
  maxParticipants: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  groupId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;
}
