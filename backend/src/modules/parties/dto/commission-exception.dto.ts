import { IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateCommissionExceptionDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsNumber() @Min(0) @Max(100) commissionRate: number;
}
