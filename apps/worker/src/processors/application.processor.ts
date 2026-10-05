import { createHash } from 'crypto';
import { isIP } from 'net';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { openBuffer, generateDek, sealBuffer, unwrapDek, wrapDek } from '@autoapply/crypto';
import { Job, Queue, Worker } from 'bullmq';
import { chromium, Page } from 'playwright';
import { assertPublicHostname, isPublicIp } from './day-one.processor';

const PREPARE_QUEUE = 'application-prepare';
const SUBMIT_QUEUE = 'application-submit';
const CONFIRM_QUEUE = 'application-confirm';
const REFERRAL_QUEUE = 'referral-qualification';
const MAX_RETRIES = 5;
const MAX_CONFIRMATION_CHECKS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FormOption {
  label: string;
  value: string;
}

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options: FormOption[];
}

interface FormSchema {
  fields: FormField[];
  source: string;
  detectedAt: string;
}

interface ApplicationJobData {
  applicationId: string;
}

interface ConfirmationJobData extends ApplicationJobData {
  checkCount: number;
}

class ApplicationProcessingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly transient = false,
  ) {
    super(message);
    this.name = 'ApplicationProcessingError';
  }
}

export interface ApplicationWorkers {
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface ScreenshotStore {
  upload(userId: string, applicationId: string, label: string, image: Buffer): Promise<string>;
  close(): void;
}

export function createApplicationWorkers(
  redisUrl: string,
  prisma: PrismaClient,
): ApplicationWorkers {
  const connection = redisConnectionOptions(redisUrl);
  const screenshotStore = createScreenshotStore();
  const submissionQueue = new Queue(SUBMIT_QUEUE, { connection });
  const confirmationQueue = new Queue(CONFIRM_QUEUE, { connection });
  const referralQueue = new Queue(REFERRAL_QUEUE, { connection });
  const prepareWorker = new Worker(
    PREPARE_QUEUE,
    (job) => prepareApplication(job, prisma, screenshotStore),
    { connection, concurrency: 2 },
  );
  const submitWorker = new Worker(
    SUBMIT_QUEUE,
    (job) => submitApplication(job, prisma, submissionQueue, confirmationQueue, screenshotStore),
    { connection, concurrency: 2 },
  );
  const confirmWorker = new Worker(
    CONFIRM_QUEUE,
    (job) => confirmApplication(job, prisma, confirmationQueue),
    { connection, concurrency: 4 },
  );
  const referralWorker = new Worker(
    REFERRAL_QUEUE,
    (job) => rewardQualifiedReferral(job, prisma, referralQueue),
    { connection, concurrency: 2 },
  );

  for (const [name, worker] of [
    [PREPARE_QUEUE, prepareWorker],
    [SUBMIT_QUEUE, submitWorker],
    [CONFIRM_QUEUE, confirmWorker],
    [REFERRAL_QUEUE, referralWorker],
  ] as const) {
    worker.on('failed', (job, error) => {
      console.error(`${name} job ${job?.id ?? 'unknown'} failed:`, error);
    });
  }

  return {
    async start() {
      await Promise.all([
        prepareWorker.waitUntilReady(),
        submitWorker.waitUntilReady(),
        confirmWorker.waitUntilReady(),
        referralWorker.waitUntilReady(),
      ]);
    },
    async stop() {
      await Promise.all([
        prepareWorker.close(),
        submitWorker.close(),
        confirmWorker.close(),
        referralWorker.close(),
        submissionQueue.close(),
        confirmationQueue.close(),
        referralQueue.close(),
      ]);
      screenshotStore.close();
    },
  };
}

async function prepareApplication(
  job: Job<ApplicationJobData>,
  prisma: PrismaClient,
  screenshots: ScreenshotStore,
): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: job.data.applicationId },
    include: {
      job: true,
      user: { include: { profile: true, user_key: true, answer_bank: true } },
    },
  });
  if (!application || application.state !== 'PREPARING') return;

  let page: Page | undefined;
  try {
    page = await openApplicationPage(application.job.applyUrl);
    const schema = await readFormSchema(page, application.job.source);
    await prisma.formDetectionCache.upsert({
      where: { jobId: application.jobId },
      create: {
        jobId: application.jobId,
        schema: schema as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + DAY_MS),
      },
      update: {
        schema: schema as unknown as Prisma.InputJsonValue,
        parsedAt: new Date(),
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });
    const dek = await getUserDek(prisma, application.userId, application.user.user_key?.dek_wrapped);
    const profile = application.user.profile
      ? JSON.parse(
          openBuffer(
            application.user.profile.data_enc,
            dek,
            application.userId,
          ).toString('utf8'),
        ) as Record<string, unknown>
      : {};
    const answers = application.user.answer_bank.map((entry) => ({
      question: entry.question_text,
      value: openBuffer(entry.answer_enc, dek, application.userId).toString('utf8'),
    }));
    const matched = matchFormFields(schema, profile, answers, {
      email: application.user.email,
      phone: application.user.phone_e164,
    });
    await fillForm(page, schema, matched.payload, true);
    const screenshotUrl = await screenshots.upload(
      application.userId,
      application.id,
      'prepared',
      await page.screenshot({ type: 'png', fullPage: true }),
    );
    const serializedPayload = JSON.stringify(canonicalize(matched.payload));
    const payloadHash = createHash('sha256').update(serializedPayload).digest('hex');
    const encryptedPayload = sealBuffer(serializedPayload, dek, application.id);
    const state = matched.unknownFields.length > 0 ? 'NEEDS_INPUT' : 'AWAITING_APPROVAL';

    await prisma.application.updateMany({
      where: { id: application.id, state: 'PREPARING' },
      data: {
        state,
        formSchema: schema as unknown as Prisma.InputJsonValue,
        formPayload: encryptedPayload,
        formPayloadHash: payloadHash,
        unknownFields: matched.unknownFields as unknown as Prisma.InputJsonValue,
        screenshotUrl,
        currentStepIndex: 1,
      },
    });
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        eventType: 'FORM_DETECTED',
        payload: {
          fieldCount: schema.fields.length,
          state,
          unknownFieldCount: matched.unknownFields.length,
        },
      },
    });
    await notifyApplicationState(
      prisma,
      application.id,
      state,
      state === 'NEEDS_INPUT'
        ? 'Application needs your input'
        : 'Application ready for review',
      state === 'NEEDS_INPUT'
        ? `${application.jobTitle} at ${application.companyName} needs information from you before it can be reviewed.`
        : `${application.jobTitle} at ${application.companyName} is ready for your approval.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown form preparation error';
    const code =
      error instanceof ApplicationProcessingError ? error.code : 'PREPARATION_FAILED';
    const finalAttempt = job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
    if (error instanceof ApplicationProcessingError && error.transient && !finalAttempt) {
      throw error;
    }
    const changed = await prisma.application.updateMany({
      where: { id: application.id, state: 'PREPARING' },
      data: { state: 'FAILED', lastErrorCode: code, lastErrorMessage: message.slice(0, 1000) },
    });
    if (changed.count > 0) {
      await prisma.applicationEvent.create({
        data: {
          applicationId: application.id,
          eventType: 'FORM_DETECTION_FAILED',
          payload: { errorCode: code, errorMessage: message.slice(0, 1000) },
        },
      });
      await notifyApplicationState(
        prisma,
        application.id,
        'FAILED',
        'Application preparation failed',
        `We could not prepare ${application.jobTitle} at ${application.companyName}. Review the application for details.`,
      );
    }
    throw error;
  } finally {
    if (page) await closeApplicationPage(page);
  }
}

async function submitApplication(
  job: Job<ApplicationJobData>,
  prisma: PrismaClient,
  submitQueue: Queue,
  confirmQueue: Queue,
  screenshots: ScreenshotStore,
): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: job.data.applicationId },
    include: {
      job: true,
      user: { include: { profile: true, user_key: true } },
    },
  });
  if (!application || !['APPROVED', 'RETRYING'].includes(application.state)) return;
  if (!application.formPayload || !application.formPayloadHash) {
    await markSubmissionFailed(prisma, application.id, 'PAYLOAD_MISSING', 'Encrypted form payload is missing');
    return;
  }

  const transitioned = await prisma.application.updateMany({
    where: {
      id: application.id,
      state: application.state,
      submittedAt: null,
    },
    data: { state: 'SUBMITTING' },
  });
  if (transitioned.count !== 1) return;

  let clickStarted = false;
  let page: Page | undefined;
  let reviewSchema: FormSchema | undefined;
  try {
    const dek = await getUserDek(prisma, application.userId, application.user.user_key?.dek_wrapped);
    const plaintext = openBuffer(
      application.formPayload,
      dek,
      application.id,
    ).toString('utf8');
    const actualHash = createHash('sha256').update(plaintext).digest('hex');
    if (actualHash !== application.formPayloadHash) {
      throw new ApplicationProcessingError('PAYLOAD_MISMATCH', 'Application data integrity check failed');
    }
    const payload = JSON.parse(plaintext) as Record<string, unknown>;
    const cachedSchema = parseSchema(application.formSchema);
    page = await openApplicationPage(application.job.applyUrl);
    const currentSchema = await readFormSchema(page, application.job.source);
    reviewSchema = currentSchema;
    if (schemaSignature(currentSchema) !== schemaSignature(cachedSchema)) {
      const changedFields = fieldsForUserReview(currentSchema);
      await prisma.application.update({
        where: { id: application.id },
        data: {
          state: 'NEEDS_INPUT',
          formSchema: currentSchema as unknown as Prisma.InputJsonValue,
          unknownFields: changedFields as unknown as Prisma.InputJsonValue,
          lastErrorCode: 'FORM_CHANGED',
          lastErrorMessage: 'The employer form changed after approval. Review the form before approving again.',
        },
      });
      await prisma.applicationEvent.create({
        data: { applicationId: application.id, eventType: 'FORM_CHANGED' },
      });
      await notifyApplicationState(
        prisma,
        application.id,
        'NEEDS_INPUT',
        'Application needs your input',
        `The employer's form changed for ${application.jobTitle} at ${application.companyName}. Review it before continuing.`,
      );
      return;
    }

    await fillForm(page, currentSchema, payload);
    const pageText = (await page.locator('body').innerText()).toLowerCase();
    detectPageBlock(pageText);
    const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
    const screenshotKey = await screenshots.upload(
      application.userId,
      application.id,
      'pre-submit',
      await page.screenshot({ type: 'png', fullPage: true }),
    );
    await prisma.application.update({
      where: { id: application.id },
      data: { screenshotUrl: screenshotKey },
    });
    if (await submitButton.count() === 0) {
      const textButton = page.getByRole('button', { name: /apply|submit|send application/i }).first();
      if (await textButton.count() === 0) {
        throw new ApplicationProcessingError('SUBMIT_BUTTON_NOT_FOUND', 'Submit button not found');
      }
      clickStarted = true;
      await textButton.click({ timeout: 10000 });
    } else {
      clickStarted = true;
      await submitButton.click({ timeout: 10000 });
    }

    await page.waitForTimeout(1500);
    const resultText = (await page.locator('body').innerText()).toLowerCase();
    const success = /application (has been )?(received|submitted)|thank you for applying|successfully submitted|application complete/.test(resultText);
    if (!success) {
      const hasValidationError =
        (await page.locator('[aria-invalid="true"], .error, .alert-danger, [role="alert"]').count()) > 0;
      if (hasValidationError) {
        await prisma.application.update({
          where: { id: application.id },
          data: {
            state: 'NEEDS_INPUT',
            lastErrorCode: 'FORM_VALIDATION_ERROR',
            lastErrorMessage: 'The employer rejected one or more form values. Review the form and try again.',
            formSchema: currentSchema as unknown as Prisma.InputJsonValue,
            unknownFields: fieldsForUserReview(currentSchema) as unknown as Prisma.InputJsonValue,
          },
        });
        await prisma.applicationEvent.create({
          data: { applicationId: application.id, eventType: 'FORM_VALIDATION_ERROR' },
        });
        await notifyApplicationState(
          prisma,
          application.id,
          'NEEDS_INPUT',
          'Application needs your input',
          `The employer requested changes to information for ${application.jobTitle} at ${application.companyName}.`,
        );
        return;
      }
      throw new ApplicationProcessingError(
        'SUBMISSION_UNCONFIRMED',
        'The submit action completed, but no employer confirmation was detected.',
      );
    }

    const submittedAt = new Date();
    await prisma.application.update({
      where: { id: application.id },
      data: {
        state: 'SUBMITTED',
        submittedAt,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextRetryAt: null,
      },
    });
    await notifyApplicationState(
      prisma,
      application.id,
      'SUBMITTED',
      'Application submitted',
      `Your application for ${application.jobTitle} at ${application.companyName} was submitted. Confirmation tracking will continue.`,
    );
    try {
      const submittedScreenshot = await screenshots.upload(
        application.userId,
        application.id,
        'submitted',
        await page.screenshot({ type: 'png', fullPage: true }),
      );
      await prisma.application.update({
        where: { id: application.id },
        data: { submittedScreenshotUrl: submittedScreenshot },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown screenshot error';
      console.error(`Could not store submitted screenshot for ${application.id}: ${message}`);
      await prisma.application.update({
        where: { id: application.id },
        data: { lastErrorCode: 'SUBMITTED_SCREENSHOT_FAILED', lastErrorMessage: message.slice(0, 1000) },
      });
    }
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        eventType: 'FORM_SUBMITTED',
        payload: { submittedAt: submittedAt.toISOString() },
      },
    });
    try {
      await confirmQueue.add(
        'confirm_application',
        { applicationId: application.id, checkCount: 0 } satisfies ConfirmationJobData,
        {
          delay: DAY_MS,
          jobId: `confirm-${application.id}-0`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60000 },
          removeOnComplete: 500,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown queue error';
      await prisma.application.update({
        where: { id: application.id },
        data: {
          lastErrorCode: 'CONFIRMATION_QUEUE_FAILED',
          lastErrorMessage: message.slice(0, 1000),
        },
      });
      await prisma.applicationEvent.create({
        data: { applicationId: application.id, eventType: 'CONFIRMATION_QUEUE_FAILED' },
      });
      console.error(`Could not schedule ATS confirmation for ${application.id}: ${message}`);
    }

  } catch (error) {
    const failure =
      error instanceof ApplicationProcessingError
        ? error
        : classifySubmissionError(error);
    if (clickStarted) {
      await prisma.application.update({
        where: { id: application.id },
        data: {
          state: 'ESCALATED',
          lastErrorCode: 'SUBMISSION_UNCONFIRMED',
          lastErrorMessage: failure.message.slice(0, 1000),
        },
      });
      await prisma.applicationEvent.create({
        data: {
          applicationId: application.id,
          eventType: 'SUBMISSION_ESCALATED',
          payload: { errorCode: failure.code },
        },
      });
      return;
    }
    if (failure.code === 'CAPTCHA_DETECTED' || failure.code === 'IP_BLOCKED') {
      await markSubmissionFailed(prisma, application.id, failure.code, failure.message);
      return;
    }
    if (failure.code === 'FORM_VALIDATION_ERROR' || failure.code === 'FORM_CHANGED') {
      await prisma.application.update({
        where: { id: application.id },
        data: {
          state: 'NEEDS_INPUT',
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message.slice(0, 1000),
          formSchema: reviewSchema as unknown as Prisma.InputJsonValue,
          unknownFields: reviewSchema
            ? (fieldsForUserReview(reviewSchema) as unknown as Prisma.InputJsonValue)
            : application.formSchema ?? Prisma.DbNull,
        },
      });
      await prisma.applicationEvent.create({
        data: { applicationId: application.id, eventType: failure.code },
      });
      return;
    }
    if (failure.transient && application.retryCount < MAX_RETRIES) {
      const delay = getRetryDelay(application.retryCount);
      const nextRetryAt = new Date(Date.now() + delay);
      const retryCount = application.retryCount + 1;
      await prisma.application.update({
        where: { id: application.id },
        data: {
          state: 'RETRYING',
          retryCount,
          nextRetryAt,
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message.slice(0, 1000),
        },
      });
      await prisma.applicationEvent.create({
        data: {
          applicationId: application.id,
          eventType: 'RETRY_SCHEDULED',
          payload: { retryCount, nextRetryAt: nextRetryAt.toISOString(), errorCode: failure.code },
        },
      });
      try {
        await submitQueue.add(
          'retry_submission',
          { applicationId: application.id },
          {
            delay,
            jobId: `submit-retry-${application.id}-${retryCount}`,
            removeOnComplete: 500,
          },
        );
      } catch (queueError) {
        const message = queueError instanceof Error ? queueError.message : 'Unknown queue error';
        await markSubmissionFailed(
          prisma,
          application.id,
          'RETRY_QUEUE_FAILED',
          `Could not schedule retry: ${message}`,
        );
        throw queueError;
      }
      return;
    }
    await markSubmissionFailed(prisma, application.id, failure.code, failure.message);
  } finally {
    if (page) {
      const browser = page.context().browser();
      await page.context().close();
      await browser?.close();
    }
  }
}

