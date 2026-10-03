import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Ip,
  Headers,
  Post,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApprovalTokenService } from '../services/approval-token.service';
import { ApplicationRepository } from '../repositories/application.repository';

@Controller('v1/applications')
@UseGuards(JwtAuthGuard)
export class ApprovalController {
  constructor(
    private approvalTokenService: ApprovalTokenService,
    private applicationRepository: ApplicationRepository,
  ) {}

  @Get(':applicationId/approve')
  @HttpCode(HttpStatus.OK)
  async approveApplication(
    @Param('applicationId') applicationId: string,
    @Query('token') token: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    if (!token) {
      throw new BadRequestException('Approval token is required');
    }

    const approval = await this.approvalTokenService.verifyAndUseToken(
      token,
      applicationId,
      ip,
      userAgent,
    );

    await this.applicationRepository.update(applicationId, {
      state: 'APPROVED',
      approvedAt: new Date(),
    });

    return {
      id: applicationId,
      state: 'APPROVED',
      approved_at: new Date(),
      message: 'Application approved. Submitting to employer...',
    };
  }

  @Get(':applicationId/decline')
  @HttpCode(HttpStatus.OK)
  async declineApplication(
    @Param('applicationId') applicationId: string,
    @Query('token') token: string,
    @CurrentUser() user: any,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    await this.approvalTokenService.verifyAndUseToken(
      token,
      applicationId,
      '',
      '',
    );

    await this.applicationRepository.update(applicationId, {
      state: 'REJECTED',
    });

    return {
      id: applicationId,
      state: 'REJECTED',
      message: 'Application declined',
    };
  }

  @Post(':applicationId/resend-approval')
  @HttpCode(HttpStatus.OK)
  async resendApprovalEmail(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: any,
  ) {
    const application = await this.applicationRepository.findById(
      applicationId,
    );

    if (!application || application.userId !== user.id) {
      throw new UnauthorizedException(
        'Cannot resend approval for this application',
      );
    }

    // Queue new approval email
    // Implementation depends on queue setup

    return {
      message: 'Approval email sent',
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
    };
  }
}
