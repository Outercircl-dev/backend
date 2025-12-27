import { IsString, IsNotEmpty, IsOptional, IsArray, IsObject, IsDateString, IsInt, Min, IsBoolean, ValidateNested, IsNumber, MinLength, Max, ArrayMinSize, Matches } from 'class-validator';
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

  @IsOptional()
  @IsString()
  address?: string;
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
  @IsString()
  category?: string;

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

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
    message: 'startTime must be in HH:mm or HH:mm:ss format',
  })
  startTime: string; // Format: "HH:mm:ss" or "HH:mm"

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
    message: 'endTime must be in HH:mm or HH:mm:ss format',
  })
  endTime?: string; // Format: "HH:mm:ss" or "HH:mm"

  @IsInt()
  @Min(1)
  maxParticipants: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

