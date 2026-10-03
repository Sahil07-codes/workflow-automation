import { Injectable } from '@nestjs/common';
import {
  sealBuffer,
  openBuffer,
} from '@autoapply/crypto';
import { UserKeyService } from '@/modules/users/user-key.service';

@Injectable()
export class ProfileEncryptionService {
  constructor(private readonly userKeyService: UserKeyService) {}

  async encryptProfileData(userId: string, profileData: any) {
    const dek = await this.userKeyService.getDek(userId);
    const encrypted = sealBuffer(JSON.stringify(profileData), dek, userId);
    const dekWrapped = await this.userKeyService.getWrappedDek(userId);

    return {
      data_enc: encrypted,
      dek_wrapped: dekWrapped,
    };
  }

  async decryptProfileData(userId: string, dataEnc: Buffer) {
    const dek = await this.userKeyService.getDek(userId);
    const decrypted = openBuffer(dataEnc, dek, userId).toString('utf8');
    return JSON.parse(decrypted);
  }
}
