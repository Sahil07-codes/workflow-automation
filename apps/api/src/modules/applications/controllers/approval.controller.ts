import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ApplicationsService } from '../services/applications.service';

interface AuthenticatedUser {
  id: string;
}

@Controller('applications')
export class ApprovalController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post(':applicationId/approval-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createApprovalToken(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applications.createApprovalToken(applicationId, user.id);
  }

  @Get(':applicationId/approve')
  @Public()
  @HttpCode(HttpStatus.OK)
  approveWithToken(
    @Param('applicationId') applicationId: string,
    @Query('token') token: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.applications.approveWithToken(
      applicationId,
      token,
      ip,
      userAgent ?? '',
    );
  }

  @Get(':applicationId/decline')
  @Public()
  @HttpCode(HttpStatus.OK)
  declineWithToken(
    @Param('applicationId') applicationId: string,
    @Query('token') token: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.applications.declineWithToken(
      applicationId,
      token,
      ip,
      userAgent ?? '',
    );
  }
}
