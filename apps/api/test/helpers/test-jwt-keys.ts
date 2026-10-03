import { generateKeyPairSync } from 'crypto';

export function configureTestJwtKeys(): void {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  process.env.JWT_PRIVATE_KEY = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString()
    .replace(/\n/g, '\\n');
  process.env.JWT_PUBLIC_KEY = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString()
    .replace(/\n/g, '\\n');
}

configureTestJwtKeys();