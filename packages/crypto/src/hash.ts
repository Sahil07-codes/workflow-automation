import * as crypto from 'crypto';

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacSha256(input: string | Buffer, key: string | Buffer): string {
  const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'utf-8') : key;
  const inputBuffer = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return crypto.createHmac('sha256', keyBuffer).update(inputBuffer).digest('hex');
}

export function timingSafeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const aBuffer = typeof a === 'string' ? Buffer.from(a, 'utf-8') : a;
  const bBuffer = typeof b === 'string' ? Buffer.from(b, 'utf-8') : b;

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function randomBytes(length: number): Buffer {
  return crypto.randomBytes(length);
}

export function randomHex(byteLength: number): string {
  return randomBytes(byteLength).toString('hex');
}

export function randomNumericString(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += crypto.randomInt(0, 10).toString();
  return out;
}

export function randomInt(max: number): number {
  return crypto.randomInt(0, max);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function hashValue(value: string): string {
  return sha256Hex(value);
}

export function canonicalJsonHash(obj: unknown): string {
  return sha256Hex(stableStringify(obj));
}
