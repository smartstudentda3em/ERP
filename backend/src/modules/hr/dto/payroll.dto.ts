import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CashMovementAccount } from '../../../entities/enums';

export class CreatePayrollRunLineDto {
  @IsUUID() employeeId: string;
  @IsOptional() @IsNumber() @Min(0) absenceDays?: number;
  @IsOptional() @IsNumber() @Min(0) lateHours?: number;
  @IsOptional() @IsNumber() @Min(0) otherDeductions?: number;
}

export class CreatePayrollRunDto {
  @IsInt() @Min(2000) year: number;
  @IsInt() @Min(1) @Max(12) month: number;
  @IsOptional() @IsString() notes?: string;
  /** Required for every company (enforced in PayrollService.create(), not here, matching this
   * codebase's convention of service-layer business validation) — the cash/bank account net
   * salaries are disbursed from. */
  @IsOptional() @IsEnum(CashMovementAccount) paymentAccount?: CashMovementAccount;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePayrollRunLineDto)
  lines: CreatePayrollRunLineDto[];
}

export class UpdatePayrollRunLineDto {
  @IsUUID() employeeId: string;
  @IsOptional() @IsNumber() @Min(0) absenceDays?: number;
  @IsOptional() @IsNumber() @Min(0) lateHours?: number;
  @IsOptional() @IsNumber() @Min(0) otherDeductions?: number;
}

export class UpdatePayrollRunDto {
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePayrollRunLineDto)
  lines: UpdatePayrollRunLineDto[];
}
