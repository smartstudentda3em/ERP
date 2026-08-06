import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateShipmentExpenseDto {
  @IsUUID() shippingExpenseTypeId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() description?: string;
}

export class UpdateShipmentExpenseDto {
  @IsUUID() shippingExpenseTypeId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() description?: string;
}