async function confirmApplication(
  job: Job<ConfirmationJobData>,
  prisma: PrismaClient,
  confirmationQueue: Queue,
): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: job.data.applicationId },
    include: { job: true, user: { select: { email: true } } },
  });
  if (!application || application.state !== 'SUBMITTED') return;

  try {
    const status = await checkGreenhouseStatus(
      application.job.source,
      application.job.externalId,
      application.user.email,
    );
    const checkedAt = new Date();
    if (status) {
      await prisma.application.update({
        where: { id: application.id },
        data: {
          state: 'CONFIRMED',
          confirmedAt: checkedAt,
          lastAtsCheckAt: checkedAt,
          lastAtsStage: status.stage ?? null,
          externalApplicationId: status.applicationId ?? null,
        },
      });
      await prisma.applicationEvent.create({
        data: {
          applicationId: application.id,
          eventType: 'CONFIRMED',
          payload: { ats: 'greenhouse', stage: status.stage ?? null },
        },
      });
      await notifyApplicationState(
        prisma,
        application.id,
        'CONFIRMED',
        'Application confirmed',
        `The employer confirmed your application for ${application.jobTitle} at ${application.companyName}.`,
      );
      return;
    }

    await prisma.application.update({
      where: { id: application.id },
      data: { lastAtsCheckAt: checkedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ATS confirmation error';
    console.warn(`ATS confirmation check failed for ${application.id}: ${message}`);
    await prisma.application.update({
      where: { id: application.id },
      data: { lastAtsCheckAt: new Date(), lastErrorCode: 'ATS_CHECK_FAILED', lastErrorMessage: message.slice(0, 1000) },
    });
  }

  const checkCount = (job.data.checkCount ?? 0) + 1;
  if (checkCount < MAX_CONFIRMATION_CHECKS) {
    await confirmationQueue.add(
      'confirm_application',
      { applicationId: application.id, checkCount } satisfies ConfirmationJobData,
      {
        delay: DAY_MS,
        jobId: `confirm-${application.id}-${checkCount}`,
        removeOnComplete: 500,
      },
    );
  }
}

async function notifyApplicationState(
  prisma: PrismaClient,
  applicationId: string,
  state: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { userId: true },
    });
    if (!application) return;
    await prisma.notification.upsert({
      where: { dedupeKey: `application:${applicationId}:${state}` },
      create: {
        userId: application.userId,
        kind: `APPLICATION_${state}`,
        title,
        message,
        resourcePath: `/app/applications/${applicationId}`,
        dedupeKey: `application:${applicationId}:${state}`,
      },
      update: {},
    });
  } catch (error) {
    console.error(
      `Could not create ${state} notification for application ${applicationId}:`,
      error,
    );
  }
}

