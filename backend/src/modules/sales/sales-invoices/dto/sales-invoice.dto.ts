import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
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
  /** Optional only for Air Conditioning's quick-entry flow (typed Name/Phone instead of picking an
   * existing customer) — see quickSaleType below. Every other caller must still send a real id;
   * enforced in the service, not here, since the rule depends on the company. */
  @IsOptional() @IsUUID() customerId?: string;
  @IsUUID() warehouseId: string;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() salesOrderId?: string;
  @IsOptional() @IsUUID() salesRepresentativeId?: string;
  /** Which user this invoice is attributed to — defaults to the logged-in user if omitted, but can be reassigned to any user. */
  @IsOptional() @IsUUID() createdById?: string;
  @IsOptional() @IsString() notes?: string;
  /** Printing Press: free-text customer identity, decoupled from the Customer table. Air
   * Conditioning: the customer's typed name/phone/address when customerId is omitted — see
   * quickSaleType. */
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  /** Air Conditioning quick-entry only. */
  @IsOptional() @IsString() customerAddress?: string;
  /** Air Conditioning quick-entry only — which of the two non-installment sale types this is.
   * Both CASH and CREDIT are resolved/created as a real Customer row (reused by phone match), so
   * every quick-entry sale shows up properly on the Customers list under its real name/phone.
   * Only affects downstream payment handling (see paidAmount below); not meaningful (and ignored)
   * when customerId is provided. */
  @IsOptional() @IsIn(['CASH', 'CREDIT']) quickSaleType?: 'CASH' | 'CREDIT';
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
