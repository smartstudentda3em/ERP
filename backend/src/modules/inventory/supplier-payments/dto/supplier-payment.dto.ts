import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaymentMethod } from '../../../../entities/enums';

export class CreateSupplierPaymentDto {
  @IsDateString() paymentDate: string;
  @IsUUID() supplierId: string;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** Optional — omitted for a general payment on account, not tied to one receipt (see
   * SupplierStatementPage.tsx's aggregate "Pay Outstanding" action). When given, the payment is
   * credited onto that receipt's own paidAmount (PurchasingPage.tsx's per-row action). */
  @IsOptional() @IsUUID() purchaseReceiptId?: string;
  /** بنكي/كاش — every company's "سداد المتبقي" modal requires an explicit choice, never defaulted. */
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSupplierPaymentDto extends CreateSupplierPaymentDto {}
