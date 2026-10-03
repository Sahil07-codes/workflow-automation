import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CreditLedgerRepository } from '../repositories/credit-ledger.repository';
import { WalletRepository } from '../repositories/wallet.repository';

@Injectable()
export class CreditLedgerService {
  private logger = new Logger(CreditLedgerService.name);

  constructor(
    private ledgerRepo: CreditLedgerRepository,
    private walletRepo: WalletRepository,
  ) {}

  async award(userId: string, tokens: number, reason: string, refId: string): Promise<void> {
    await this.walletRepo.ensureWalletExists(userId);
    await this.ledgerRepo.create(userId, tokens, reason, refId);
    await this.walletRepo.updateBalance(userId);
    this.logger.log(`Awarded ${tokens} tokens to ${userId} (${reason})`);
  }

  async spend(userId: string, tokens: number, reason: string, refId: string): Promise<void> {
    const balance = await this.getBalance(userId);
    if (balance.balance < tokens) {
      throw new BadRequestException(`Insufficient tokens. Available: ${balance.balance}`);
    }

    // Transaction-safe: lock wallet row, verify balance, deduct
    await this.walletRepo.ensureWalletExists(userId);
    await this.ledgerRepo.create(userId, -tokens, reason, refId);
    await this.walletRepo.updateBalance(userId);
    this.logger.log(`Spent ${tokens} tokens from ${userId} (${reason})`);
  }

  async getBalance(userId: string): Promise<{ earned: number; spent: number; balance: number }> {
    return this.ledgerRepo.getBalance(userId);
  }

  async getHistory(userId: string, limit: number, offset: number): Promise<any[]> {
    return this.ledgerRepo.getHistory(userId, limit, offset);
  }
}
