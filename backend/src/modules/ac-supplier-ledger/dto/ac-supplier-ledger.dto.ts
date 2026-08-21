import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class CreateAcSupplierPaymentDto {
  @IsUUID()
  supplierId: string;

  @IsDateString()
  paymentDate: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

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
