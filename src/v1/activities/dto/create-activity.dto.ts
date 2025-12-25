import { IsString, IsNotEmpty, IsOptional, IsArray, IsObject, IsDateString, IsInt, Min, IsBoolean, ValidateNested, IsNumber, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

class LocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
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
  @IsNotEmpty()
  interests: string[];

  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @IsDateString()
  activityDate: string;

  @IsString()
  @IsNotEmpty()
  startTime: string; // Format: "HH:mm:ss" or "HH:mm"

  @IsOptional()
  @IsString()
  endTime?: string; // Format: "HH:mm:ss" or "HH:mm"

  @IsInt()
  @Min(1)
  maxParticipants: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

