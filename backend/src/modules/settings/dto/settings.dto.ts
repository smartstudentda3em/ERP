import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { NumberingResetPeriod } from '../../../entities/enums';

export class CreateCompanyDto {
  @IsString() code: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() baseCurrencyCode?: string;
  @IsOptional() @IsBoolean() warnOnSellBelowCost?: boolean;
}
export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {}

export class CreateBranchDto {
  @IsString() code: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isMainBranch?: boolean;
  @IsUUID() companyId: string;
}
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class CreateWarehouseDto {
  @IsString() code: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() branchId?: string;
}
export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}

export class CreateCurrencyDto {
  @IsString() code: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() symbol?: string;
  @IsOptional() @IsNumber() decimalPlaces?: number;
  @IsOptional() @IsBoolean() isBaseCurrency?: boolean;
}
export class UpdateCurrencyDto extends PartialType(CreateCurrencyDto) {}

export class CreateExchangeRateDto {
  @IsUUID() currencyId: string;
  @IsNumber() rateToBase: number;
  @IsDateString() effectiveDate: string;
}

export class CreateTaxDto {
  @IsString() code: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsNumber() rate: number;
  @IsOptional() @IsBoolean() isWithholding?: boolean;
}
export class UpdateTaxDto extends PartialType(CreateTaxDto) {}

export class CreateFiscalYearDto {
  @IsUUID() companyId: string;
  @IsString() name: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}

export class CreateNumberingSeriesDto {
  @IsUUID() companyId: string;
  @IsString() documentType: string;
  @IsOptional() @IsString() prefix?: string;
  @IsOptional() @IsNumber() startNumber?: number;
  @IsOptional() @IsNumber() nextNumber?: number;
  @IsOptional() @IsNumber() padLength?: number;
  @IsOptional() @IsString() suffix?: string;
  @IsOptional() @IsEnum(NumberingResetPeriod) resetPeriod?: NumberingResetPeriod;
}
export class UpdateNumberingSeriesDto extends PartialType(CreateNumberingSeriesDto) {}

export class CreateCatalogItemDto {
  @IsString() code: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsUUID() parentId?: string;
}
export class UpdateCatalogItemDto extends PartialType(CreateCatalogItemDto) {}

export class CreateBrandDto {
  @IsString() code: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsUUID() categoryId: string;
}
export class UpdateBrandDto extends PartialType(CreateBrandDto) {}

export class CreatePackageTypeDto {
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() notes?: string;
  @IsUUID() categoryId: string;
}
export class UpdatePackageTypeDto extends PartialType(CreatePackageTypeDto) {}

export class CreateUnitDto {
  @IsString() code: string;
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsUUID() categoryId: string;
}
export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

export class CreateExpenseCategoryDto {
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateExpenseCategoryDto extends PartialType(CreateExpenseCategoryDto) {}

export class CreatePartnerDto {
  @IsString() name: string;
  @IsNumber() @Min(0) @Max(100) sharePercentage: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}
