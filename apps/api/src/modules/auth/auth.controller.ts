import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  SignupRequestSchema,
  OtpSendRequestSchema,
  OtpVerifyRequestSchema,
  LoginRequestSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  RefreshRequestSchema,
} from '@autoapply/shared';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { GlobalExceptionFilter } from '@/common/filters/exception.filter';

@Controller('auth')
@UseFilters(GlobalExceptionFilter)
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

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
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: any,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.login(body);
    this.setSessionCookies(response, tokens);
    return this.sessionResponse(tokens, request);
  }

  @Post('password-reset/request')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Req() request: Request,
    @Body(new ZodValidationPipe(PasswordResetRequestSchema)) body: any,
  ) {
    return this.authService.requestPasswordReset(body.email, request.ip);
  }

  @Post('password-reset/confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(PasswordResetConfirmSchema)) body: any,
  ) {
    return this.authService.confirmPasswordReset(
      body.email,
      body.code,
      body.new_password,
    );
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsedBody = RefreshRequestSchema.safeParse(body);
    const refreshToken =
      (parsedBody.success ? parsedBody.data.refresh_token : undefined) ??
      this.readCookie(request, 'autoapply_refresh');
    if (!refreshToken) {
      throw new UnauthorizedException('A refresh token is required.');
    }
    try {
      const tokens = await this.authService.refresh(refreshToken);
      this.setSessionCookies(response, tokens);
      return this.sessionResponse(tokens, request);
    } catch (error) {
      this.clearSessionCookies(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: { id: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(user.id);
    this.clearSessionCookies(response);
  }

  private setSessionCookies(
    response: Response,
    tokens: { access_token: string; refresh_token: string; expires_in: number },
  ) {
    const secure = this.configService.get<string>('node_env') === 'production';
    const baseOptions = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/v1',
    };
    response.cookie('autoapply_access', tokens.access_token, {
      ...baseOptions,
      maxAge: tokens.expires_in * 1000,
    });
    response.cookie('autoapply_refresh', tokens.refresh_token, {
      ...baseOptions,
      maxAge: TokenService.SESSION_IDLE_TIMEOUT_SECONDS * 1000,
    });
  }

  private clearSessionCookies(response: Response) {
    const secure = this.configService.get<string>('node_env') === 'production';
    const options = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/v1',
    };
    response.clearCookie('autoapply_access', options);
    response.clearCookie('autoapply_refresh', options);
  }

  private sessionResponse<T extends {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>(tokens: T, request: Request) {
    if (request.headers.origin) {
      return { expires_in: tokens.expires_in, token_type: tokens.token_type };
    }
    return tokens;
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookie = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`));
    return cookie ? cookie.slice(name.length + 1) : undefined;
  }
}