async function rewardQualifiedReferral(
  job: Job<{ referralId: string; dueAt: string }>,
  prisma: PrismaClient,
  referralQueue: Queue,
): Promise<void> {
  const config = await prisma.referral_config.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  if (!config.enabled) return;

  const referral = await prisma.referrals.findUnique({
    where: { id: job.data.referralId },
  });
  if (
    !referral ||
    referral.status !== 'QUALIFIED' ||
    referral.qualification_event !== 'SUBSCRIPTION_ACTIVATED' ||
    !referral.qualified_at
  ) {
    return;
  }

  const dueAt = new Date(
    referral.qualified_at.getTime() + config.hold_period_days * DAY_MS,
  );
  if (dueAt > new Date()) {
    await referralQueue.add(
      'reward_qualified_referral',
      { referralId: referral.id, dueAt: dueAt.toISOString() },
      {
        delay: dueAt.getTime() - Date.now(),
        jobId: `referral-reward-${referral.id}-${dueAt.getTime()}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
    return;
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT id FROM referrals
      WHERE id = CAST(${referral.id} AS UUID)
      FOR UPDATE
    `;
    const current = await transaction.referrals.findUnique({
      where: { id: referral.id },
    });
    if (!current || current.status !== 'QUALIFIED') return;

    await transaction.wallets.upsert({
      where: { user_id: current.referrer_id },
      create: { user_id: current.referrer_id },
      update: {},
    });
    await transaction.$queryRaw`
      SELECT user_id FROM wallets
      WHERE user_id = CAST(${current.referrer_id} AS UUID)
      FOR UPDATE
    `;
    await transaction.credit_ledger.createMany({
      data: [{
        user_id: current.referrer_id,
        delta: config.token_per_qualified_referee,
        reason: 'REFERRAL_EARNED',
        ref_id: current.id,
      }],
      skipDuplicates: true,
    });
    const totals = await transaction.$queryRaw<
      Array<{ earned: bigint; spent: bigint }>
    >`
      SELECT
        COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::bigint AS earned,
        COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0)::bigint AS spent
      FROM credit_ledger
      WHERE user_id = CAST(${current.referrer_id} AS UUID)
    `;
    await transaction.wallets.update({
      where: { user_id: current.referrer_id },
      data: {
        total_earned: Number(totals[0]?.earned ?? 0n),
        total_spent: Number(totals[0]?.spent ?? 0n),
        updated_at: new Date(),
      },
    });
    await transaction.referrals.updateMany({
      where: { id: current.id, status: 'QUALIFIED' },
      data: { status: 'REWARDED' },
    });
  });
}

async function openApplicationPage(applyUrl: string): Promise<Page> {
  assertPublicHttpUrl(applyUrl);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let blockedRequestHost: string | undefined;
  try {
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (/^(?:data|blob|about):/i.test(requestUrl)) {
        await route.continue();
        return;
      }
      try {
        assertPublicHttpUrl(requestUrl);
        await assertPublicHostname(new URL(requestUrl).hostname);
      } catch {
        try {
          blockedRequestHost = new URL(requestUrl).hostname || 'unknown';
        } catch {
          blockedRequestHost = 'unknown';
        }
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    const response = await page.goto(applyUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    if (blockedRequestHost) {
      throw new ApplicationProcessingError(
        'PRIVATE_RESOURCE_BLOCKED',
        'The employer page attempted to access a private or restricted network resource.',
      );
    }
    assertPublicHttpUrl(page.url());
    if (!response?.ok()) {
      const status = response?.status();
      if (status === 401 || status === 403) {
        throw new ApplicationProcessingError('IP_BLOCKED', `Employer site responded with HTTP ${status}`);
      }
      throw new ApplicationProcessingError(
        status === 429 || (status !== undefined && status >= 500)
          ? 'NETWORK_ERROR'
          : 'JOB_SITE_HTTP_ERROR',
        `Job site responded with HTTP ${status ?? 'no response'}`,
        status === 429 || (status !== undefined && status >= 500) || response === null,
      );
    }
    await page.waitForTimeout(500);
    await page.locator('input:not([type="hidden"]), select, textarea')
      .first()
      .waitFor({ state: 'attached', timeout: 10000 })
      .catch(() => undefined);
    detectPageBlock((await page.content()).toLowerCase());
    return page;
  } catch (error) {
    await context.close();
    await browser.close();
    if (blockedRequestHost) {
      console.warn(`Blocked a private or restricted application request to ${blockedRequestHost}`);
      throw new ApplicationProcessingError(
        'PRIVATE_RESOURCE_BLOCKED',
        'The employer page attempted to access a private or restricted network resource.',
      );
    }
    throw error;
  }
}

async function closeApplicationPage(page: Page): Promise<void> {
  const browser = page.context().browser();
  await page.context().close();
  await browser?.close();
}

function createScreenshotStore(): ScreenshotStore {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY are required for application screenshots');
  }

  const endpoint = process.env.S3_ENDPOINT || undefined;
  const client = new S3Client({
    region: process.env.S3_REGION ?? 'ap-south-1',
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey },
  });
  let bucketReady: Promise<void> | undefined;

  async function ensureBucket(): Promise<void> {
    if (!endpoint) return;
    if (!bucketReady) {
      bucketReady = (async () => {
        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (error) {
          const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
          const name = error instanceof Error ? error.name : '';
          if (endpoint && (status === 404 || name === 'NotFound' || name === 'NoSuchBucket')) {
            try {
              await client.send(new CreateBucketCommand({ Bucket: bucket }));
            } catch (createError) {
              const createName = createError instanceof Error ? createError.name : '';
              if (createName !== 'BucketAlreadyOwnedByYou' && createName !== 'BucketAlreadyExists') {
                throw createError;
              }
            }
            return;
          }
          throw error;
        }
      })().catch((error: unknown) => {
        bucketReady = undefined;
        throw storageFailure(error);
      });
    }
    return bucketReady;
  }

  return {
    async upload(userId, applicationId, label, image) {
      try {
        await ensureBucket();
        const key = `applications/${userId}/${applicationId}/${label}-${Date.now()}.png`;
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: image,
          ContentType: 'image/png',
        }));
        return key;
      } catch (error) {
        if (error instanceof ApplicationProcessingError) throw error;
        throw storageFailure(error);
      }
    },
    close() {
      client.destroy();
    },
  };
}

