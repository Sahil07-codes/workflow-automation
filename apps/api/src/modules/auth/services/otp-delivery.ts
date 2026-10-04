import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import nodemailer, { Transporter } from 'nodemailer';
import { AppException } from '@/common/exceptions/app.exception';

type OtpChannel = 'EMAIL' | 'SMS';

@Injectable()
export class OtpDelivery {
  private readonly logger = new Logger(OtpDelivery.name);
  private readonly emailTransport: string;
  private readonly smsTransport: string;
  private sesClient?: SESClient;
  private smtpTransporter?: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.emailTransport = (configService.get<string>('otp_transport') ?? 'ses').toLowerCase();
    this.smsTransport = (configService.get<string>('sms_otp_transport') ?? 'disabled').toLowerCase();

    // The console sender prints codes, so it must never run in production.
    if (this.emailTransport === 'console' && configService.get<string>('node_env') === 'production') {
      throw new Error('OTP_TRANSPORT=console is not allowed in production');
    }
    if (!['console', 'ses', 'smtp'].includes(this.emailTransport)) {
      throw new Error(
        `Unknown OTP_TRANSPORT "${this.emailTransport}" (expected "console", "ses", or "smtp")`,
      );
    }
    if (this.smsTransport !== 'disabled' && this.smsTransport !== 'twilio') {
      throw new Error(`Unknown SMS_OTP_TRANSPORT "${this.smsTransport}" (expected "disabled" or "twilio")`);
    }
    if (configService.get<string>('node_env') === 'production' && this.smsTransport !== 'twilio') {
      throw new Error('SMS_OTP_TRANSPORT=twilio is required in production');
    }
  }

  async deliver(target: string, channel: OtpChannel, code: string): Promise<void> {
    if (channel === 'SMS') {
      await this.deliverSms(target, code);
      return;
    }

    if (this.emailTransport === 'console') {
      this.logger.warn(`[DEV ONLY] EMAIL OTP for ${target}: ${code}`);
      return;
    }

    if (channel !== 'EMAIL') {
      throw new AppException(
        'OTP_DELIVERY_UNAVAILABLE',
        'OTP delivery is not configured for this channel.',
        503,
      );
    }

    const source = this.configService.get<string>('otp_sender_email');
    if (!source) {
      throw new AppException(
        'OTP_DELIVERY_UNAVAILABLE',
        'Email OTP delivery is not configured.',
        503,
      );
    }

    if (this.emailTransport === 'smtp') {
      await this.deliverSmtp(target, code, source);
      return;
    }

    this.sesClient ??= new SESClient({
      region: this.configService.get<string>('kms_region', 'ap-south-1'),
    });

    await this.sesClient.send(
      new SendEmailCommand({
        Source: source,
        Destination: { ToAddresses: [target] },
        Message: {
          Subject: { Data: 'Your AutoApply verification code' },
          Body: {
            Text: {
              Data: `Your verification code is ${code}. It expires in 5 minutes.`,
            },
          },
        },
      }),
    );
  }

  private async deliverSmtp(target: string, code: string, source: string): Promise<void> {
    const host = this.configService.getOrThrow<string>('smtp_host');
    const port = this.configService.get<number>('smtp_port', 465);
    const secure = this.configService.get<boolean>('smtp_secure', true);
    const user = this.configService.getOrThrow<string>('smtp_user');
    const password = this.configService.getOrThrow<string>('smtp_password');

    this.smtpTransporter ??= nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
    });

    try {
      await this.smtpTransporter.sendMail({
        from: source,
        to: target,
        subject: 'Your AutoApply verification code',
        text: `Your verification code is ${code}. It expires in 5 minutes.`,
      });
    } catch {
      this.logger.error('SMTP email OTP delivery failed.');
      throw new AppException(
        'OTP_DELIVERY_FAILED',
        'Email verification could not be sent. Please check the local SMTP configuration.',
        503,
      );
    }
  }

  private async deliverSms(target: string, code: string): Promise<void> {
    if (this.smsTransport !== 'twilio') {
      if (this.configService.get<string>('node_env') !== 'production') {
        this.logger.warn(`[DEV ONLY] SMS OTP for ${target}: ${code}`);
        return;
      }
      throw new AppException(
        'OTP_DELIVERY_UNAVAILABLE',
        'SMS OTP delivery is not configured.',
        503,
      );
    }

    const accountSid = this.configService.get<string>('twilio_account_sid');
    const authToken = this.configService.get<string>('twilio_auth_token');
    const fromNumber = this.configService.get<string>('twilio_from_number');
    if (!accountSid || !authToken || !fromNumber) {
      throw new AppException(
        'OTP_DELIVERY_UNAVAILABLE',
        'SMS OTP delivery is not configured.',
        503,
      );
    }

    const body = new URLSearchParams({
      To: target,
      From: fromNumber,
      Body: `Your AutoApply verification code is ${code}. It expires in 5 minutes.`,
    });
    let response: Response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      this.logger.error('Twilio SMS delivery request failed before a response was received.');
      throw new AppException(
        'OTP_DELIVERY_FAILED',
        'SMS verification could not be sent. Please try again later.',
        503,
      );
    }

    if (!response.ok) {
      this.logger.error(`Twilio SMS delivery returned HTTP ${response.status}.`);
      throw new AppException(
        'OTP_DELIVERY_FAILED',
        'SMS verification could not be sent. Please try again later.',
        503,
      );
    }
  }
}