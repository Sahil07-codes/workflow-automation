import {
  Body,
  Controller,
  BadRequestException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApplicationState } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApplicationsService } from './services/applications.service';
import { ApplicationScreenshotService } from './services/application-screenshot.service';

interface AuthenticatedUser {
  id: string;
}

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly screenshots: ApplicationScreenshotService,
  ) {}

  @Post(':jobId/start')
  @HttpCode(HttpStatus.ACCEPTED)
  async startApplication(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const application = await this.applications.startApplication(user.id, jobId);
    return {
      application_id: application.id,
      job_id: application.jobId,
      state: application.state,
      message: 'Application preparation started',
      status_url: `/v1/applications/${application.id}`,
    };
  }

  @Get(':id')
  async getApplication(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const application = await this.applications.getApplication(id, user.id);
    const [screenshotUrl, submittedScreenshotUrl] = await Promise.all([
      application.screenshotUrl
        ? this.screenshots.createReadUrl(application.screenshotUrl)
        : null,
      application.submittedScreenshotUrl
        ? this.screenshots.createReadUrl(application.submittedScreenshotUrl)
        : null,
    ]);
    return {
      id: application.id,
      job_id: application.jobId,
      state: application.state,
      form_schema: application.formSchema,
      unknown_fields: application.unknownFields,
      screenshot_url: screenshotUrl,
      submitted_screenshot_url: submittedScreenshotUrl,
      company_name: application.companyName,
      job_title: application.jobTitle,
      match_score: application.matchScore,
      retry_count: application.retryCount,
      last_error_code: application.lastErrorCode,
      last_error_message: application.lastErrorMessage,
      submitted_at: application.submittedAt,
      confirmed_at: application.confirmedAt,
      created_at: application.createdAt,
      updated_at: application.updatedAt,
    };
  }

  @Get()
  async listApplications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('state') state?: ApplicationState,
    @Query('limit') limit?: string,
  ) {
    const applications = await this.applications.listApplications(
      user.id,
      state,
      limit === undefined ? 50 : Number(limit),
    );
    return {
      count: applications.length,
      applications: applications.map((application) => ({
        id: application.id,
        job_id: application.jobId,
        state: application.state,
        company_name: application.companyName,
        job_title: application.jobTitle,
        created_at: application.createdAt,
        updated_at: application.updatedAt,
      })),
    };
  }

  @Post(':id/input')
  @HttpCode(HttpStatus.OK)
  provideMissingAnswers(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { responses?: Record<string, string> },
  ) {
    if (!body.responses || typeof body.responses !== 'object' || Array.isArray(body.responses)) {
      throw new BadRequestException('responses must be an object');
    }
    return this.applications.provideMissingAnswers(id, user.id, body.responses);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveApplication(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applications.approveApplication(id, user.id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  async declineApplication(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applications.declineApplication(id, user.id);
  }
}
