import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { ShippingExpenseType } from './entities/shipping-expense-type.entity';
import { CreateShippingExpenseTypeDto, UpdateShippingExpenseTypeDto } from './dto/shipping-expense-type.dto';

@Injectable()
export class ShippingExpenseTypesService extends CompanyScopedCrudService<ShippingExpenseType> {
  constructor(@InjectRepository(ShippingExpenseType) repo: Repository<ShippingExpenseType>) {
    super(repo);
  }
}

@ApiTags('Imports - Shipping Expense Types')
@Controller('imports/shipping-expense-types')
export class ShippingExpenseTypesController {
  constructor(private readonly service: ShippingExpenseTypesService) {}

  @Get() @Permissions('imports.shippingExpenseType.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Post() @Permissions('imports.shippingExpenseType.create') create(
    @Body() dto: CreateShippingExpenseTypeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('imports.shippingExpenseType.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShippingExpenseTypeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('imports.shippingExpenseType.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
