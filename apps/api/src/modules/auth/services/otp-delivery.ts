import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { AppException } from '@/common/exceptions/app.exception';

type OtpChannel = 'EMAIL' | 'SMS';

@Injectable()
export class OtpDelivery {
  private readonly logger = new Logger(OtpDelivery.name);
  private readonly transport: string;
  private sesClient?: SESClient;

  constructor(private readonly configService: ConfigService) {
    this.transport = (configService.get<string>('OTP_TRANSPORT') ?? 'ses').toLowerCase();

    // The console sender prints codes, so it must never run in production.
    if (this.transport === 'console' && configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('OTP_TRANSPORT=console is not allowed in production');
    }
    if (this.transport !== 'console' && this.transport !== 'ses') {
      throw new Error(`Unknown OTP_TRANSPORT "${this.transport}" (expected "console" or "ses")`);
    }
  }

  async deliver(target: string, channel: OtpChannel, code: string): Promise<void> {
    if (this.transport === 'console') {
      this.logger.warn(`[DEV ONLY] ${channel} OTP for ${target}: ${code}`);
      return;
    }

    if (channel !== 'EMAIL') {
      throw new AppException(
        'OTP_DELIVERY_UNAVAILABLE',
        'SMS OTP delivery is not configured.',
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
}