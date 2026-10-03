import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import {
  SignupRequestSchema,
  OtpSendRequestSchema,
  OtpVerifyRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
} from '@autoapply/shared';
import { AuthService } from './auth.service';
import { GlobalExceptionFilter } from '@/common/filters/exception.filter';
import { Public } from '@/common/decorators/public.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@Controller('auth')
@UseFilters(GlobalExceptionFilter)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body(new ZodValidationPipe(SignupRequestSchema)) body: any) {
    return this.authService.signup(body);
  }

  @Post('otp/send')
  @Public()
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body(new ZodValidationPipe(OtpSendRequestSchema)) body: any) {
    return this.authService.sendOtp(body);
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
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: any) {
    await this.authService.logout(user.id);
    return null;
  }
}
