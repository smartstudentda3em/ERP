import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@ApiTags('Suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  @Permissions('suppliers.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }

  @Get(':id')
  @Permissions('suppliers.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOneScoped(id, companyId);
  }

  @Post()
  @Permissions('suppliers.create')
  create(@Body() dto: CreateSupplierDto, @CurrentUser('companyId') companyId: string) {
    return this.service.createForCompany(dto, companyId);
  }

  @Patch(':id')
  @Permissions('suppliers.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateScoped(id, companyId, dto);
  }

  @Delete(':id')
  @Permissions('suppliers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.removeScoped(id, companyId);
  }
}
