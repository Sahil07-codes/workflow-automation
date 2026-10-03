import { Injectable } from '@nestjs/common';
import {
  generateDek,
  wrapDekWithKms,
  unwrapDekWithKms,
  encryptObject,
  decryptObject,
} from '@autoapply/crypto';

@Injectable()
export class ProfileEncryptionService {
  async encryptProfileData(profileData: any) {
    // Generate a new DEK (Data Encryption Key)
    const dek = generateDek();

    // Encrypt the profile data with the DEK
    const encrypted = encryptObject(profileData, dek);

    // Wrap the DEK with KMS
    const dekWrapped = wrapDekWithKms(dek);

    return {
      data_enc: encrypted,
      dek_wrapped: dekWrapped,
    };
  }

  async decryptProfileData(dataEnc: Buffer, dekWrapped: Buffer) {
    // Unwrap the DEK from KMS
    const dek = await unwrapDekWithKms(dekWrapped);

    // Decrypt the profile data
    const decrypted = decryptObject(dataEnc, dek);

    return decrypted;
  }
}
