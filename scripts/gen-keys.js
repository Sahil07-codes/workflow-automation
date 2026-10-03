const { generateKeyPairSync, randomBytes } = require('crypto');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const esc = (pem) => pem.replace(/\n/g, '\\n');
console.log(`JWT_PRIVATE_KEY="${esc(privateKey.export({ type: 'pkcs8', format: 'pem' }))}"`);
console.log(`JWT_PUBLIC_KEY="${esc(publicKey.export({ type: 'spki', format: 'pem' }))}"`);
console.log(`OTP_PEPPER=${randomBytes(32).toString('hex')}`);