import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class GuidelinePriceLineDto {
  @IsUUID() productId: string;
  @IsNumber() @Min(0) price: number;
}

export class CreateGuidelinePriceSheetDto {
  @IsInt() @Min(1) @Max(12) month: number;
  @IsInt() @Min(2000) @Max(2100) year: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuidelinePriceLineDto)
  lines: GuidelinePriceLineDto[];
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
