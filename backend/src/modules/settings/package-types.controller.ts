import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { PackageType } from './entities/package-type.entity';
import { CreatePackageTypeDto, UpdatePackageTypeDto } from './dto/settings.dto';

@Injectable()
export class PackageTypesService extends CompanyScopedCrudService<PackageType> {
  constructor(@InjectRepository(PackageType) repo: Repository<PackageType>) {
    super(repo);
  }

  search(companyId: string, search?: string) {
    if (!search) return this.findAllForCompany(companyId);
    return this.repo.find({
      where: [
        { companyId, nameEn: ILike(`%${search}%`) },
        { companyId, nameAr: ILike(`%${search}%`) },
        { companyId, code: ILike(`%${search}%`) },
      ],
      order: { createdAt: 'ASC' } as any,
    });
  }
}

@ApiTags('Settings - Package Types')
@Controller('settings/package-types')
export class PackageTypesController {
  constructor(private readonly service: PackageTypesService) {}

  @Get() @Permissions('settings.packageType.view') findAll(
    @Query('search') search: string | undefined,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.search(companyId, search);
  }
  @Get(':id') @Permissions('settings.packageType.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('settings.packageType.create') create(
    @Body() dto: CreatePackageTypeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.packageType.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackageTypeDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.packageType.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
