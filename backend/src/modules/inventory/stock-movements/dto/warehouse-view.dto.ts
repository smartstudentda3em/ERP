import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class WarehouseProductsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsIn(['in', 'out', 'low']) status?: 'in' | 'out' | 'low';
}
