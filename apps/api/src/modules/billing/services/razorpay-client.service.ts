import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RazorpaySubscriptionResponse {
  id: string;
  short_url?: string;
  status?: string;
}

@Injectable()
export class RazorpayClientService {
  private readonly keyId: string;
  private readonly keySecret: string;

  constructor(private config: ConfigService) {
    this.keyId = this.config.get<string>('razorpay_key_id') || '';
    this.keySecret = this.config.get<string>('razorpay_key_secret') || '';
  }

  async createSubscription(planId: string, quantity: number = 1) {
    if (!this.keyId || !this.keySecret) {
      throw new Error('Razorpay credentials are not configured');
    }

    return this.request<RazorpaySubscriptionResponse>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        quantity,
        customer_notify: 1,
      }),
    });
  }

  async cancelSubscription(subscriptionId: string) {
    return this.request<RazorpaySubscriptionResponse>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ cancel_at_cycle_end: 0 }),
      },
    );
  }

  async fetchSubscription(subscriptionId: string) {
    return this.request<RazorpaySubscriptionResponse>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: 'GET' },
    );
  }

  private async request<T>(path: string, options: RequestInit): Promise<T> {
    const authorization = Buffer.from(`${this.keyId}:${this.keySecret}`).toString(
      'base64',
    );
    let response: Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1${path}`, {
        ...options,
        headers: {
          Authorization: `Basic ${authorization}`,
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BadGatewayException('Could not reach the payment provider.');
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Payment provider request failed (${response.status}).`,
      );
    }
    return (await response.json()) as T;
  }
}
