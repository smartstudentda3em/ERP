import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { SalesLineDto } from '../../dto/sales-line.dto';

export class CreateSalesOrderDto {
  @IsDateString() orderDate: string;
  @IsUUID() customerId: string;
  @IsUUID() warehouseId: string;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() quotationId?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines: SalesLineDto[];
}
