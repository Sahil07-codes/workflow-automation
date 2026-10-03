import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class PayloadEncryptionService {
  private logger = new Logger(PayloadEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly tagLength = 16;
  private readonly saltLength = 32;

  constructor() {}

  encryptPayload(plaintext: string, encryptionKey: Buffer): string {
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(this.saltLength);
    const key = crypto
      .pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256')
      .slice(0, 32);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();
    const result = Buffer.concat([salt, iv, authTag, encrypted]);

    return result.toString('base64');
  }

  decryptPayload(ciphertext: string, encryptionKey: Buffer): string {
    const buffer = Buffer.from(ciphertext, 'base64');
    const salt = buffer.slice(0, this.saltLength);
    const iv = buffer.slice(this.saltLength, this.saltLength + 16);
    const authTag = buffer.slice(this.saltLength + 16, this.saltLength + 16 + this.tagLength);
    const encrypted = buffer.slice(this.saltLength + 16 + this.tagLength);

    const key = crypto
      .pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha256')
      .slice(0, 32);

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  }

  computePayloadHash(payload: any): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}
