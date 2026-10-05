import { createHash } from 'crypto';
import { lookup } from 'dns';
import { isIP, LookupFunction } from 'net';
import { dirname, join } from 'path';
import { request as httpsRequest } from 'https';
import {
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Job, Queue, Worker } from 'bullmq';
import { ApplicationState, Prisma, PrismaClient } from '@prisma/client';
import { openBuffer, sealBuffer, unwrapDek } from '@autoapply/crypto';
import { extractResumeProfileData, mergeResumeProfileData } from './resume-profile.extractor';

const JOB_INTAKE_QUEUE = 'job-intake';
const RESUME_PROCESSING_QUEUE = 'resume-processing';
const APPLICATION_PREPARE_QUEUE = 'application-prepare';
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const MAX_RESUME_PAGES = 50;
const MAX_EXTRACTED_CHARACTERS = 100_000;

interface IntakeTask {
  intakeId: string;
}

interface ResumeTask {
  resumeId: string;
}

interface DayOneWorkers {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createDayOneWorkers(
  redisUrl: string,
  prisma: PrismaClient,
): DayOneWorkers {
  const connection = redisConnectionOptions(redisUrl);
  const s3 = new S3Client({
    region: process.env.S3_REGION || process.env.AWS_REGION || 'ap-south-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials:
      process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
          }
        : undefined,
  });
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is required by resume processing workers.');

  const applicationPrepareQueue = new Queue(APPLICATION_PREPARE_QUEUE, {
    connection,
  });
  const jobIntakeWorker = new Worker<IntakeTask>(
    JOB_INTAKE_QUEUE,
    (job) => processJobIntake(job, prisma, applicationPrepareQueue),
    { connection, concurrency: 3 },
  );
  const resumeWorker = new Worker<ResumeTask>(
    RESUME_PROCESSING_QUEUE,
    (job) => processResume(job, prisma, s3, bucket),
    { connection, concurrency: 2 },
  );

  jobIntakeWorker.on('failed', (job, error) => {
    console.error(`Job intake ${job?.id ?? 'unknown'} failed:`, error);
  });
  resumeWorker.on('failed', (job, error) => {
    console.error(`Resume processing ${job?.id ?? 'unknown'} failed:`, error);
  });

  return {
    async start() {
      await Promise.all([
        jobIntakeWorker.waitUntilReady(),
        resumeWorker.waitUntilReady(),
        applicationPrepareQueue.waitUntilReady(),
      ]);
    },
    async stop() {
      await Promise.all([
        jobIntakeWorker.close(),
        resumeWorker.close(),
        applicationPrepareQueue.close(),
        s3.destroy(),
      ]);
    },
  };
}