function storageFailure(error: unknown): ApplicationProcessingError {
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  const message = error instanceof Error ? error.message : 'Unknown object storage error';
  const transient = status === undefined || status === 408 || status === 429 || status >= 500;
  return new ApplicationProcessingError('SCREENSHOT_STORAGE_FAILED', message, transient);
}

async function readFormSchema(page: Page, source: string): Promise<FormSchema> {
  const fields = await page.locator('input, select, textarea').evaluateAll((elements) => {
    const seenRadioNames = new Set<string>();
    const output: FormField[] = [];
    for (const element of elements) {
      const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const type = control instanceof HTMLInputElement
        ? (control.type || 'text').toLowerCase()
        : control instanceof HTMLSelectElement
          ? 'select'
          : 'textarea';
      if (
        control.disabled ||
        ['hidden', 'submit', 'button', 'reset', 'image'].includes(type) ||
        (type === 'radio' && seenRadioNames.has(control.name))
      ) {
        continue;
      }
      if (type === 'radio' && control.name) seenRadioNames.add(control.name);
      const id = control.id || control.name || `field-${output.length}`;
      const associatedLabel = control.labels?.[0]?.innerText?.trim();
      const label =
        associatedLabel ||
        control.getAttribute('aria-label') ||
        control.getAttribute('placeholder') ||
        control.name ||
        id;
      const options =
        type === 'select'
          ? Array.from((control as HTMLSelectElement).options)
              .filter((option) => !option.disabled && option.value !== '')
              .map((option) => ({ label: option.label.trim(), value: option.value }))
          : type === 'radio'
            ? Array.from(document.querySelectorAll<HTMLInputElement>(
                `input[type="radio"][name="${CSS.escape(control.name)}"]`,
              )).map((radio) => ({
                label:
                  radio.labels?.[0]?.innerText?.trim() ||
                  radio.getAttribute('aria-label') ||
                  radio.value,
                value: radio.value,
              }))
            : [];
      output.push({
        id,
        name: control.name || id,
        label,
        type,
        required: control.required,
        placeholder: control.getAttribute('placeholder') || undefined,
        options,
      });
    }
    return output;
  });
  if (fields.length === 0) {
    throw new ApplicationProcessingError('FORM_NOT_FOUND', 'No application form fields were found');
  }
  return { fields, source, detectedAt: new Date().toISOString() };
}

