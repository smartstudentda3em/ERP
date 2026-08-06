import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ImportCargoItemsService } from './import-cargo-items.service';
import { CreateImportCargoItemDto, UpdateImportCargoItemDto } from './dto/import-cargo-item.dto';

@ApiTags('Imports - Cargo Items')
@Controller('imports/cargo-items')
export class ImportCargoItemsController {
  constructor(private readonly service: ImportCargoItemsService) {}

  @Get()
  @Permissions('imports.cargo.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }

  @Post()
  @Permissions('imports.cargo.create')
  create(@Body() dto: CreateImportCargoItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('imports.cargo.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImportCargoItemDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.update(id, companyId, dto);
  }

  @Delete(':id')
  @Permissions('imports.cargo.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}