async function processJobIntake(
  job: Job<IntakeTask>,
  prisma: PrismaClient,
  applicationPrepareQueue: Queue,
) {
  const intake = await prisma.jobIntake.findUnique({
    where: { id: job.data.intakeId },
  });
  if (!intake || intake.status === 'COMPLETED') return;

  await prisma.jobIntake.update({
    where: { id: intake.id },
    data: { status: 'PROCESSING', error: null },
  });

  try {
    const listing = await fetchJobListing(intake.url);
    const jobId = createHash('sha256').update(listing.url).digest('hex');
    const text = `${listing.title}\n${listing.description}`;
    const savedJob = await prisma.job.upsert({
      where: {
        source_externalId: { source: 'USER_SUBMITTED', externalId: jobId },
      },
      create: {
        source: 'USER_SUBMITTED',
        externalId: jobId,
        applyUrl: listing.url,
        canonicalUrl: listing.url,
        company: listing.company,
        title: listing.title,
        jdText: listing.description || null,
        contentHash: createHash('sha256').update(text).digest('hex'),
        rawData: Prisma.JsonNull,
      },
      update: {
        applyUrl: listing.url,
        canonicalUrl: listing.url,
        company: listing.company,
        title: listing.title,
        jdText: listing.description || null,
        contentHash: createHash('sha256').update(text).digest('hex'),
        lastSeen: new Date(),
        status: 'OPEN',
      },
    });
    const applicationResult = await ensureApplicationPreparation(
      prisma,
      applicationPrepareQueue,
      intake.userId,
      savedJob.id,
      savedJob.company,
      savedJob.title,
    );
    const application = applicationResult.application;
    const applicationPath = application
      ? `/app/applications/${application.id}`
      : `/app/jobs/${savedJob.id}`;
    const completionMessage = application
      ? application.state === 'PREPARING'
        ? `${listing.title} at ${listing.company} is being prepared for your review. Nothing will be submitted until you approve it.`
        : `${listing.title} at ${listing.company} already has an application in the ${application.state.toLowerCase().replace(/_/g, ' ')} state.`
      : `${listing.title} at ${listing.company} was added, but application preparation could not start: ${applicationResult.quotaError}.`;

    await prisma.$transaction([
      prisma.jobIntake.update({
        where: { id: intake.id },
        data: {
          status: 'COMPLETED',
          jobId: savedJob.id,
          error: applicationResult.quotaError,
        },
      }),
      prisma.notification.upsert({
        where: { dedupeKey: `job-intake:${intake.id}:completed` },
        create: {
          userId: intake.userId,
          kind: 'JOB_INTAKE_COMPLETED',
          title: 'Job link processed',
          message: completionMessage,
          resourcePath: applicationPath,
          dedupeKey: `job-intake:${intake.id}:completed`,
        },
        update: { message: completionMessage, resourcePath: applicationPath },
      }),
    ]);
  } catch (error) {
    const terminal = job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
    if (terminal) {
      await prisma.$transaction([
        prisma.jobIntake.update({
          where: { id: intake.id },
          data: {
            status: 'FAILED',
            error: 'This link could not be processed. Check that it is a public, active job posting.',
          },
        }),
        prisma.notification.upsert({
          where: { dedupeKey: `job-intake:${intake.id}:failed` },
          create: {
            userId: intake.userId,
            kind: 'JOB_INTAKE_FAILED',
            title: 'Job link needs attention',
            message: 'We could not process this link. Check that it is a public, active job posting and try again.',
            resourcePath: '/app/jobs/submit',
            dedupeKey: `job-intake:${intake.id}:failed`,
          },
          update: {},
        }),
      ]);
    } else {
      await prisma.jobIntake.update({
        where: { id: intake.id },
        data: { status: 'PENDING' },
      });
    }
    throw error;
  }
}