function matchFormFields(
  schema: FormSchema,
  profile: Record<string, unknown>,
  answers: Array<{ question: string; value: string }>,
  identity: { email: string; phone: string },
): { payload: Record<string, unknown>; unknownFields: Array<Pick<FormField, 'id' | 'name' | 'label' | 'type' | 'required'>> } {
  const profileValues = flattenObject(profile);
  profileValues.set('email', identity.email);
  profileValues.set('phone', identity.phone);
  const payload: Record<string, unknown> = {};
  const unknownFields: Array<Pick<FormField, 'id' | 'name' | 'label' | 'type' | 'required'>> = [];

  for (const field of schema.fields) {
    if (field.type === 'file') {
      if (field.required) {
        unknownFields.push({
          id: field.id,
          name: field.name,
          label: field.label,
          type: field.type,
          required: field.required,
        });
      }
      continue;
    }
    const value = findProfileMatch(field, profileValues) ?? findAnswer(field, answers);
    if (value !== undefined && value !== null && value !== '') {
      const compatible = coerceFormValue(field, value);
      if (compatible !== undefined) {
        payload[field.name] = compatible;
        continue;
      }
    }
    if (field.required) {
      unknownFields.push({
        id: field.id,
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
      });
    }
  }
  return { payload, unknownFields };
}

