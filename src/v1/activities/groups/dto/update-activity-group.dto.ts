import { PartialType } from '@nestjs/mapped-types';
import { CreateActivityGroupDto } from './create-activity-group.dto';

export class UpdateActivityGroupDto extends PartialType(CreateActivityGroupDto) {}

