import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { BaseCrudService } from '../../common/services/base-crud.service';
import { CashBox, BankAccount } from './entities/treasury.entity';

/** Treasury is scaffolded in this pass: cash box / bank account master data only — see docs/ROADMAP.md. */

@Injectable()
export class CashBoxesService extends BaseCrudService<CashBox> {
  constructor(@InjectRepository(CashBox) repo: Repository<CashBox>) {
    super(repo);
  }
}

@Injectable()
export class BankAccountsService extends BaseCrudService<BankAccount> {
  constructor(@InjectRepository(BankAccount) repo: Repository<BankAccount>) {
    super(repo);
  }
}

@ApiTags('Treasury - Cash Boxes (scaffold)')
@Controller('treasury/cash-boxes')
export class CashBoxesController {
  constructor(private readonly service: CashBoxesService) {}
  @Get() @Permissions('treasury.cash-box.view') findAll() {
    return this.service.findAll();
  }
  @Post() @Permissions('treasury.cash-box.create') create(@Body() dto: Partial<CashBox>) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('treasury.cash-box.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CashBox>,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('treasury.cash-box.delete') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('Treasury - Bank Accounts (scaffold)')
@Controller('treasury/bank-accounts')
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}
  @Get() @Permissions('treasury.bank-account.view') findAll() {
    return this.service.findAll();
  }
  @Post() @Permissions('treasury.bank-account.create') create(@Body() dto: Partial<BankAccount>) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('treasury.bank-account.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<BankAccount>,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('treasury.bank-account.delete') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