function flattenObject(
  value: Record<string, unknown>,
  prefix = '',
  result = new Map<string, unknown>(),
): Map<string, unknown> {
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalize(key);
    const path = prefix ? `${prefix}_${normalized}` : normalized;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flattenObject(entry as Record<string, unknown>, path, result);
    } else if (entry !== null && entry !== undefined) {
      result.set(path, entry);
      result.set(normalized, entry);
    }
  }
  return result;
}

function findProfileMatch(
  field: FormField,
  values: Map<string, unknown>,
): unknown {
  const terms = normalize(`${field.name} ${field.label} ${field.placeholder ?? ''}`);
  const aliases: Record<string, string[]> = {
    first_name: ['first_name', 'firstname', 'given_name', 'fname'],
    last_name: ['last_name', 'lastname', 'family_name', 'lname'],
    email: ['email', 'email_address', 'contact_email'],
    phone: ['phone', 'phone_number', 'mobile', 'mobile_number'],
    location: ['location', 'city', 'hometown', 'current_location'],
    years_of_experience: ['years_of_experience', 'experience_years', 'years_exp'],
    current_company: ['current_company', 'company_name', 'employer'],
    current_role: ['current_role', 'job_title', 'position'],
    linkedin_url: ['linkedin', 'linkedin_url', 'linkedin_profile'],
    github_url: ['github', 'github_url', 'github_profile'],
    portfolio_url: ['portfolio', 'portfolio_url', 'website'],
    professional_summary: ['experience_summary', 'professional_summary', 'summary', 'objective'],
  };
  for (const [key, names] of Object.entries(aliases)) {
    if (names.some((name) => terms.includes(normalize(name)))) {
      const candidate = values.get(key) ?? names.map((name) => values.get(name)).find(Boolean);
      if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
    }
  }
  for (const [key, value] of values) {
    if (terms.includes(key) && value !== '') return value;
  }
  return undefined;
}

