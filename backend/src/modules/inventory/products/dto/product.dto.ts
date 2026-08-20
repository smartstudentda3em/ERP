import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductDto {
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsUUID() categoryId: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsUUID() unitId: string;
  @IsUUID() packageTypeId: string;
  @IsNumber() @Min(0.0001) unitsPerPackage: number;
  @IsOptional() @IsNumber() @Min(0) packagePurchasePrice?: number;
  @IsOptional() @IsNumber() @Min(0) packageSellingPrice?: number;
  @IsOptional() @IsNumber() @Min(0) sellingPrice?: number;
  @IsOptional() @IsNumber() wholesalePrice?: number;
  @IsOptional() @IsUUID() taxId?: string;
  @IsOptional() @IsNumber() discountPercent?: number;
  @IsOptional() @IsNumber() reorderLevel?: number;
  @IsOptional() @IsNumber() minimumQuantity?: number;
  @IsOptional() @IsNumber() maximumQuantity?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() tracksExpiry?: boolean;
  @IsOptional() @IsBoolean() tracksBatch?: boolean;
  @IsOptional() @IsBoolean() tracksSerial?: boolean;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() notes?: string;
  /** Printing Press only — see Product.isSellable. */
  @IsOptional() @IsBoolean() isSellable?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

/** Printing Press "المنتجات" catalog only — a pure sales price-list entry with no stock/package
 * concept, so this deliberately excludes every inventory-specific field CreateProductDto carries
 * (sku, category, unit, packaging, purchase price, ...). ProductsService.createCatalogItem fills
 * those in with hidden, invisible-to-the-user defaults. */
export class CreateCatalogProductDto {
  @IsString() nameEn: string;
  /** الحجم / المقاس / الرقم */
  @IsOptional() @IsString() size?: string;
  /** المواصفات */
  @IsOptional() @IsString() notes?: string;
  /** سعر البيع الاسترشادي */
  @IsOptional() @IsNumber() @Min(0) sellingPrice?: number;
}

export class UpdateCatalogProductDto extends PartialType(CreateCatalogProductDto) {}
