import { IsEnum, IsInt, Min } from 'class-validator';

export class RedeemTokensDto {
  @IsEnum(['PRICE_DISCOUNT', 'APP_INCREASE'])
  option!: 'PRICE_DISCOUNT' | 'APP_INCREASE';

  @IsInt()
  @Min(1)
  tokens_to_redeem!: number;
}
