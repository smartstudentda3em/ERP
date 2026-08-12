import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { CashMovementAccount } from '../../../entities/enums';

export class CreateCapitalInjectionDto {
  @IsUUID() companyId: string;
  @IsDateString() movementDate: string;
  @IsNumber() @Min(0.01) amount: number;
  /** The one partner actually paying this in from their own pocket — never split across the others. */
  @IsUUID() partnerId: string;
  @IsOptional() @IsString() description?: string;
  /** Required for PRESS/STAT/AC (see PAYMENT_ACCOUNT_REQUIRED_COMPANY_CODES): which real account
   * — الخزنة النقدي (CASH) or الحساب البنكي (BANK) — this contribution lands in. Enforced server-side
   * by assertPaymentAccountProvided, not just a UI nicety. */
  @IsOptional() @IsEnum(CashMovementAccount) account?: CashMovementAccount;
  /** Printing Press only: which branch this contribution is attributed to. Ignored by every other company. */
  @IsOptional() @IsUUID() branchId?: string;
}

export class UpdateCapitalInjectionDto {
  @IsDateString() movementDate: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsString() description?: string;
  /** Required for PRESS/STAT/AC: lets an edited contribution move to the other account. */
  @IsOptional() @IsEnum(CashMovementAccount) account?: CashMovementAccount;
  /** Printing Press only: lets an edited contribution move to another branch. */
  @IsOptional() @IsUUID() branchId?: string;
}

export class CreateCommissionPayoutDto {
  @IsDateString() movementDate: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(CashMovementAccount) account: CashMovementAccount;
  /** The branch manager this payout goes to. */
  @IsUUID() salesRepresentativeId: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateCommissionPayoutDto {
  @IsDateString() movementDate: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(CashMovementAccount) account: CashMovementAccount;
  @IsOptional() @IsString() description?: string;
}

export class CreateDividendDto {
  @IsUUID() companyId: string;
  @IsDateString() movementDate: string;
  @IsNumber() @Min(0.01) amount: number;
  /** The one partner this payout goes to — capped server-side at their remaining share of the quarter's available profit. */
  @IsUUID() partnerId: string;
  @IsInt() @Min(2000) @Max(3000) year: number;
  /** 1-4 for a quarter, 0 for the full calendar year. */
  @IsInt() @Min(0) @Max(4) quarter: number;
  @IsOptional() @IsString() description?: string;
  /** Printing Press only: which branch this payout is drawn from. Ignored by every other company. */
  @IsOptional() @IsUUID() branchId?: string;
  /** Which real treasury account this payout is drawn from — mandatory, balance-checked. */
  @IsEnum(CashMovementAccount) account: CashMovementAccount;
}
