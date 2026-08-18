import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BaseCrudService } from '../../common/services/base-crud.service';
import { Company } from './entities/company.entity';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/settings.dto';

@Injectable()
export class CompaniesService extends BaseCrudService<Company> {
  constructor(@InjectRepository(Company) repo: Repository<Company>) {
    super(repo);
  }

  /**
   * Scoped to the caller's own accessible companies — a true Administrator (`allCompanies`) sees
   * every company; anyone else (e.g. Manager, who is deliberately granted full settings.company.*
   * management of their own tenant, see run-seed.ts) only sees the ones in their own `companyIds`.
   * Previously this had no scoping at all: any role holding settings.company.view/edit/delete could
   * list, edit, or delete *any other* tenant's Company row — and Branch/UserCompany both CASCADE on
   * Company, so deleting one destroyed that tenant's branches and user-access links too.
   */
  findAllScoped(user: AuthenticatedUser): Promise<Company[]> {
    if (user.allCompanies) return this.findAll();
    return this.repo.find({ where: { id: In(user.companyIds) }, order: { createdAt: 'ASC' } as any });
  }

  private assertAccessible(user: AuthenticatedUser, id: string): void {
    // 404, not 403 — an id belonging to another tenant should be indistinguishable from an id that
    // doesn't exist at all, same convention used by every other *Scoped lookup in this codebase.
    if (!user.allCompanies && !user.companyIds.includes(id)) {
      throw new NotFoundException('Company not found');
    }
  }

  findOneScoped(user: AuthenticatedUser, id: string): Promise<Company> {
    this.assertAccessible(user, id);
    return this.findOne(id);
  }

  /** Creating a brand-new tenant is Administrator-only regardless of any per-tenant
   * settings.company.create grant — a company that doesn't exist yet can't be in anyone's
   * companyIds, so there's no meaningful "scope" to check it against. */
  createAsAdmin(user: AuthenticatedUser, dto: CreateCompanyDto): Promise<Company> {
    if (!user.allCompanies) {
      throw new ForbiddenException('Only the Administrator may create a new company');
    }
    return this.create(dto);
  }

  updateScoped(user: AuthenticatedUser, id: string, dto: UpdateCompanyDto): Promise<Company> {
    this.assertAccessible(user, id);
    return this.update(id, dto);
  }

  removeScoped(user: AuthenticatedUser, id: string): Promise<void> {
    this.assertAccessible(user, id);
    return this.remove(id);
  }
}

@ApiTags('Settings - Companies')
@Controller('settings/companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Get() @Permissions('settings.company.view') findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAllScoped(user);
  }
  @Get(':id') @Permissions('settings.company.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findOneScoped(user, id);
  }
  @Post() @Permissions('settings.company.create') create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createAsAdmin(user, dto);
  }
  @Patch(':id') @Permissions('settings.company.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateScoped(user, id, dto);
  }
  @Delete(':id') @Permissions('settings.company.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removeScoped(user, id);
  }
}
