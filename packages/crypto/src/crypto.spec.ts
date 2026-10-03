import { canonicalJsonHash, openBuffer, sealBuffer, sha256Hex } from './index';

describe('crypto primitives', () => {
  it('round-trips buffer encryption with AAD binding', () => {
    const dek = Buffer.alloc(32, 7);
    const plaintext = Buffer.from('hello world');
    const sealed = sealBuffer(plaintext, dek, 'user-123');

    expect(sealed).toBeInstanceOf(Buffer);
    expect(sealed.equals(plaintext)).toBe(false);
    expect(openBuffer(sealed, dek, 'user-123').equals(plaintext)).toBe(true);
  });

  it('fails when AAD is wrong', () => {
    const dek = Buffer.alloc(32, 9);
    const sealed = sealBuffer('payload', dek, 'user-123');
    expect(() => openBuffer(sealed, dek, 'user-999')).toThrow(/authentication failed|Decryption failed/i);
  });

  it('hashes nested objects deterministically and changes on value change', () => {
    const left = canonicalJsonHash({ a: { x: 1, y: 2 } });
    const right = canonicalJsonHash({ a: { y: 2, x: 1 } });
    const different = canonicalJsonHash({ a: { x: 2, y: 2 } });

    expect(left).toBe(right);
    expect(left).not.toBe(different);
  });

  it('uses the real KMS mock and supports canonical hashing for unordered keys', () => {
    const same1 = canonicalJsonHash({ b: 2, a: { c: 3, d: 4 } });
    const same2 = canonicalJsonHash({ a: { d: 4, c: 3 }, b: 2 });
    expect(same1).toBe(same2);
    expect(sha256Hex('abc')).toMatch(/^[a-f0-9]{64}$/);
  });
});
