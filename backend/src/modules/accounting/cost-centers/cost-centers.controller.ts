import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { Budget, CostCenter, Project } from './entities/cost-center.entity';

@Injectable()
export class CostCentersService extends BaseCrudService<CostCenter> {
  constructor(@InjectRepository(CostCenter) repo: Repository<CostCenter>) {
    super(repo);
  }
}

@Injectable()
export class ProjectsService extends BaseCrudService<Project> {
  constructor(@InjectRepository(Project) repo: Repository<Project>) {
    super(repo);
  }
}

@Injectable()
export class BudgetsService extends BaseCrudService<Budget> {
  constructor(@InjectRepository(Budget) repo: Repository<Budget>) {
    super(repo);
  }
}

@ApiTags('Accounting - Cost Centers')
@Controller('accounting/cost-centers')
export class CostCentersController {
  constructor(private readonly service: CostCentersService) {}

  @Get() @Permissions('accounting.cost-center.view') findAll() {
    return this.service.findAll();
  }
  @Post() @Permissions('accounting.cost-center.create') create(@Body() dto: Partial<CostCenter>) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('accounting.cost-center.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CostCenter>,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('accounting.cost-center.delete') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('Accounting - Projects')
@Controller('accounting/projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get() @Permissions('accounting.project.view') findAll() {
    return this.service.findAll();
  }
  @Post() @Permissions('accounting.project.create') create(@Body() dto: Partial<Project>) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('accounting.project.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<Project>,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('accounting.project.delete') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('Accounting - Budgets')
@Controller('accounting/budgets')
export class BudgetsController {
  constructor(private readonly service: BudgetsService) {}

  @Get() @Permissions('accounting.budget.view') findAll() {
    return this.service.findAll();
  }
  @Post() @Permissions('accounting.budget.create') create(@Body() dto: Partial<Budget>) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('accounting.budget.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<Budget>,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('accounting.budget.delete') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
