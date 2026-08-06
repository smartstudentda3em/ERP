import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { Warehouse } from './entities/warehouse.entity';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/settings.dto';

@Injectable()
export class WarehousesService extends CompanyScopedCrudService<Warehouse> {
  constructor(@InjectRepository(Warehouse) repo: Repository<Warehouse>) {
    super(repo);
  }

  search(companyId: string, search?: string) {
    if (!search) return this.findAllForCompany(companyId);
    return this.repo.find({
      where: [
        { companyId, code: ILike(`%${search}%`) },
        { companyId, nameEn: ILike(`%${search}%`) },
        { companyId, nameAr: ILike(`%${search}%`) },
      ],
      order: { createdAt: 'ASC' } as any,
    });
  }
}

@ApiTags('Settings - Warehouses')
@Controller('settings/warehouses')
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Get() @Permissions('settings.warehouse.view') findAll(
    @Query('search') search: string | undefined,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.search(companyId, search);
  }
  @Get(':id') @Permissions('settings.warehouse.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('settings.warehouse.create') create(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.warehouse.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.warehouse.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
