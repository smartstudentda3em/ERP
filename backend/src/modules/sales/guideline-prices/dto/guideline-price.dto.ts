import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class GuidelinePriceLineDto {
  @IsUUID() productId: string;
  @IsNumber() @Min(0) price: number;
}

/** `lines` is optional here by design — the "add" modal's first step only saves the header
 * (month/year/supplier/agent status/discount); models/prices are added afterwards via edit. */
export class CreateGuidelinePriceSheetDto {
  @IsInt() @Min(1) @Max(12) month: number;
  @IsInt() @Min(2000) @Max(2100) year: number;
  @IsUUID() supplierId: string;
  @IsBoolean() isAuthorizedAgent: boolean;
  @IsNumber() @Min(0) @Max(100) discountPercentage: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuidelinePriceLineDto)
  lines?: GuidelinePriceLineDto[];
}

/** Month/year/companyId are the sheet's identity and immutable after creation — only `lines` can
 * be edited, full replace-on-edit (matches Quotation's convention): omitted entirely leaves the
 * existing lines untouched. */
export class UpdateGuidelinePriceSheetDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuidelinePriceLineDto)
  lines?: GuidelinePriceLineDto[];
}
