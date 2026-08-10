import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class WarehouseProductsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsIn(['in', 'out', 'low']) status?: 'in' | 'out' | 'low';
  // Drives "الكمية المستهلكة" (consumedQuantity) below — the date range shown in the page's own
  // top filter. Both optional and independent (either may be sent alone); WarehouseViewService
  // defaults whichever is missing to the current calendar month.
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
