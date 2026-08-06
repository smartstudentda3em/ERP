import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { ExpenseCategory } from './entities/expense-category.entity';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto/settings.dto';

@Injectable()
export class ExpenseCategoriesService extends CompanyScopedCrudService<ExpenseCategory> {
  constructor(@InjectRepository(ExpenseCategory) repo: Repository<ExpenseCategory>) {
    super(repo);
  }
}

@ApiTags('Settings - Expense Categories')
@Controller('settings/expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly service: ExpenseCategoriesService) {}

  @Get() @Permissions('settings.expenseCategory.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Post() @Permissions('settings.expenseCategory.create') create(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.expenseCategory.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.expenseCategory.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
