import { IsEmail, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSupplierDto {
  @IsOptional() @IsString() code?: string;
  @IsString() companyName: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() currencyId?: string;
  @IsUUID() companyId: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() currencyId?: string;
}
