import * as crypto from 'crypto';

export interface KmsClient {
  encrypt(plaintext: Buffer): Promise<Buffer>;
  decrypt(ciphertext: Buffer): Promise<Buffer>;
}

class LocalKmsMock implements KmsClient {
  private masterKey: Buffer;

  constructor(keyId: string = 'local-dev-key') {
    this.masterKey = crypto.createHash('sha256').update(keyId).digest();
  }

  async encrypt(plaintext: Buffer): Promise<Buffer> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    let encrypted = cipher.update(plaintext);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    const iv = ciphertext.slice(0, 16);
    const authTag = ciphertext.slice(16, 32);
    const encrypted = ciphertext.slice(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted;
  }
}

class AwsKmsClient implements KmsClient {
  private keyId: string;

  constructor(keyId: string) {
    this.keyId = keyId;
  }

  async encrypt(plaintext: Buffer): Promise<Buffer> {
    const { KMSClient, EncryptCommand } = await import('@aws-sdk/client-kms');
    const client = new KMSClient({ region: process.env.KMS_REGION || 'ap-south-1' });

    const command = new EncryptCommand({ KeyId: this.keyId, Plaintext: plaintext });
    const response = await client.send(command);
    if (!response.CiphertextBlob) throw new Error('KMS encryption failed: no ciphertext returned');
    return Buffer.from(response.CiphertextBlob);
  }

  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
    const client = new KMSClient({ region: process.env.KMS_REGION || 'ap-south-1' });

    const command = new DecryptCommand({ CiphertextBlob: ciphertext });
    const response = await client.send(command);
    if (!response.Plaintext) throw new Error('KMS decryption failed: no plaintext returned');
    return Buffer.from(response.Plaintext);
  }
}

let instance: KmsClient | null = null;

export function getKmsClient(): KmsClient {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const kmsKeyId = process.env.KMS_KEY_ID || 'local-dev-key';

  if (nodeEnv === 'development' || nodeEnv === 'test') return new LocalKmsMock(kmsKeyId);
  return new AwsKmsClient(kmsKeyId);
}

export function initKmsClient(): KmsClient {
  if (!instance) instance = getKmsClient();
  return instance;
}

export function getKmsInstance(): KmsClient {
  return initKmsClient();
}
