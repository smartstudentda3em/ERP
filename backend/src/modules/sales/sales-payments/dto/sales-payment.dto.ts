import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { CashMovementAccount, PaymentMethod } from '../../../../entities/enums';

export class CreateSalesPaymentDto {
  @IsDateString() paymentDate: string;
  /** Optional — Printing Press receipts (deposited by the branch manager, not tied to a specific
   * customer account) omit this entirely; every other company's form still requires picking one. */
  @IsOptional() @IsUUID() customerId?: string;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() salesRepresentativeId?: string;
  /** Optional — defaults to CASH when omitted (see SalesPaymentsService.create()), same convention
   * as paymentAccount below. Printing Press's simplified receipt form never sends this. */
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
  /** Which treasury account this receipt actually settles into — defaults to CASH when omitted,
   * so every existing caller that doesn't send this keeps its old behavior unchanged. Distinct
   * from `method`, which stays purely descriptive (cash in hand vs. transfer vs. cheque, etc.). */
  @IsOptional() @IsEnum(CashMovementAccount) paymentAccount?: CashMovementAccount;
}
