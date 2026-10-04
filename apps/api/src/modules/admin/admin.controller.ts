import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@autoapply/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getOverview() {
    return this.admin.getOverview();
  }

  @Get('users')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getUsers(
    @Query('q') query?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.getUsers(query, status, cursor);
  }

  @Get('applications')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getApplications(
    @Query('q') query?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.getApplications(query, status, cursor);
  }

  @Get('subscriptions')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getSubscriptions(
    @Query('q') query?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.getSubscriptions(query, status, cursor);
  }

  @Get('referrals')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getReferrals(
    @Query('q') query?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.admin.getReferrals(query, status, cursor);
  }

  @Get('adapters')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getAdapters() {
    return this.admin.getAdapters();
  }

  @Get('flags')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getFlags() {
    return this.admin.getFlags();
  }

  @Get('audit-log')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  getAuditLog(@Query('cursor') cursor?: string) {
    return this.admin.getAuditLog(cursor);
  }
}