export async function ensureApplicationPreparation(
  prisma: PrismaClient,
  queue: Queue,
  userId: string,
  jobId: string,
  companyName: string,
  jobTitle: string,
) {
  let application = await prisma.application.findUnique({
    where: { userId_jobId: { userId, jobId } },
  });

  if (!application) {
    const quotaError = await getApplicationQuotaError(prisma, userId);
    if (quotaError) return { application: null, quotaError };

    try {
      application = await prisma.$transaction(async (transaction) => {
        const created = await transaction.application.create({
          data: {
            userId,
            jobId,
            companyName,
            jobTitle,
            matchScore: 0,
            state: 'PREPARING',
          },
        });
        await transaction.applicationEvent.create({
          data: {
            applicationId: created.id,
            eventType: 'APPLICATION_STARTED',
            payload: { source: 'USER_SUBMITTED_LINK' },
          },
        });
        return created;
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      application = await prisma.application.findUnique({
        where: { userId_jobId: { userId, jobId } },
      });
      if (!application) throw error;
    }
  }

  if (application.state === 'PREPARING') {
    await queue.add(
      'prepare_application',
      { applicationId: application.id },
      {
        jobId: `prepare-${application.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    );
  }

  return { application, quotaError: null };
}

export async function getApplicationQuotaError(
  prisma: PrismaClient,
  userId: string,
): Promise<string | null> {
  const subscription = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { plan: true, renewalOption: true },
  });
  if (!subscription) return 'No active subscription';
  if (subscription.status !== 'ACTIVE') {
    return `Subscription status: ${subscription.status}`;
  }
  const now = new Date();
  if (subscription.currentPeriodEnd && now > subscription.currentPeriodEnd) {
    return 'Subscription period expired';
  }

  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const countableStates = {
    notIn: [ApplicationState.FAILED, ApplicationState.REJECTED],
  };
  const [todayCount, monthCount] = await Promise.all([
    prisma.application.count({
      where: { userId, state: countableStates, createdAt: { gte: dayStart } },
    }),
    prisma.application.count({
      where: { userId, state: countableStates, createdAt: { gte: monthStart } },
    }),
  ]);
  if (todayCount >= subscription.plan.dailyCap) {
    return 'Daily application limit reached';
  }

  const monthlyQuota =
    subscription.plan.monthlyQuota + (subscription.renewalOption?.app_increase ?? 0);
  if (monthCount >= monthlyQuota) {
    return 'Monthly application quota reached';
  }
  return null;
}

async function processResume(
  job: Job<ResumeTask>,
  prisma: PrismaClient,
  s3: S3Client,
  bucket: string,
) {
  const resume = await prisma.resume.findUnique({
    where: { id: job.data.resumeId },
  });
  if (!resume || resume.status === 'READY') return;

  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: resume.objectKey }),
    );
    const encrypted = await readBody(response.Body, MAX_RESUME_BYTES + 64);
    const wrappedDek = await prisma.userKey.findUnique({
      where: { user_id: resume.userId },
      select: { dek_wrapped: true },
    });
    if (!wrappedDek) throw new Error('Resume encryption key is unavailable.');
    const dek = await unwrapDek(wrappedDek.dek_wrapped);
    const pdf = openBuffer(encrypted, dek, resume.id);
    if (
      pdf.length > MAX_RESUME_BYTES ||
      pdf.length < 5 ||
      pdf.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new Error('Stored resume failed PDF integrity checks.');
    }

    const pdfjs = await loadPdfJs();
    const pdfModulePath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfAssetPath = join(dirname(pdfModulePath), '../../');
    const document = await pdfjs.getDocument({
      data: new Uint8Array(pdf),
      isEvalSupported: false,
      useWorkerFetch: false,
      disableFontFace: true,
      cMapUrl: join(pdfAssetPath, 'cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: join(pdfAssetPath, 'standard_fonts/'),
    }).promise;
    try {
      if (document.numPages < 1 || document.numPages > MAX_RESUME_PAGES) {
        throw new Error(`Resume must contain between 1 and ${MAX_RESUME_PAGES} pages.`);
      }
      const textParts: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageLines: string[] = [];
        let currentLine = '';
        let previousY: number | undefined;
        for (const item of content.items) {
          if (!('str' in item) || !item.str) continue;
          const y = 'transform' in item && Array.isArray(item.transform)
            ? item.transform[5]
            : undefined;
          if (typeof y === 'number' && previousY !== undefined && Math.abs(y - previousY) > 2) {
            pageLines.push(currentLine);
            currentLine = item.str;
          } else {
            currentLine = currentLine ? `${currentLine} ${item.str}` : item.str;
          }
          if (typeof y === 'number') previousY = y;
        }
        if (currentLine) pageLines.push(currentLine);
        textParts.push(pageLines.join('\n'));
        page.cleanup();
      }
      const extractedText = textParts
        .join('\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .trim();
      if (!extractedText) {
        throw new Error('No selectable text was found. Scanned-image resumes are not supported yet.');
      }
      const truncated = extractedText.slice(0, MAX_EXTRACTED_CHARACTERS);
      await saveExtractedProfileData(
        prisma,
        resume.userId,
        dek,
        wrappedDek.dek_wrapped,
        extractResumeProfileData(truncated),
      );
      await prisma.$transaction([
        prisma.resume.update({
          where: { id: resume.id },
          data: {
            status: 'READY',
            extractedTextEnc: sealBuffer(truncated, dek, `${resume.id}:text`),
            pageCount: document.numPages,
            error: null,
          },
        }),
        prisma.notification.upsert({
          where: { dedupeKey: `resume:${resume.id}:ready` },
          create: {
            userId: resume.userId,
            kind: 'RESUME_READY',
            title: 'Resume is ready',
            message: `${resume.fileName} was uploaded and its text is ready for application preparation.`,
            resourcePath: '/app/resume',
            dedupeKey: `resume:${resume.id}:ready`,
          },
          update: {},
        }),
      ]);
    } finally {
      await document.destroy();
    }
  } catch (error) {
    const terminal = job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
    if (terminal) {
      const reason = safeResumeError(error);
      await prisma.$transaction([
        prisma.resume.update({
          where: { id: resume.id },
          data: { status: 'FAILED', error: reason },
        }),
        prisma.notification.upsert({
          where: { dedupeKey: `resume:${resume.id}:failed` },
          create: {
            userId: resume.userId,
            kind: 'RESUME_FAILED',
            title: 'Resume could not be processed',
            message: `${resume.fileName}: ${reason}`,
            resourcePath: '/app/resume',
            dedupeKey: `resume:${resume.id}:failed`,
          },
          update: {},
        }),
      ]);
    }
    throw error;
  }
}

async function saveExtractedProfileData(
  prisma: PrismaClient,
  userId: string,
  dek: Buffer,
  wrappedDek: Buffer,
  extracted: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(extracted).length === 0) return;

  await prisma.$transaction(async (transaction) => {
    const profile = await transaction.profile.findUnique({ where: { user_id: userId } });
    const existingData: Record<string, unknown> = profile
      ? JSON.parse(openBuffer(profile.data_enc, dek, userId).toString('utf8')) as Record<string, unknown>
      : {};
    const merged = mergeResumeProfileData(existingData, extracted);
    if (!merged.changed) return;

    const dataEnc = sealBuffer(JSON.stringify(merged.data), dek, userId);
    const version = profile ? profile.current_version + 1 : 1;
    if (profile) {
      await transaction.profile.update({
        where: { user_id: userId },
        data: { data_enc: dataEnc, current_version: version },
      });
    } else {
      await transaction.profile.create({
        data: {
          user_id: userId,
          data_enc: dataEnc,
          dek_wrapped: wrappedDek,
          current_version: version,
        },
      });
    }
    await transaction.profileVersion.create({
      data: { user_id: userId, version, data_enc: dataEnc },
    });
  });
}

interface JobListing {
  url: string;
  title: string;
  company: string;
  description: string;
}

async function fetchJobListing(startUrl: string): Promise<JobListing> {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
    if (current.protocol !== 'https:' || current.username || current.password || current.port) {
      throw new Error('Only public HTTPS job links are supported.');
    }
    const response = await fetchPublicHttps(current);
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      current = new URL(response.location, current);
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Job site returned HTTP ${response.statusCode}.`);
    }
    if (!/^text\/html(?:;|$)/i.test(response.contentType)) {
      throw new Error('The job link did not return an HTML page.');
    }
    const html = response.body.toString('utf8');
    const title =
      getMeta(html, ['og:title', 'twitter:title']) ||
      decodeEntities(stripTags(match(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? ''));
    const description =
      getMeta(html, ['og:description', 'description', 'twitter:description']) ||
      decodeEntities(stripTags(match(html, /<main[^>]*>([\s\S]*?)<\/main>/i) ?? ''))
        .replace(/\s+/g, ' ')
        .slice(0, 20_000);
    if (!title) throw new Error('The job posting did not include a title.');

    const company =
      getMeta(html, ['og:site_name', 'application-name']) ||
      cleanHostname(current.hostname);
    return {
      url: current.toString(),
      title: title.slice(0, 300),
      company: company.slice(0, 200),
      description: description.slice(0, 20_000),
    };
  }
  throw new Error('The job site redirected too many times.');
}

function fetchPublicHttps(url: URL): Promise<{
  statusCode: number;
  location?: string;
  contentType: string;
  body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'AutoApplyJobIntake/1.0',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'identity',
        },
        timeout: 10_000,
        lookup: publicLookup as LookupFunction,
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          resolve({
            statusCode: response.statusCode,
            location: response.headers.location,
            contentType: response.headers['content-type'] ?? '',
            body: Buffer.alloc(0),
          });
          response.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_HTML_BYTES) {
            request.destroy(new Error('Job page exceeded the maximum size.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            statusCode: response.statusCode ?? 0,
            contentType: response.headers['content-type'] ?? '',
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    const totalTimeout = setTimeout(
      () => request.destroy(new Error('Job site request timed out.')),
      12_000,
    );
    request.on('close', () => clearTimeout(totalTimeout));
    request.on('timeout', () => request.destroy(new Error('Job site request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

export function publicLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | Array<{ address: string; family: number }>,
    family?: number,
  ) => void,
) {
  if (isRestrictedHostname(hostname)) {
    return callback(new Error('Local or internal host rejected.') as NodeJS.ErrnoException, '');
  }
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (!isPublicIp(hostname)) {
      return callback(new Error('Private host rejected.') as NodeJS.ErrnoException, '');
    }
    const literalAddress = [{ address: hostname, family: literalFamily }];
    return options.all
      ? callback(null, literalAddress)
      : callback(null, hostname, literalFamily);
  }
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, '');
    if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
      return callback(
        new Error('Job site resolved to a private or restricted address.') as NodeJS.ErrnoException,
        '',
      );
    }
    const selected = addresses[0];
    if (!selected) {
      return callback(new Error('Job site hostname returned no addresses.') as NodeJS.ErrnoException, '');
    }
    return options.all
      ? callback(null, addresses)
      : callback(null, selected.address, selected.family);
  });
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isRestrictedHostname(host)) {
    throw new Error('Local or internal host rejected.');
  }
  if (isIP(host)) {
    if (!isPublicIp(host)) throw new Error('Private or restricted host rejected.');
    return;
  }
  await new Promise<void>((resolve, reject) => {
    lookup(host, { all: true, verbatim: true }, (error, addresses) => {
      if (error) {
        reject(error);
        return;
      }
      if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
        reject(new Error('Hostname resolved to a private or restricted address.'));
        return;
      }
      resolve();
    });
  });
}

function isRestrictedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  );
}

export function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 88 && address.split('.')[2] === '99') ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (family === 6) {
    const firstSegment = parseInt(address.split(':')[0], 16);
    const normalized = address.toLowerCase();
    return firstSegment >= 0x2000 &&
      firstSegment <= 0x3fff &&
      !normalized.startsWith('2001:db8:') &&
      !normalized.startsWith('2001:2:');
  }
  return false;
}

function getMeta(html: string, names: string[]): string {
  for (const name of names) {
    const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
    for (const tag of tags) {
      const key = match(tag, /\b(?:name|property)\s*=\s*["']([^"']+)["']/i);
      if (key?.toLowerCase() !== name.toLowerCase()) continue;
      const content = match(tag, /\bcontent\s*=\s*["']([^"']*)["']/i);
      if (content) return decodeEntities(content).trim();
    }
  }
  return '';
}

function match(value: string, expression: RegExp): string | null {
  return expression.exec(value)?.[1] ?? null;
}

function stripTags(value: string): string {
  return value.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number: string) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHostname(hostname: string): string {
  return hostname.replace(/^www\./i, '').split('.')[0]
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function readBody(body: unknown, maxBytes: number): Promise<Buffer> {
  if (
    !body ||
    typeof body !== 'object' ||
    !(Symbol.asyncIterator in body)
  ) {
    throw new Error('Resume object storage returned an invalid response.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error('Stored resume exceeded the processing limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}

async function loadPdfJs(): Promise<{
  getDocument(options: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
        cleanup(): void;
      }>;
      destroy(): Promise<void>;
    }>;
  };
}> {
  const nativeImport = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<{
    getDocument: (options: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage(pageNumber: number): Promise<{
          getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
          cleanup(): void;
        }>;
        destroy(): Promise<void>;
      }>;
    };
  }>;
  return nativeImport('pdfjs-dist/legacy/build/pdf.mjs');
}

function safeResumeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Resume processing failed.';
  return message.slice(0, 500);
}

function redisConnectionOptions(redisUrl: string) {
  const parsed = new URL(redisUrl);
  const database = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isFinite(database) ? database : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
