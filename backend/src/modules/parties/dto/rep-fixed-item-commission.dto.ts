import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateRepFixedItemCommissionDto {
  @IsUUID() productId: string;
  @IsNumber() @Min(0) amount: number;
}
