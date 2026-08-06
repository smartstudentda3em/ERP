import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateShipmentDto {
  @IsUUID() companyId: string;
  @IsString() shipmentName: string;
  @IsOptional() @IsDateString() shipmentDate?: string;
  @IsString() shippingCompanyName: string;
}

export class UpdateShipmentDto {
  @IsString() shipmentName: string;
  @IsOptional() @IsDateString() shipmentDate?: string;
  @IsString() shippingCompanyName: string;
}
