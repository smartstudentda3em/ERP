import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateEmployeeDto {
  @IsString() name: string;
  @IsString() jobTitle: string;
  @IsUUID() branchId: string;
  @IsNumber() @Min(0) baseSalary: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsNumber() @Min(0) baseSalary?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
