import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { CustomerCreditStatus } from '../../../../entities/enums';

export class CreateCustomerDto {
  @IsOptional() @IsString() code?: string;
  @IsString() name: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsString() notes?: string;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() salesRepresentativeId?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() salesRepresentativeId?: string;
  @IsOptional() @IsEnum(CustomerCreditStatus) creditStatus?: CustomerCreditStatus;
  @IsOptional() @IsString() blockedReason?: string | null;
}
