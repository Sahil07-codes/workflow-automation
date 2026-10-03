import { Controller, Post, Body, HttpCode, HttpStatus, Req, UseFilters } from '@nestjs/common';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Request } from 'express';
import {
  SignupRequestSchema,
  OtpSendRequestSchema,
  OtpVerifyRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
} from '@autoapply/shared';
import { AuthService } from './auth.service';
import { GlobalExceptionFilter } from '@/common/filters/exception.filter';

@Controller('auth')
@UseFilters(GlobalExceptionFilter)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Req() request: Request,
    @Body(new ZodValidationPipe(SignupRequestSchema)) body: any,
  ) {
    return this.authService.signup(body, request.ip);
  }

  @Post('otp/send')
  @Public()
  @HttpCode(HttpStatus.OK)
  async sendOtp(
    @Req() request: Request,
    @Body(new ZodValidationPipe(OtpSendRequestSchema)) body: any,
  ) {
    return this.authService.sendOtp(body, request.ip);
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body(new ZodValidationPipe(OtpVerifyRequestSchema)) body: any) {
    return this.authService.verifyOtp(body);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(LoginRequestSchema)) body: any) {
    return this.authService.login(body);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(RefreshRequestSchema)) body: any) {
    return this.authService.refresh(body.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: { id: string }) {
    return this.authService.logout(user.id);
  }
}
