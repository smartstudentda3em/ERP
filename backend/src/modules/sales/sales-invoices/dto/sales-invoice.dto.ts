import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { SalesLineDto } from '../../dto/sales-line.dto';
import { CashMovementAccount } from '../../../../entities/enums';

export class CreateSalesInvoiceDto {
  @IsDateString() invoiceDate: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsUUID() customerId: string;
  @IsUUID() warehouseId: string;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() salesOrderId?: string;
  @IsOptional() @IsUUID() salesRepresentativeId?: string;
  /** Which user this invoice is attributed to — defaults to the logged-in user if omitted, but can be reassigned to any user. */
  @IsOptional() @IsUUID() createdById?: string;
  @IsOptional() @IsString() notes?: string;
  /** Printing Press only — free-text customer identity, decoupled from the Customer table. */
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  /** Amount the customer paid up front, at invoice creation — anything left over posts to their AR balance. */
  @IsOptional() @IsNumber() @Min(0) paidAmount?: number;
  /** Which treasury account an upfront payment settles into — defaults to CASH when omitted, so
   * every existing caller that doesn't send this keeps its old behavior unchanged. */
  @IsOptional() @IsEnum(CashMovementAccount) paymentAccount?: CashMovementAccount;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines: SalesLineDto[];
}

/**
 * Deliberately scoped to fields with no stock/COGS/payment impact — the warehouse and line items
 * are never editable here, since changing a quantity or price after stock has already been issued
 * at that line's weighted-average cost would require a full reversal-and-reissue that this system
 * doesn't attempt. Use delete-and-recreate for anything beyond these fields.
 */
export class UpdateSalesInvoiceDto {
  @IsDateString() invoiceDate: string;
  @IsUUID() customerId: string;
  @IsOptional() @IsUUID() salesRepresentativeId?: string;
  @IsOptional() @IsUUID() createdById?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
}
