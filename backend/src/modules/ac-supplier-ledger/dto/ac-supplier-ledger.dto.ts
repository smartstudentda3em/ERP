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

export class CreateAcSupplierTaxPaymentDto {
  @IsUUID()
  supplierId: string;

  @IsOptional()
  @IsUUID()
  purchaseReceiptId?: string;

  @IsDateString()
  taxDate: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
