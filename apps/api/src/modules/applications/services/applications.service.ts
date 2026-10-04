import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationState, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { sealBuffer } from '@autoapply/crypto';
import { PrismaService } from '../../../database/prisma.service';
import { UserKeyService } from '../../users/user-key.service';
import { EntitlementService } from '../../billing/services/entitlement.service';
import { ApplicationRepository } from '../repositories/application.repository';
import { ApprovalTokenService } from './approval-token.service';
import { ApplicationQueueService } from './application-queue.service';
import { PayloadEncryptionService } from './payload-encryption.service';

interface UnknownFormField {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly applicationRepo: ApplicationRepository,
    private readonly prisma: PrismaService,
    private readonly queue: ApplicationQueueService,
    private readonly entitlementService: EntitlementService,
    private readonly payloadEncryption: PayloadEncryptionService,
    private readonly approvalTokens: ApprovalTokenService,
    private readonly userKeyService: UserKeyService,
  ) {}

  async startApplication(userId: string, jobId: string) {
    const entitlement = await this.entitlementService.canSubmitApplication(userId);
    if (!entitlement.allowed) {
      throw new ForbiddenException(entitlement.reason ?? 'Application quota exceeded');
    }

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        source: true,
        applyUrl: true,
        company: true,
        title: true,
        status: true,
      },
    });
    if (!job || job.status !== 'OPEN') {
      throw new NotFoundException('Open job not found');
    }

    if (await this.applicationRepo.findByUserAndJob(userId, jobId)) {
      throw new ConflictException('An application already exists for this job');
    }

    const match = await this.prisma.jobMatch.findUnique({
      where: { userId_jobId: { userId, jobId } },
      select: { matchScore: true },
    });
    let application;
    try {
      application = await this.applicationRepo.create({
        userId,
        jobId,
        companyName: job.company,
        jobTitle: job.title,
        matchScore: match?.matchScore ?? 0,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An application already exists for this job');
      }
      throw error;
    }

    await this.applicationRepo.createEvent(application.id, 'APPLICATION_STARTED');
    try {
      await this.queue.enqueuePreparation(application.id);
    } catch (error) {
      await this.prisma.application.update({
        where: { id: application.id },
        data: {
          state: 'FAILED',
          lastErrorCode: 'PREPARATION_QUEUE_UNAVAILABLE',
          lastErrorMessage: 'Could not queue application preparation',
        },
      });
      await this.applicationRepo.createEvent(application.id, 'PREPARATION_QUEUE_FAILED');
      throw new InternalServerErrorException('Could not queue application preparation');
    }
    return application;
  }

  async getApplication(id: string, userId: string) {
    const application = await this.applicationRepo.findOwned(id, userId);
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  async listApplications(
    userId: string,
    stateValue?: string,
    requestedLimit = 50,
    query?: string,
  ) {
    let state: ApplicationState | undefined;
    if (stateValue) {
      if (!Object.values(ApplicationState).includes(stateValue as ApplicationState)) {
        throw new BadRequestException('Invalid application state');
      }
      state = stateValue as ApplicationState;
    }
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(Math.floor(requestedLimit), 100))
      : 50;
    return this.applicationRepo.findByUserId(userId, state, limit, query);
  }

  async provideMissingAnswers(
    applicationId: string,
    userId: string,
    responses: Record<string, string>,
  ) {
    const application = await this.applicationRepo.findOwned(applicationId, userId);
    if (!application) throw new NotFoundException('Application not found');
    if (application.state !== 'NEEDS_INPUT' || !application.formPayload) {
      throw new ConflictException('Application is not waiting for user input');
    }

    const unknownFields = this.readUnknownFields(application.unknownFields);
    const expectedNames = new Set(unknownFields.map((field) => field.name));
    const providedNames = Object.keys(responses);
    if (
      providedNames.length !== expectedNames.size ||
      providedNames.some((name) => !expectedNames.has(name))
    ) {
      throw new BadRequestException('Provide exactly the outstanding form fields');
    }
    for (const [name, value] of Object.entries(responses)) {
      if (typeof value !== 'string' || value.trim().length === 0 || value.length > 5000) {
        throw new BadRequestException(`Invalid value for ${name}`);
      }
    }

    const previousHash = application.formPayloadHash;
    if (!previousHash) throw new ConflictException('Form payload is unavailable');
    const payload = await this.payloadEncryption.decryptPayload<Record<string, unknown>>(
      application.id,
      userId,
      application.formPayload,
      previousHash,
    );
    const updatedPayload = { ...payload, ...responses };
    const encrypted = await this.payloadEncryption.encryptPayload(
      application.id,
      userId,
      updatedPayload,
    );

    const dek = await this.userKeyService.getDek(userId);
    for (const field of unknownFields) {
      const questionHash = createHash('sha256')
        .update(field.label.trim().toLowerCase())
        .digest('hex');
      await this.prisma.answerBank.upsert({
        where: { user_id_question_hash: { user_id: userId, question_hash: questionHash } },
        create: {
          user_id: userId,
          question_hash: questionHash,
          question_text: field.label,
          answer_enc: sealBuffer(responses[field.name], dek, userId),
        },
        update: {
          question_text: field.label,
          answer_enc: sealBuffer(responses[field.name], dek, userId),
        },
      });
    }

    const updated = await this.prisma.application.updateMany({
      where: { id: applicationId, userId, state: 'NEEDS_INPUT' },
      data: {
        state: 'AWAITING_APPROVAL',
        formPayload: encrypted.ciphertext,
        formPayloadHash: encrypted.hash,
        unknownFields: Prisma.DbNull,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('Application state changed while saving answers');
    }
    await this.applicationRepo.createEvent(applicationId, 'USER_RESPONDED');
    return { id: applicationId, state: 'AWAITING_APPROVAL' as const };
  }

  async createApprovalToken(applicationId: string, userId: string) {
    const application = await this.applicationRepo.findOwned(applicationId, userId);
    if (!application) throw new NotFoundException('Application not found');
    if (application.state !== 'AWAITING_APPROVAL' || !application.formPayloadHash) {
      throw new ConflictException('Application is not awaiting approval');
    }
    const token = await this.approvalTokens.createApprovalToken(
      applicationId,
      application.formPayloadHash,
    );
    return {
      approval_url: `/v1/applications/${applicationId}/approve?token=${token.token}`,
      expires_at: token.expiresAt,
    };
  }

  async approveApplication(applicationId: string, userId: string) {
    const application = await this.applicationRepo.findOwned(applicationId, userId);
    if (!application) throw new NotFoundException('Application not found');
    return this.approve(applicationId, application);
  }

  async declineApplication(applicationId: string, userId: string) {
    const application = await this.applicationRepo.findOwned(applicationId, userId);
    if (!application) throw new NotFoundException('Application not found');
    if (application.state !== 'AWAITING_APPROVAL') {
      throw new ConflictException('Application is not awaiting approval');
    }
    const changed = await this.prisma.application.updateMany({
      where: { id: applicationId, userId, state: 'AWAITING_APPROVAL' },
      data: { state: 'REJECTED' },
    });
    if (changed.count !== 1) throw new ConflictException('Application state has changed');
    await this.applicationRepo.createEvent(applicationId, 'USER_DECLINED');
    return { id: applicationId, state: 'REJECTED' as const };
  }

  async approveWithToken(
    applicationId: string,
    token: string,
    ip: string,
    userAgent: string,
  ) {
    if (!token) throw new BadRequestException('Approval token is required');
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) throw new NotFoundException('Application not found');
    if (application.state !== 'AWAITING_APPROVAL' || !application.formPayloadHash) {
      throw new ConflictException('Application is not awaiting approval');
    }
    const approval = await this.approvalTokens.verifyAndUseToken(
      token,
      applicationId,
      ip,
      userAgent,
    );
    if (approval.payloadHash !== application.formPayloadHash) {
      throw new ConflictException('Application changed after the approval link was issued');
    }
    return this.approve(applicationId, application);
  }

  async declineWithToken(applicationId: string, token: string, ip: string, userAgent: string) {
    if (!token) throw new BadRequestException('Approval token is required');
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) throw new NotFoundException('Application not found');
    if (application.state !== 'AWAITING_APPROVAL') {
      throw new ConflictException('Application is not awaiting approval');
    }
    const approval = await this.approvalTokens.verifyAndUseToken(token, applicationId, ip, userAgent);
    if (approval.payloadHash !== application.formPayloadHash) {
      throw new ConflictException('Application changed after the approval link was issued');
    }
    const changed = await this.prisma.application.updateMany({
      where: { id: applicationId, state: 'AWAITING_APPROVAL' },
      data: { state: 'REJECTED' },
    });
    if (changed.count !== 1) throw new ConflictException('Application state has changed');
    await this.applicationRepo.createEvent(applicationId, 'USER_DECLINED');
    return { id: applicationId, state: 'REJECTED' as const };
  }

  private async approve(
    applicationId: string,
    application: { state: ApplicationState },
  ) {
    if (application.state !== 'AWAITING_APPROVAL') {
      throw new ConflictException('Application is not awaiting approval');
    }
    const changed = await this.prisma.application.updateMany({
      where: { id: applicationId, state: 'AWAITING_APPROVAL' },
      data: { state: 'APPROVED', approvedAt: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('Application state has changed');

    await this.applicationRepo.createEvent(applicationId, 'USER_APPROVED');
    try {
      await this.queue.enqueueSubmission(applicationId);
    } catch (error) {
      await this.prisma.application.updateMany({
        where: { id: applicationId, state: 'APPROVED' },
        data: { state: 'AWAITING_APPROVAL', approvedAt: null },
      });
      await this.applicationRepo.createEvent(applicationId, 'SUBMISSION_QUEUE_FAILED');
      throw new InternalServerErrorException('Could not queue application submission');
    }
    return { id: applicationId, state: 'APPROVED' as const };
  }

  private readUnknownFields(value: Prisma.JsonValue | null): UnknownFormField[] {
    if (!Array.isArray(value)) {
      throw new ConflictException('Outstanding form fields are unavailable');
    }
    const fields: UnknownFormField[] = [];
    for (const field of value) {
      if (!field || typeof field !== 'object' || Array.isArray(field)) continue;
      const candidate = field as Prisma.JsonObject;
      if (
        typeof candidate.name === 'string' &&
        typeof candidate.label === 'string' &&
        typeof candidate.id === 'string' &&
        typeof candidate.type === 'string'
      ) {
        fields.push({
          id: candidate.id,
          name: candidate.name,
          label: candidate.label,
          type: candidate.type,
          required: candidate.required === true,
        });
      }
    }
    if (fields.length !== value.length) {
      throw new ConflictException('Outstanding form fields are invalid');
    }
    return fields;
  }
}
