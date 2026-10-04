import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { openBuffer, sealBuffer } from '@autoapply/crypto';
import { PrismaService } from '../../database/prisma.service';
import { UserKeyService } from '../users/user-key.service';

const JOB_INTAKE_QUEUE = 'job-intake';
const RESUME_PROCESSING_QUEUE = 'resume-processing';
const MAX_LINKS = 10;
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

@Injectable()
export class DayOneService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly jobIntakeQueue: Queue;
  private readonly resumeQueue: Queue;
  private readonly s3: S3Client;
  private readonly bucket: string;
  private bucketReady?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly userKeys: UserKeyService,
  ) {
    this.connection = new IORedis(config.getOrThrow<string>('redis_url'), {
      maxRetriesPerRequest: null,
    });
    this.jobIntakeQueue = new Queue(JOB_INTAKE_QUEUE, { connection: this.connection });
    this.resumeQueue = new Queue(RESUME_PROCESSING_QUEUE, { connection: this.connection });
    this.bucket = config.getOrThrow<string>('s3_bucket');
    const endpoint = config.get<string>('s3_endpoint') || undefined;
    this.s3 = new S3Client({
      region: config.getOrThrow<string>('s3_region'),
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId: config.getOrThrow<string>('s3_access_key'),
        secretAccessKey: config.getOrThrow<string>('s3_secret_key'),
      },
    });
  }

  async submitJobLinks(userId: string, values: unknown[]) {
    if (values.length === 0 || values.length > MAX_LINKS) {
      throw new BadRequestException(`Submit between 1 and ${MAX_LINKS} job links.`);
    }
    const urls = values.map(normalizeJobUrl);
    if (new Set(urls).size !== urls.length) {
      throw new BadRequestException('Remove duplicate job links before submitting.');
    }

    const results = [];
    for (const url of urls) {
      let intake = await this.prisma.jobIntake.findUnique({
        where: { userId_url: { userId, url } },
      });
      let shouldQueue = false;
      if (!intake) {
        try {
          intake = await this.prisma.jobIntake.create({ data: { userId, url } });
          shouldQueue = true;
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            throw error;
          }
          intake = await this.prisma.jobIntake.findUnique({
            where: { userId_url: { userId, url } },
          });
          if (!intake) throw error;
        }
      }

      if (intake.status === 'FAILED') {
        intake = await this.prisma.jobIntake.update({
          where: { id: intake.id },
          data: { status: 'PENDING', error: null },
        });
        shouldQueue = true;
      }
      if (shouldQueue) {
        await this.jobIntakeQueue.add(
          'inspect-job-link',
          { intakeId: intake.id },
          {
            jobId: `job-intake-${intake.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: 500,
            removeOnFail: true,
          },
        );
      }
      results.push(intake);
    }
    return { intakes: results };
  }

  listJobIntakes(userId: string) {
    return this.prisma.jobIntake.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async uploadResume(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    if (file.size > MAX_RESUME_BYTES || file.buffer.length > MAX_RESUME_BYTES) {
      throw new BadRequestException('Resume files must be 10 MB or smaller.');
    }
    if (
      file.mimetype !== 'application/pdf' ||
      !file.originalname.toLowerCase().endsWith('.pdf') ||
      file.buffer.length < 5 ||
      file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new BadRequestException('Upload a valid PDF resume.');
    }

    const id = randomUUID();
    const objectKey = `resumes/${userId}/${id}.pdf.enc`;
    const dek = await this.userKeys.getDek(userId);
    const encryptedFile = sealBuffer(file.buffer, dek, id);
    const fileName = file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 180) || 'resume.pdf';
    let row;
    let uploaded = false;
    try {
      await this.ensureBucket();
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: encryptedFile,
          ContentType: 'application/octet-stream',
          ServerSideEncryption: 'AES256',
        }),
      );
      uploaded = true;
      row = await this.prisma.resume.create({
        data: {
          id,
          userId,
          fileName,
          contentType: 'application/pdf',
          objectKey,
          sizeBytes: file.size,
        },
        select: {
          id: true,
          fileName: true,
          sizeBytes: true,
          status: true,
          pageCount: true,
          error: true,
          createdAt: true,
        },
      });
      await this.resumeQueue.add(
        'extract-resume-text',
        { resumeId: id },
        {
          jobId: `resume-${id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 500,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      if (row) {
        await this.prisma.resume.update({
          where: { id },
          data: { status: 'FAILED', error: 'Processing could not be queued.' },
        });
      }
      if (uploaded) {
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      }
      throw error;
    }
    return row;
  }

  listResumes(userId: string) {
    return this.prisma.resume.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        sizeBytes: true,
        status: true,
        pageCount: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async previewResume(userId: string, id: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { id, userId },
      select: { id: true, status: true, extractedTextEnc: true },
    });
    if (!resume) throw new NotFoundException('Resume not found.');
    if (resume.status !== 'READY' || !resume.extractedTextEnc) {
      throw new ConflictException('Resume text is not ready to preview.');
    }
    const dek = await this.userKeys.getDek(userId);
    return {
      text: openBuffer(resume.extractedTextEnc, dek, `${resume.id}:text`).toString('utf8'),
    };
  }

  async deleteResume(userId: string, id: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { id, userId },
      select: { id: true, objectKey: true },
    });
    if (!resume) throw new NotFoundException('Resume not found.');
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: resume.objectKey }),
    );
    await this.prisma.resume.deleteMany({ where: { id, userId } });
    return { id, deleted: true };
  }

  async listNotifications(userId: string) {
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          kind: true,
          title: true,
          message: true,
          resourcePath: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { notifications, unreadCount };
  }

  async markNotificationRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      const notification = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true, readAt: true },
      });
      if (!notification) throw new NotFoundException('Notification not found.');
      return notification;
    }
    return this.prisma.notification.findFirstOrThrow({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
  }

  async markAllNotificationsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async onModuleDestroy() {
    await Promise.all([
      this.jobIntakeQueue.close(),
      this.resumeQueue.close(),
      this.connection.quit(),
    ]);
    this.s3.destroy();
  }

  private async ensureBucket(): Promise<void> {
    if (!this.configuredLocalEndpoint) return;
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        try {
          await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
        } catch (error) {
          const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode;
          const name = error instanceof Error ? error.name : '';
          if (status !== 404 && name !== 'NotFound' && name !== 'NoSuchBucket') {
            throw error;
          }
          try {
            await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
          } catch (createError) {
            const createName = createError instanceof Error ? createError.name : '';
            if (createName !== 'BucketAlreadyOwnedByYou' && createName !== 'BucketAlreadyExists') {
              throw createError;
            }
          }
        }
      })().catch((error: unknown) => {
        this.bucketReady = undefined;
        throw error;
      });
    }
    await this.bucketReady;
  }

  private get configuredLocalEndpoint(): boolean {
    return Boolean(this.config.get<string>('s3_endpoint'));
  }
}

export function normalizeJobUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new BadRequestException('Each job link must be a URL shorter than 2048 characters.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Every job link must be a valid HTTPS URL.');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new BadRequestException('Every job link must be a public HTTPS URL without credentials or a custom port.');
  }
  url.hash = '';
  return url.toString();
}
