import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { SalesLineDto } from '../../dto/sales-line.dto';

export { SalesLineDto };

export class CreateQuotationDto {
  @IsDateString() quotationDate: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsUUID() customerId: string;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() salesRepresentativeId?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines: SalesLineDto[];
}

/** Full replace-on-edit for `lines` (like most other multi-line documents in this app) — omitted
 * entirely leaves the existing lines/totals untouched. */
export class UpdateQuotationDto {
  @IsOptional() @IsDateString() quotationDate?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() salesRepresentativeId?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines?: SalesLineDto[];
}
