import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { CashMovementAccount } from '../../../entities/enums';

export class CreateRecurringExpenseDto {
  @IsUUID() companyId: string;
  @IsString() category: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(CashMovementAccount) account: CashMovementAccount;
  @IsOptional() @IsString() description?: string;
}

export class UpdateRecurringExpenseDto extends PartialType(CreateRecurringExpenseDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
