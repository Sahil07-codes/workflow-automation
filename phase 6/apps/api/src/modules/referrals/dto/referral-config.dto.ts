import { IsInt, IsNumber, IsBoolean, Min, Max, IsOptional } from 'class-validator';

export class ReferralConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  token_per_qualified_referee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  token_to_price_reduction_percent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  token_to_app_increase?: number;

  @IsOptional()
  @IsInt()
  max_tokens_per_renewal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  hold_period_days?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
