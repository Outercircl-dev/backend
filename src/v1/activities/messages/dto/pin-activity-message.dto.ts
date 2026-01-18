import { IsBoolean } from 'class-validator';

export class PinActivityMessageDto {
  @IsBoolean()
  isPinned: boolean;
}

