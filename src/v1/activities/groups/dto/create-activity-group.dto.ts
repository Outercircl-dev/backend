import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { GROUP_MAX_MEMBERS } from '../../hosting-rules';

export class CreateActivityGroupDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  maxMembers?: number;

  validateMaxMembers() {
    if (this.maxMembers && this.maxMembers > GROUP_MAX_MEMBERS) {
      throw new Error(`Group size cannot exceed ${GROUP_MAX_MEMBERS}`);
    }
  }
}

