import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Ip,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApplicationsService } from './services/applications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../auth/types/user-payload.type';
import { ApplicationResponseDto } from './dto/application.dto';

@Controller('v1/applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private applicationsService: ApplicationsService) {}

  @Post(':jobId/start')
  @HttpCode(HttpStatus.ACCEPTED)
  async startApplication(
    @Param('jobId') jobId: string,
    @CurrentUser() user: UserPayload,
    @Ip() ip: string,
  ) {
    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    const application = await this.applicationsService.startApplication(
      user.userId,
      jobId,
      ip,
    );

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
    @CurrentUser() user: UserPayload,
  ): Promise<ApplicationResponseDto> {
    const application = await this.applicationsService.getApplication(
      id,
      user.userId,
    );

    return {
      id: application.id,
      jobId: application.jobId,
      userId: application.userId,
      state: application.state as any,
      formSchema: application.formSchema as any,
      matchScore: application.matchScore,
      companyName: application.companyName,
      jobTitle: application.jobTitle,
      retryCount: application.retryCount,
      lastErrorCode: application.lastErrorCode || undefined,
      lastErrorMessage: application.lastErrorMessage || undefined,
      appliedAt: application.appliedAt || undefined,
      submittedAt: application.submittedAt || undefined,
      confirmedAt: application.confirmedAt || undefined,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }

  @Get()
  async listApplications(
    @CurrentUser() user: UserPayload,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? Math.min(parseInt(limit), 100) : 50;
    const applications = await this.applicationsService.listApplications(
      user.userId,
      state,
      limitNum,
    );

    return {
      count: applications.length,
      applications: applications.map(app => ({
        id: app.id,
        jobId: app.jobId,
        state: app.state,
        companyName: app.companyName,
        jobTitle: app.jobTitle,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      })),
    };
  }
}
