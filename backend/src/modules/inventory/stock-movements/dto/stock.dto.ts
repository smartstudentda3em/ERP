import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { CashMovementAccount } from '../../../../entities/enums';

export class StockAdjustmentLineDto {
  @IsUUID() productId: string;
  @IsNumber() systemQuantity: number;
  @IsNumber() countedQuantity: number;
  @IsNumber() @Min(0) unitCost: number;
}

export class CreateStockAdjustmentDto {
  @IsDateString() adjustmentDate: string;
  @IsUUID() warehouseId: string;
  @IsOptional() @IsString() reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentLineDto)
  lines: StockAdjustmentLineDto[];
}

export class StockTransferLineDto {
  @IsUUID() productId: string;
  @IsNumber() @Min(0.0001) quantity: number;
}

export class CreateStockTransferDto {
  @IsDateString() transferDate: string;
  @IsUUID() fromWarehouseId: string;
  @IsUUID() toWarehouseId: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferLineDto)
  lines: StockTransferLineDto[];
}

export class UpdateStockLocationDto {
  @IsString() location: string;
}

export class CreatePurchaseReceiptDto {
  @IsDateString() receiptDate: string;
  @IsUUID() productId: string;
  @IsUUID() warehouseId: string;
  @IsUUID() supplierId: string;
  @IsNumber() @Min(0.0001) quantityPackages: number;
  @IsNumber() @Min(0) packagePurchasePrice: number;
  @IsOptional() @IsNumber() @Min(0) packageSellingPrice?: number;
  @IsOptional() @IsNumber() @Min(0) unitSellingPrice?: number;
  /** Amount actually paid to the supplier up front (cash/transfer) at receipt time — the rest posts to the supplier's outstanding balance. Omitted/0 means fully on credit (آجل). */
  @IsOptional() @IsNumber() @Min(0) paidAmount?: number;
  /** Which treasury account the up-front payment came out of — required only when paidAmount > 0. */
  @IsOptional() @IsEnum(CashMovementAccount) paymentAccount?: CashMovementAccount;
  /** Printing Press only: which branch this purchase targets. Ignored by every other company. */
  @IsOptional() @IsUUID() branchId?: string;
  /** Air Conditioning company only — see PurchaseReceiptsService.assertFreeGoodsAllowed for the
   * company gate and the packagePurchasePrice/paidAmount-must-be-0 enforcement. */
  @IsOptional() @IsBoolean() isFreeGoods?: boolean;
}

// Deliberately not PartialType(CreatePurchaseReceiptDto): editing a receipt always resubmits the
// full form (see PurchaseReceiptsService.update(), which reverses the original stock/cash effect
// and reapplies the new one in full rather than patching a delta), so every field stays required
// exactly like on create.
export class UpdatePurchaseReceiptDto extends CreatePurchaseReceiptDto {}
