import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class ApplicationScreenshotService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('s3_bucket');
    const endpoint = config.get<string>('s3_endpoint') || undefined;
    this.client = new S3Client({
      region: config.getOrThrow<string>('s3_region'),
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId: config.getOrThrow<string>('s3_access_key'),
        secretAccessKey: config.getOrThrow<string>('s3_secret_key'),
      },
    });
  }

  async createReadUrl(objectKey: string): Promise<string> {
    if (!objectKey.startsWith('applications/') || objectKey.includes('..')) {
      throw new BadRequestException('Invalid screenshot reference');
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 300 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.client.destroy();
  }
}