function findAnswer(
  field: FormField,
  answers: Array<{ question: string; value: string }>,
): string | undefined {
  const fieldWords = new Set(normalize(`${field.label} ${field.name}`).split('_').filter(Boolean));
  let bestScore = 0;
  let bestAnswer: string | undefined;
  for (const answer of answers) {
    const answerWords = new Set(normalize(answer.question).split('_').filter(Boolean));
    const overlap = [...fieldWords].filter((word) => answerWords.has(word)).length;
    const score =
      fieldWords.size && answerWords.size
        ? (2 * overlap) / (fieldWords.size + answerWords.size)
        : 0;
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = answer.value;
    }
  }
  return bestScore >= 0.75 ? bestAnswer : undefined;
}

function coerceFormValue(field: FormField, value: unknown): unknown {
  if (field.type === 'checkbox') return value === true || value === 'true' || value === 'yes';
  const stringValue = String(value);
  if (field.type === 'select' || field.type === 'radio') {
    const option = field.options.find(
      (candidate) =>
        normalize(candidate.value) === normalize(stringValue) ||
        normalize(candidate.label) === normalize(stringValue),
    );
    return option?.value;
  }
  return stringValue;
}

function fieldsForUserReview(schema: FormSchema): Array<Pick<FormField, 'id' | 'name' | 'label' | 'type' | 'required'>> {
  const required = schema.fields.filter((field) => field.required);
  const fields = required.length > 0 ? required : schema.fields;
  return fields.map((field) => ({
    id: field.id,
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
  }));
}

