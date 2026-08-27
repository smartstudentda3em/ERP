import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";
import { CashMovementAccount } from "../../../entities/enums";

export class CreateAcSupplierPaymentDto {
  @IsUUID()
  supplierId: string;

  @IsDateString()
  paymentDate: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  /** Which treasury account this payment is drawn from — الخزينة النقدي (كاش) or الرصيد البنكي.
   * See AcSupplierPaymentsService.create() for the balance check and the linked CashMovement. */
  @IsEnum(CashMovementAccount)
  paymentAccount: CashMovementAccount;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAcSupplierBonusDto {
  @IsUUID()
  supplierId: string;

  @IsDateString()
  bonusDate: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAcSupplierTaxPaymentDto {
  /** Omitted entirely for a "ضرائب عامة" (general tax) entry not attributed to any one supplier —
   * see AcSupplierTaxPayment.supplierId's own doc comment. */
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsDateString()
  taxDate: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  /** Which treasury account this tax payment is drawn from — الخزينة النقدي (كاش) or الرصيد
   * البنكي. See AcSupplierTaxPaymentsService.create() for the balance check and the linked
   * CashMovement. */
  @IsEnum(CashMovementAccount)
  paymentAccount: CashMovementAccount;

  @IsOptional()
  @IsString()
  notes?: string;
}
