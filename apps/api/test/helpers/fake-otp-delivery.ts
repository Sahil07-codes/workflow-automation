export class FakeOtpDelivery {
  private readonly codes = new Map<string, string>();

  async deliver(
    target: string,
    channel: 'EMAIL' | 'SMS',
    code: string,
  ): Promise<void> {
    this.codes.set(`${channel}:${target}`, code);
  }

  getCode(target: string, channel: 'EMAIL' | 'SMS' = 'EMAIL'): string {
    const code = this.codes.get(`${channel}:${target}`);
    if (!code) throw new Error(`No OTP stored for ${target}`);
    return code;
  }
}