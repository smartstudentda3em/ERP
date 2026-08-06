import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateStockAuditLineDto {
  @IsUUID() productId: string;
  @IsNumber() systemQuantity: number;
  /** Null/omitted means this material was left uncounted ("بانتظار الجرد"). */
  @IsOptional() @IsNumber() actualQuantity?: number | null;
  @IsNumber() @Min(0) unitCost: number;
}

export class CreateStockAuditDto {
  @IsDateString() auditDate: string;
  @IsUUID() warehouseId: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockAuditLineDto)
  lines: CreateStockAuditLineDto[];
}

/** A line's editable field — productId identifies which existing line to update; systemQuantity/unitCost are historical snapshots and stay fixed. */
export class UpdateStockAuditLineDto {
  @IsUUID() productId: string;
  /** Null means "left uncounted" ("بانتظار الجرد"), same convention as CreateStockAuditLineDto. */
  @IsOptional() @IsNumber() actualQuantity?: number | null;
}

export class UpdateStockAuditDto {
  @IsOptional() @IsDateString() auditDate?: string;
  @IsOptional() @IsString() notes?: string;
  /** When present, replaces each named line's actualQuantity — see StockAuditsService.update()
   * for how this is reconciled against real stock when the audit is already APPROVED. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateStockAuditLineDto)
  lines?: UpdateStockAuditLineDto[];
}

/** An admin's override of one line's final approved quantity ("كمية المخزون الجديدة"), entered
 * while reviewing a pending audit — productId identifies which counted line to override. */
export class ApproveStockAuditLineDto {
  @IsUUID() productId: string;
  @IsNumber() adjustedQuantity: number;
}

export class ApproveStockAuditDto {
  /** Omitted or missing-for-a-line means that line's actualQuantity is used as-is — see
   * StockAuditsService.approve(). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveStockAuditLineDto)
  lines?: ApproveStockAuditLineDto[];
}
