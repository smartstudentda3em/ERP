import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateShippingExpenseTypeDto {
  @IsString() nameEn: string;
  @IsOptional() @IsString() nameAr?: string;
}

export class UpdateShippingExpenseTypeDto extends PartialType(CreateShippingExpenseTypeDto) {}
