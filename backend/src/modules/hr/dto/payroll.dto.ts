import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

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
