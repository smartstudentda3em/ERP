import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { Branch } from './entities/branch.entity';
import { CreateBranchDto, UpdateBranchDto } from './dto/settings.dto';

@Injectable()
export class BranchesService extends CompanyScopedCrudService<Branch> {
  constructor(@InjectRepository(Branch) repo: Repository<Branch>) {
    super(repo);
  }
}

@ApiTags('Settings - Branches')
@Controller('settings/branches')
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  /** `companyId` query param lets an admin fetch another accessible company's branches while
   * their own active session is elsewhere — needed by the Users & Roles "add user" form's branch
   * picker for a role restricted to one specific company (see Role.restrictedCompanyId), which may
   * not match whatever company the admin currently has active. Only ever honored for a company the
   * caller can actually reach (every company for a true Administrator, else their own companyIds) —
   * never a blind cross-tenant lookup. */
  @Get() @Permissions('settings.branch.view') findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyIdParam?: string,
  ) {
    const companyId =
      companyIdParam && (user.allCompanies || user.companyIds.includes(companyIdParam))
        ? companyIdParam
        : user.companyId!;
    return this.service.findAllForCompany(companyId);
  }
  @Get(':id') @Permissions('settings.branch.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('settings.branch.create') create(
    @Body() dto: CreateBranchDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.branch.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.branch.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
