import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { CashMovementAccount, ShipmentPaymentType } from '../../../entities/enums';

export class CreateShipmentPaymentDto {
  @IsDateString() paymentDate: string;
  @IsUUID() shipmentId: string;
  @IsEnum(ShipmentPaymentType) paymentType: ShipmentPaymentType;
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(CashMovementAccount) account: CashMovementAccount;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateShipmentPaymentDto {
  @IsDateString() paymentDate: string;
  @IsUUID() shipmentId: string;
  @IsEnum(ShipmentPaymentType) paymentType: ShipmentPaymentType;
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(CashMovementAccount) account: CashMovementAccount;
  @IsOptional() @IsString() notes?: string;
}