async function fillForm(
  page: Page,
  schema: FormSchema,
  payload: Record<string, unknown>,
  skipMissingRequired = false,
): Promise<void> {
  for (const field of schema.fields) {
    const value = payload[field.name];
    if (value === undefined || value === null || value === '') {
      if (field.required) {
        if (skipMissingRequired) continue;
        throw new ApplicationProcessingError(
          'FORM_VALIDATION_ERROR',
          `A required value is missing for ${field.label}`,
        );
      }
      continue;
    }
    if (field.type === 'file') {
      if (skipMissingRequired) continue;
      throw new ApplicationProcessingError(
        'FILE_UPLOAD_UNSUPPORTED',
        `File upload is required for ${field.label}`,
      );
    }
    const escapedName = field.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const locator = page.locator(`[name="${escapedName}"]`).first();
    if ((await locator.count()) === 0) {
      throw new ApplicationProcessingError(
        'FORM_CHANGED',
        `Form field ${field.name} is no longer present`,
      );
    }
    if (field.type === 'checkbox') {
      if (value) await locator.check();
      else await locator.uncheck();
    } else if (field.type === 'radio') {
      const escapedValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await page.locator(`[name="${escapedName}"][value="${escapedValue}"]`).check();
    } else if (field.type === 'select') {
      await locator.selectOption(String(value));
    } else {
      await locator.fill(String(value));
    }
  }
}

async function checkGreenhouseStatus(
  source: string,
  externalJobId: string,
  email: string,
): Promise<{ applicationId: string; stage?: string } | null> {
  const apiKey = process.env.GREENHOUSE_HARVEST_API_KEY;
  if (source.toLowerCase() !== 'greenhouse' || !apiKey) return null;
  const url = new URL('https://harvest.greenhouse.io/v1/applications');
  url.searchParams.set('job_id', externalJobId);
  url.searchParams.set('email', email);
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Greenhouse Harvest API returned HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  const applications = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && 'applications' in body && Array.isArray(body.applications)
      ? body.applications
      : [];
  const record = applications.find(
    (entry): entry is { id: string | number; current_stage?: { name?: string } } =>
      !!entry && typeof entry === 'object' && 'id' in entry,
  );
  return record
    ? {
        applicationId: String(record.id),
        stage: record.current_stage?.name,
      }
    : null;
}

async function getUserDek(
  prisma: PrismaClient,
  userId: string,
  wrappedFromUser?: Buffer | null,
): Promise<Buffer> {
  const existing = await prisma.userKey.findUnique({ where: { user_id: userId } });
  if (existing) return unwrapDek(existing.dek_wrapped);
  if (wrappedFromUser) return unwrapDek(wrappedFromUser);

  const generated = await wrapDek(generateDek());
  const key = await prisma.userKey.upsert({
    where: { user_id: userId },
    create: { user_id: userId, dek_wrapped: generated },
    update: {},
  });
  return unwrapDek(key.dek_wrapped);
}

async function markSubmissionFailed(
  prisma: PrismaClient,
  applicationId: string,
  errorCode: string,
  message: string,
): Promise<void> {
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      state: 'FAILED',
      lastErrorCode: errorCode,
      lastErrorMessage: message.slice(0, 1000),
      nextRetryAt: null,
    },
  });
  await prisma.applicationEvent.create({
    data: {
      applicationId,
      eventType: 'SUBMISSION_FAILED',
      payload: { errorCode, errorMessage: message.slice(0, 1000) },
    },
  });
}

function classifySubmissionError(error: unknown): ApplicationProcessingError {
  if (error instanceof ApplicationProcessingError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('timeout') || lower.includes('net::err') || lower.includes('econn')) {
    return new ApplicationProcessingError('NETWORK_ERROR', message, true);
  }
  return new ApplicationProcessingError('SUBMISSION_ERROR', message);
}

function detectPageBlock(pageText: string): void {
  if (/captcha|recaptcha|hcaptcha|verify you are human/.test(pageText)) {
    throw new ApplicationProcessingError('CAPTCHA_DETECTED', 'The employer page requires CAPTCHA verification');
  }
  if (/ip address.*blocked|too many requests|rate limit exceeded|access denied/.test(pageText)) {
    throw new ApplicationProcessingError('IP_BLOCKED', 'The employer site blocked this request');
  }
}

function parseSchema(value: Prisma.JsonValue | null): FormSchema {
  if (
    !value ||
    typeof value !== 'object' ||
    !('fields' in value) ||
    !Array.isArray(value.fields)
  ) {
    throw new ApplicationProcessingError('FORM_SCHEMA_MISSING', 'Stored form schema is invalid');
  }
  return value as unknown as FormSchema;
}

function schemaSignature(schema: FormSchema): string {
  return JSON.stringify(
    schema.fields
      .map((field) => ({
        name: field.name,
        type: field.type,
        required: field.required,
        options: field.options.map((option) => option.value).sort(),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
}

function getRetryDelay(retryCount: number): number {
  const base = 5 * 60 * 1000;
  const delay = Math.min(base * 3 ** retryCount, DAY_MS);
  return Math.round(delay * (0.8 + Math.random() * 0.4));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function assertPublicHttpUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationProcessingError('INVALID_URL', 'Application URL is invalid');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new ApplicationProcessingError('INVALID_URL', 'Application URL must be an HTTP(S) URL without credentials');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (isIP(host) !== 0 && !isPublicIp(host))
  ) {
    throw new ApplicationProcessingError('INVALID_URL', 'Private network URLs are not allowed');
  }
}

function redisConnectionOptions(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
