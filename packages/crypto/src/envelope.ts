import * as crypto from 'crypto';
import { getKmsInstance } from './kms-client';
import { sha256Hex, hmacSha256, timingSafeEqual } from './hash';

export interface EncryptedFieldData {
  iv: string;
  ciphertext: string;
  authTag: string;
  algorithm: string;
}

export function encryptField(plaintext: string, dek: Buffer): EncryptedFieldData {
  if (dek.length !== 32) throw new Error('DEK must be 32 bytes for AES-256-GCM');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);

  let ciphertext = cipher.update(plaintext, 'utf-8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag: authTag.toString('hex'),
    algorithm: 'aes-256-gcm',
  };
}

export function decryptField(encrypted: EncryptedFieldData, dek: Buffer): string {
  if (dek.length !== 32) throw new Error('DEK must be 32 bytes for AES-256-GCM');
  if (encrypted.algorithm !== 'aes-256-gcm') throw new Error(`Unsupported encryption algorithm: ${encrypted.algorithm}`);

  const iv = Buffer.from(encrypted.iv, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
  const authTag = Buffer.from(encrypted.authTag, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);

  try {
    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
    return plaintext.toString('utf-8');
  } catch {
    throw new Error('Decryption failed: authentication tag verification failed (tampering detected)');
  }
}

export function generateDek(): Buffer {
  return crypto.randomBytes(32);
}

export function encryptObject<T extends Record<string, any>>(
  obj: T,
  dek: Buffer,
  fieldsToEncrypt: (keyof T)[] = Object.keys(obj) as (keyof T)[],
): Record<string, any> {
  const encrypted: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (fieldsToEncrypt.includes(key as keyof T) && value !== null && value !== undefined) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      encrypted[key] = encryptField(stringValue, dek);
    } else {
      encrypted[key] = value;
    }
  }

  return encrypted;
}

export function decryptObject<T extends Record<string, any>>(
  encryptedObj: Record<string, any>,
  dek: Buffer,
  fieldsToDecrypt: string[] = Object.keys(encryptedObj),
): T {
  const decrypted: Record<string, any> = {};

  for (const [key, value] of Object.entries(encryptedObj)) {
    if (fieldsToDecrypt.includes(key) && value && typeof value === 'object' && 'ciphertext' in value) {
      decrypted[key] = decryptField(value as EncryptedFieldData, dek);
    } else {
      decrypted[key] = value;
    }
  }

  return decrypted as T;
}

export function hashEncryptedField(encrypted: EncryptedFieldData): string {
  const canonical = JSON.stringify({
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    authTag: encrypted.authTag,
    algorithm: encrypted.algorithm,
  });
  return sha256Hex(canonical);
}

export function signEncryptedField(encrypted: EncryptedFieldData, signingKey: string): string {
  const data = JSON.stringify({
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    authTag: encrypted.authTag,
  });
  return hmacSha256(data, signingKey);
}

export function verifyEncryptedFieldSignature(
  encrypted: EncryptedFieldData,
  signature: string,
  signingKey: string,
): boolean {
  const expected = signEncryptedField(encrypted, signingKey);
  return timingSafeEqual(signature, expected);
}

export function sealBuffer(plaintext: string | Buffer, dek: Buffer, aad?: string): Buffer {
  if (dek.length !== 32) throw new Error('DEK must be 32 bytes');
  const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function openBuffer(sealed: Buffer, dek: Buffer, aad?: string): Buffer {
  if (dek.length !== 32) throw new Error('DEK must be 32 bytes');
  if (sealed.length < 28) throw new Error('Ciphertext too short');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, sealed.subarray(0, 12));
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(sealed.subarray(12, 28));
  try {
    return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
  } catch {
    throw new Error('Decryption failed: authentication failed');
  }
}

export async function wrapDek(dek: Buffer): Promise<Buffer> {
  return getKmsInstance().encrypt(dek);
}

export async function unwrapDek(wrapped: Buffer): Promise<Buffer> {
  return getKmsInstance().decrypt(wrapped);
}
