import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { CashMovementAccount, ShipmentPaymentType } from '../../../entities/enums';

// A shipment payment is a purely statistical record of the shipment's cost — amount, shipment,
// date, and type are all that matter for that; `account` is deliberately not collected at all
// (see ShipmentPayment entity's doc comment), so it's optional here only to accept `undefined`
// without failing validation, never required from the client.
export class CreateShipmentPaymentDto {
  @IsDateString() paymentDate: string;
  @IsUUID() shipmentId: string;
  @IsEnum(ShipmentPaymentType) paymentType: ShipmentPaymentType;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsEnum(CashMovementAccount) account?: CashMovementAccount;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateShipmentPaymentDto {
  @IsDateString() paymentDate: string;
  @IsUUID() shipmentId: string;
  @IsEnum(ShipmentPaymentType) paymentType: ShipmentPaymentType;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsEnum(CashMovementAccount) account?: CashMovementAccount;
  @IsOptional() @IsString() notes?: string;
}
