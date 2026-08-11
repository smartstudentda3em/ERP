import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { CashMovementAccount, CashMovementType } from '../../../entities/enums';

export class CreateManualCashMovementDto {
  @IsUUID() companyId: string;
  @IsDateString() movementDate: string;
  @IsEnum(CashMovementType) type: CashMovementType;
  @IsEnum(CashMovementAccount) account: CashMovementAccount;
  @IsNumber() @Min(0.01) amount: number;
  @IsString() category: string;
  @IsOptional() @IsString() description?: string;
  /** Printing Press only: which branch this expense is attributed to. Ignored by every other company. */
  @IsOptional() @IsUUID() branchId?: string;
}

export class UpdateManualExpenseDto {
  @IsDateString() movementDate: string;
  @IsEnum(CashMovementAccount) account: CashMovementAccount;
  @IsNumber() @Min(0.01) amount: number;
  @IsString() category: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class CreateTransferDto {
  @IsDateString() movementDate: string;
  @IsEnum(CashMovementAccount) fromAccount: CashMovementAccount;
  @IsEnum(CashMovementAccount) toAccount: CashMovementAccount;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() description?: string;
  /** Printing Press only: which branch's till this transfer moves money for. Ignored by every other company (e.g. Air Conditioning, which also uses transfers but has no branches). */
  @IsOptional() @IsUUID() branchId?: string;
  /** Required exactly when fromAccount is REP_TREASURY — settling one مندوب's own pocket. */
  @IsOptional() @IsUUID() fromSalesRepresentativeId?: string;
}
