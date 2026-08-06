import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { SaleUnitKind } from '../../../entities/enums';

export class SalesLineDto {
  @IsUUID() productId: string;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) discountPercent?: number;
  @IsOptional() @IsNumber() @Min(0) taxPercent?: number;
  /** Sales invoices only: which unit `quantity`/`unitPrice` are expressed in. Ignored elsewhere. */
  @IsOptional() @IsEnum(SaleUnitKind) unitKind?: SaleUnitKind;
}
