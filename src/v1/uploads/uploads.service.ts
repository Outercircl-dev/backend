import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { CreateActivityImageUploadDto } from './dto/create-activity-image-upload.dto';

type PresignedUploadResponse = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
};

@Injectable()
export class UploadsService {
  private readonly s3Client: S3Client;
  private readonly region: string;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly keyPrefix: string;
  private readonly uploadExpirySeconds = 300;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') ?? 'eu-west-1';
    this.bucket =
      this.configService.get<string>('AWS_S3_ACTIVITY_IMAGES_BUCKET') ?? '';
    this.keyPrefix =
      this.configService.get<string>('AWS_S3_ACTIVITY_IMAGES_KEY_PREFIX') ??
      'activities/images';

    this.publicBaseUrl =
      this.configService.get<string>(
        'AWS_S3_ACTIVITY_IMAGES_PUBLIC_BASE_URL',
      ) ?? `https://${this.bucket}.s3.${this.region}.amazonaws.com`;

    this.s3Client = new S3Client({ region: this.region });
  }

  async createActivityImagePresign(
    dto: CreateActivityImageUploadDto,
  ): Promise<PresignedUploadResponse> {
    if (!this.bucket) {
      throw new BadRequestException(
        'Activity image uploads are not configured on the server',
      );
    }
    const sanitizedName = this.sanitizeFileName(dto.fileName);
    const key = `${this.keyPrefix}/${randomUUID()}-${sanitizedName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: this.uploadExpirySeconds,
    });

    const publicUrl = `${this.publicBaseUrl.replace(/\/+$/, '')}/${key}`;

    return {
      uploadUrl,
      publicUrl,
      key,
      expiresInSeconds: this.uploadExpirySeconds,
    };
  }

  private sanitizeFileName(fileName: string): string {
    const trimmed = fileName.trim().toLowerCase();
    if (!trimmed) {
      throw new BadRequestException('File name is required');
    }
    const safe = trimmed.replace(/[^a-z0-9._-]/g, '-');
    return safe.slice(0, 120);
  }
}
