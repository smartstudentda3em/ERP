import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ImportCargoStatus } from '../../../entities/enums';

export class CreateImportCargoItemDto {
  @IsUUID() companyId: string;
  @IsUUID() productId: string;
  @IsUUID() supplierId: string;
  @IsUUID() shipmentId: string;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  // Multiplier into the local/base currency — optional; the service defaults it to 1 when omitted.
  @IsOptional() @IsNumber() @Min(0) conversionRate?: number;
  // Which currency the converted price is expressed in — a user choice, trusted from the client.
  @IsOptional() @IsUUID() localCurrencyId?: string;
  @IsOptional() @IsString() specifications?: string;
  // orderDate/status/notes are no longer collected from the add form — the service defaults them.
  @IsOptional() @IsDateString() orderDate?: string;
  @IsOptional() @IsEnum(ImportCargoStatus) status?: ImportCargoStatus;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateImportCargoItemDto {
  @IsUUID() productId: string;
  @IsUUID() supplierId: string;
  @IsUUID() shipmentId: string;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) conversionRate?: number;
  @IsOptional() @IsUUID() localCurrencyId?: string;
  @IsOptional() @IsString() specifications?: string;
  // No longer collected from the edit form — omitted means "leave the existing value untouched".
  @IsOptional() @IsDateString() orderDate?: string;
  @IsOptional() @IsEnum(ImportCargoStatus) status?: ImportCargoStatus;
  @IsOptional() @IsString() notes?: string;
}
