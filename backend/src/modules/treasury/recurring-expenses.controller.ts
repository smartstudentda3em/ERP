import { Body, Controller, Get, Injectable, Logger, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RecurringExpense } from './entities/recurring-expense.entity';
import { CreateRecurringExpenseDto, UpdateRecurringExpenseDto } from './dto/recurring-expense.dto';
import { CashMovementsService } from './cash-movements.service';
import { CashMovementSourceType, CashMovementType } from '../../entities/enums';

/** 'YYYY-MM' for the given date, local calendar (not UTC) — matches the rest of the app's date handling. */
function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class RecurringExpensesService {
  private readonly logger = new Logger(RecurringExpensesService.name);

  constructor(
    @InjectRepository(RecurringExpense) private readonly repo: Repository<RecurringExpense>,
    private readonly cashMovementsService: CashMovementsService,
  ) {}

  findAll(companyId: string) {
    return this.repo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
  }

  create(dto: CreateRecurringExpenseDto, createdById: string, companyId: string) {
    // The creation month is already covered by the immediate expense the caller records alongside
    // this template — the cron only ever produces FUTURE occurrences, so it must treat this month
    // as already generated.
    return this.repo.save(
      this.repo.create({ ...dto, companyId, createdById, lastGeneratedPeriod: periodOf(new Date()) }),
    );
  }

  /** Scoped to the caller's company — an id that belongs to another company 404s exactly like an id that doesn't exist at all. */
  async update(id: string, companyId: string, dto: UpdateRecurringExpenseDto): Promise<RecurringExpense> {
    const existing = await this.repo.findOneByOrFail({ id, companyId });
    Object.assign(existing, dto, { companyId });
    return this.repo.save(existing);
  }

  /**
   * Fires at 00:00 on the 1st of every month: every still-active template not yet generated for
   * the current period gets a real CashMovement (EXPENSE, MANUAL) dated the 1st, with the same
   * category/amount/account/description as the original — exactly like the user re-entering it by
   * hand. `lastGeneratedPeriod` makes this idempotent if the job is ever re-triggered mid-month
   * (e.g. a manual re-run, or a missed run caught up later the same month).
   */
  @Cron('0 0 1 * *')
  async generateDueExpenses(): Promise<number> {
    const now = new Date();
    const period = periodOf(now);
    const firstOfMonth = `${period}-01`;

    const templates = await this.repo.find({ where: { isActive: true } });
    let generated = 0;
    for (const template of templates) {
      if (template.lastGeneratedPeriod === period) continue;
      await this.cashMovementsService.record({
        companyId: template.companyId,
        movementDate: firstOfMonth,
        type: CashMovementType.EXPENSE,
        account: template.account,
        amount: Number(template.amount),
        sourceType: CashMovementSourceType.MANUAL,
        category: template.category,
        description: template.description ?? undefined,
        createdById: template.createdById,
      });
      template.lastGeneratedPeriod = period;
      await this.repo.save(template);
      generated++;
    }
    if (generated > 0) {
      this.logger.log(`Generated ${generated} recurring expense(s) for period ${period}.`);
    }
    return generated;
  }
}

@ApiTags('Treasury - Recurring Expenses')
@Controller('treasury/recurring-expenses')
export class RecurringExpensesController {
  constructor(private readonly service: RecurringExpensesService) {}

  @Get()
  @Permissions('treasury.expense.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }

  @Post()
  @Permissions('treasury.expense.create')
  create(@Body() dto: CreateRecurringExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('treasury.expense.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringExpenseDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.update(id, companyId, dto);
  }
}
