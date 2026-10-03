import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { FormDetectorService } from '../services/form-detector.service';
import { ApplicationRepository } from '../../applications/repositories/application.repository';
import { FormDetectionCacheRepository } from '../../applications/repositories/form-detection-cache.repository';
import {
  FormDetectionError,
  CaptchaDetectedError,
  LoginRequiredError,
  JobNotFoundError,
  FormNotFoundError,
} from '../../applications/exceptions/form-detection.exception';

interface PrepareJobData {
  applicationId: string;
  userId: string;
  jobId: string;
  applyUrl: string;
  jobSource: string;
}

@Processor('prepare')
export class PrepareProcessor {
  private readonly logger = new Logger('PrepareProcessor');

  constructor(
    private formDetector: FormDetectorService,
    private applicationRepo: ApplicationRepository,
    private cacheRepo: FormDetectionCacheRepository,
  ) {}

  @Process({ name: 'detect_form', concurrency: 2 })
  async handleFormDetection(job: Job<PrepareJobData>): Promise<void> {
    const { applicationId, jobId, applyUrl, jobSource } = job.data;

    try {
      this.logger.log(`[${applicationId}] Starting form detection`);
      job.progress(10);

      // Detect form
      const formSchema = await this.formDetector.detectForm(
        applyUrl,
        jobSource,
      );
      job.progress(50);

      this.logger.log(
        `[${applicationId}] Form detected: ${formSchema.fieldCount} fields`,
      );

      // Store in cache
      await this.cacheRepo.upsertFormSchema(jobId, formSchema);
      job.progress(75);

      // Update application
      await this.applicationRepo.updateState(applicationId, 'AWAITING_APPROVAL', {
        formSchema,
        currentStepIndex: 1,
      });

      // Log event
      await this.applicationRepo.createEvent(
        applicationId,
        'FORM_DETECTED',
        { fieldCount: formSchema.fieldCount },
      );

      job.progress(100);
      this.logger.log(`[${applicationId}] Form detection complete`);
    } catch (error) {
      this.logger.error(
        `[${applicationId}] Form detection failed: ${error.message}`,
        error.stack,
      );

      // Determine error code
      let errorCode = 'FORM_DETECTION_FAILED';
      if (error instanceof CaptchaDetectedError) {
        errorCode = 'CAPTCHA_DETECTED';
      } else if (error instanceof LoginRequiredError) {
        errorCode = 'LOGIN_REQUIRED';
      } else if (error instanceof JobNotFoundError) {
        errorCode = 'JOB_NOT_FOUND';
      } else if (error instanceof FormNotFoundError) {
        errorCode = 'FORM_NOT_FOUND';
      } else if (error instanceof FormDetectionError) {
        errorCode = error.code;
      }

      // Update application with error
      await this.applicationRepo.updateState(applicationId, 'FAILED', {
        lastErrorCode: errorCode,
        lastErrorMessage: error.message,
      });

      // Log event
      await this.applicationRepo.createEvent(
        applicationId,
        'FORM_DETECTION_FAILED',
        { errorCode, errorMessage: error.message },
      );

      // Re-throw for Bull to handle retry
      throw error;
    }
  }
}
