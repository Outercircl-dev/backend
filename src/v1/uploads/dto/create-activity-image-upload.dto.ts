import { IsInt, IsNotEmpty, IsString, IsIn, Max, Min } from 'class-validator';

export class CreateActivityImageUploadDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  fileSize: number;
}
