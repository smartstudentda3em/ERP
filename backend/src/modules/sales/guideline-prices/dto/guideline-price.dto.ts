import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class GuidelinePriceLineDto {
  @IsUUID() productId: string;
  @IsNumber() @Min(0) price: number;
}

/** AcCabolyPricesController's upsert body — one price shared by every product of the same
 * supplier+capacity, keyed by (companyId from the caller, supplierId, capacity). See
 * AcCabolyPrice's own entity doc comment. */
export class UpsertCabolyPriceDto {
  @IsUUID() supplierId: string;
  @IsString() capacity: string;
  @IsNumber() @Min(0) price: number;
}

export class GuidelinePriceCompanyEntryDto {
  @IsUUID() supplierId: string;
  @IsBoolean() isAuthorizedAgent: boolean;
  @IsNumber() @Min(0) @Max(100) discountPercentage: number;
}

/** One request creates one sheet per company row, all for the same month/year — the "add" modal's
 * first step only saves each sheet's header (supplier/agent status/discount); models/prices are
 * added afterwards per-sheet via edit, so `lines` has no place here. */
export class CreateGuidelinePriceSheetDto {
  @IsInt() @Min(1) @Max(12) month: number;
  @IsInt() @Min(2000) @Max(2100) year: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuidelinePriceCompanyEntryDto)
  companies: GuidelinePriceCompanyEntryDto[];
}

/** Month/year/companyId/supplierId are the sheet's identity and immutable after creation —
 * everything else can be edited. `lines` is full replace-on-edit (matches Quotation's convention):
 * omitted entirely leaves the existing lines untouched. Same for isAuthorizedAgent/
 * discountPercentage: each is independently optional, so the Guideline Prices table's "edit
 * companies" modal can patch just those two fields without having to resend lines. */
export class UpdateGuidelinePriceSheetDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuidelinePriceLineDto)
  lines?: GuidelinePriceLineDto[];

  @IsOptional()
  @IsBoolean()
  isAuthorizedAgent?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage?: number;
}
