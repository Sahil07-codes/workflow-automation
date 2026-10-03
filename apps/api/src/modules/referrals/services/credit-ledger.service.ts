import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreditLedgerRepository } from '../repositories/credit-ledger.repository';

@Injectable()
export class CreditLedgerService {
  private readonly logger = new Logger(CreditLedgerService.name);

  constructor(private readonly ledgerRepo: CreditLedgerRepository) {}

  async award(userId: string, tokens: number, reason: string, refId: string): Promise<void> {
    this.validateAmount(tokens);
    const inserted = await this.ledgerRepo.award(userId, tokens, reason, refId);
    if (inserted) this.logger.log(`Awarded ${tokens} tokens to ${userId} (${reason})`);
  }

  async spend(userId: string, tokens: number, reason: string, refId: string): Promise<void> {
    this.validateAmount(tokens);
    const result = await this.ledgerRepo.spend(userId, tokens, reason, refId);
    if (!result.spent) {
      throw new BadRequestException(`Insufficient tokens. Available: ${result.balance}`);
    }
    this.logger.log(`Spent ${tokens} tokens from ${userId} (${reason})`);
  }

  getBalance(userId: string) {
    return this.ledgerRepo.getBalance(userId);
  }

  getHistory(userId: string, limit: number, offset: number) {
    return this.ledgerRepo.getHistory(userId, limit, offset);
  }

  private validateAmount(tokens: number): void {
    if (!Number.isSafeInteger(tokens) || tokens <= 0) {
      throw new BadRequestException('Token amount must be a positive integer');
    }
  }
}
