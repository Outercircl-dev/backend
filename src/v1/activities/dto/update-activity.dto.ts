import { PartialType } from '@nestjs/mapped-types';
import { CreateActivityDto } from './create-activity.dto';
import { IsOptional } from 'class-validator';

export class UpdateActivityDto extends PartialType(CreateActivityDto) {
  // All fields are optional via PartialType
}

