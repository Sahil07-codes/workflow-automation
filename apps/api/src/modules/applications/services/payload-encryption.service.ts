import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { openBuffer, sealBuffer } from '@autoapply/crypto';
import { UserKeyService } from '../../users/user-key.service';

@Injectable()
export class PayloadEncryptionService {
  constructor(private readonly userKeyService: UserKeyService) {}

  async encryptPayload(
    applicationId: string,
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<{ ciphertext: Buffer; hash: string }> {
    const serialized = this.serialize(payload);
    const dek = await this.userKeyService.getDek(userId);
    return {
      ciphertext: sealBuffer(serialized, dek, applicationId),
      hash: createHash('sha256').update(serialized).digest('hex'),
    };
  }

  async decryptPayload<T extends Record<string, unknown>>(
    applicationId: string,
    userId: string,
    ciphertext: Buffer,
    expectedHash: string,
  ): Promise<T> {
    const dek = await this.userKeyService.getDek(userId);
    const serialized = openBuffer(ciphertext, dek, applicationId).toString('utf8');
    const actualHash = createHash('sha256').update(serialized).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error('Application form payload integrity check failed');
    }
    return JSON.parse(serialized) as T;
  }

  computePayloadHash(payload: Record<string, unknown>): string {
    return createHash('sha256').update(this.serialize(payload)).digest('hex');
  }

  private serialize(value: unknown): string {
    return JSON.stringify(this.canonicalize(value));
  }

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalize(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.canonicalize(item)]),
      );
    }
    return value;
  }
}
