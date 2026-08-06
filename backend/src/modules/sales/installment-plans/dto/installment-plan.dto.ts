import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { InstallmentInterestType, PaymentMethod } from '../../../../entities/enums';

export class InstallmentPlanLineDto {
  @IsUUID() productId: string;
  @IsNumber() @IsPositive() quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
}

export class CreateInstallmentPlanDto {
  @IsUUID() customerId: string;
  @IsUUID() warehouseId: string;
  @IsDateString() purchaseDate: string;
  @IsNumber() @Min(0) downPayment: number;
  @IsEnum(InstallmentInterestType) interestType: InstallmentInterestType;
  @IsNumber() @Min(0) interestRate: number;
  @IsInt() @IsPositive() tenureMonths: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InstallmentPlanLineDto)
  lines: InstallmentPlanLineDto[];
}

export class RecordInstallmentPaymentDto {
  @IsNumber() @IsPositive() amount: number;
  @IsDateString() paymentDate: string;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() notes?: string;
}

export class EarlySettleInstallmentPlanDto {
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) discountPercent?: number;
  @IsDateString() settlementDate: string;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() notes?: string;
}
