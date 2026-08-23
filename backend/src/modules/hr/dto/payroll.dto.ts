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

export class ApprovePayrollRunDto {
  /** The account chosen in the approval-confirmation modal — takes precedence over whatever
   * account was picked at creation time, since the actual disbursement source is decided at the
   * moment of approval (liquidity may have changed since the run was drafted). Falls back to the
   * run's own paymentAccount (then CASH) when omitted, for backward compatibility. */
  @IsOptional() @IsEnum(CashMovementAccount) paymentAccount?: CashMovementAccount;
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
