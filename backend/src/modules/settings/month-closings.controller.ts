import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { Company } from './entities/company.entity';
import { MonthClosing } from './entities/month-closing.entity';

const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

/**
 * Tables whose rows are dated, and the column that dates them. A row dated inside a closed month
 * can't be inserted, updated or deleted — see the erp_assert_month_open() trigger below.
 * 'year_month' is payroll_runs' own (year, month) pair instead of a date column.
 */
const LOCKED_TABLES: { table: string; dateColumn: string }[] = [
  { table: 'sales_invoices', dateColumn: 'invoiceDate' },
  { table: 'sales_payments', dateColumn: 'paymentDate' },
  { table: 'sales_returns', dateColumn: 'returnDate' },
  { table: 'purchase_receipts', dateColumn: 'receiptDate' },
  { table: 'supplier_payments', dateColumn: 'paymentDate' },
  { table: 'cash_movements', dateColumn: 'movementDate' },
  { table: 'payroll_runs', dateColumn: 'year_month' },
  { table: 'stock_adjustments', dateColumn: 'adjustmentDate' },
  { table: 'stock_transfers', dateColumn: 'transferDate' },
  { table: 'stock_audits', dateColumn: 'auditDate' },
];

/**
 * Installs the month-closing guard on every boot (idempotent). It lives in the database rather than
 * in each service so that no write path — current or future, ORM save/update/delete or raw query —
 * can slip past it. The one exemption: a later payment legitimately bumps amountPaid/status on an
 * invoice that sits in a closed month, so a sales_invoices UPDATE touching only those columns (and
 * not cancelling) is let through.
 */
@Injectable()
export class MonthClosingsBootstrap implements OnModuleInit {
  private readonly logger = new Logger(MonthClosingsBootstrap.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE OR REPLACE FUNCTION erp_month_is_closed(cid uuid, d date) RETURNS boolean AS $fn$
          SELECT EXISTS (
            SELECT 1 FROM month_closings
            WHERE "companyId" = cid AND "isClosed" AND "deletedAt" IS NULL
              AND year = EXTRACT(YEAR FROM d)::int AND month = EXTRACT(MONTH FROM d)::int
          )
        $fn$ LANGUAGE sql STABLE;
      `);
      await this.dataSource.query(`
        CREATE OR REPLACE FUNCTION erp_assert_month_open() RETURNS trigger AS $fn$
        DECLARE
          col text := TG_ARGV[0];
          newj jsonb;
          oldj jsonb;
          d date;
        BEGIN
          IF TG_OP IN ('INSERT', 'UPDATE') THEN newj := to_jsonb(NEW); END IF;
          IF TG_OP IN ('UPDATE', 'DELETE') THEN oldj := to_jsonb(OLD); END IF;

          IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'sales_invoices'
             AND (newj - 'amountPaid' - 'status' - 'updatedAt') = (oldj - 'amountPaid' - 'status' - 'updatedAt')
             AND newj->>'status' <> 'CANCELLED' AND oldj->>'status' <> 'CANCELLED' THEN
            RETURN NEW;
          END IF;

          IF newj IS NOT NULL THEN
            IF col = 'year_month' THEN d := make_date((newj->>'year')::int, (newj->>'month')::int, 1);
            ELSE d := (newj->>col)::date; END IF;
            IF d IS NOT NULL AND erp_month_is_closed((newj->>'companyId')::uuid, d) THEN
              RAISE EXCEPTION 'MONTH_CLOSED:%', to_char(d, 'YYYY-MM') USING ERRCODE = 'P0001';
            END IF;
          END IF;
          IF oldj IS NOT NULL THEN
            IF col = 'year_month' THEN d := make_date((oldj->>'year')::int, (oldj->>'month')::int, 1);
            ELSE d := (oldj->>col)::date; END IF;
            IF d IS NOT NULL AND erp_month_is_closed((oldj->>'companyId')::uuid, d) THEN
              RAISE EXCEPTION 'MONTH_CLOSED:%', to_char(d, 'YYYY-MM') USING ERRCODE = 'P0001';
            END IF;
          END IF;

          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END
        $fn$ LANGUAGE plpgsql;
      `);
      for (const { table, dateColumn } of LOCKED_TABLES) {
        await this.dataSource.query(`DROP TRIGGER IF EXISTS erp_month_lock ON "${table}"`);
        await this.dataSource.query(
          `CREATE TRIGGER erp_month_lock BEFORE INSERT OR UPDATE OR DELETE ON "${table}"
           FOR EACH ROW EXECUTE FUNCTION erp_assert_month_open('${dateColumn}')`,
        );
      }
    } catch (err) {
      // Never take the whole app down over this — but make it impossible to miss in the logs.
      this.logger.error(`MONTH-CLOSING GUARD NOT INSTALLED: ${(err as Error).message}`);
    }
  }
}

@Injectable()
export class MonthClosingsService {
  constructor(
    @InjectRepository(MonthClosing) private readonly repo: Repository<MonthClosing>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /** The 12 months of `year`, each with its closed/open state and who last closed/reopened it. */
  async listYear(companyId: string, year: number) {
    const rows = await this.repo.find({ where: { companyId, year } });
    const userIds = [...new Set(rows.flatMap((r) => [r.closedById, r.reopenedById]).filter((x): x is string => !!x))];
    const users = userIds.length ? await this.userRepo.find({ where: { id: In(userIds) } }) : [];
    const nameOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.fullName ?? null : null);
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const r = rows.find((x) => x.month === month);
      return {
        year,
        month,
        isClosed: r?.isClosed ?? false,
        closedAt: r?.closedAt ?? null,
        closedByName: nameOf(r?.closedById ?? null),
        reopenedAt: r?.reopenedAt ?? null,
        reopenedByName: nameOf(r?.reopenedById ?? null),
      };
    });
  }

  /** Only the real Administrator role (re-read from the DB, never trusted from the token), and only
   * for the Printing Press. */
  private async assertAllowed(user: AuthenticatedUser) {
    const company = await this.companyRepo.findOne({ where: { id: user.companyId! } });
    if (company?.code !== PRINTING_PRESS_COMPANY_CODE) {
      throw new BadRequestException('قفل الشهور متاح للمطبعة فقط');
    }
    const dbUser = await this.userRepo.findOne({ where: { id: user.userId }, relations: ['roles'] });
    if (!dbUser?.roles?.some((r) => r.isSystemRole)) {
      throw new ForbiddenException('الأدمنستريتور فقط هو المسؤول عن قفل وفتح الشهور');
    }
  }

  private assertValidMonth(year: number, month: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('شهر أو سنة غير صحيحة');
    }
  }

  async close(user: AuthenticatedUser, year: number, month: number) {
    this.assertValidMonth(year, month);
    await this.assertAllowed(user);
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
      throw new BadRequestException('لا يمكن قفل شهر لم يبدأ بعد');
    }
    const companyId = user.companyId!;
    const existing = await this.repo.findOne({ where: { companyId, year, month } });
    if (existing?.isClosed) throw new BadRequestException('هذا الشهر مقفول بالفعل');
    await this.repo.save(
      this.repo.create({
        ...(existing ?? { companyId, year, month }),
        isClosed: true,
        closedById: user.userId,
        closedAt: now,
      }),
    );
    return this.listYear(companyId, year);
  }

  async reopen(user: AuthenticatedUser, year: number, month: number) {
    this.assertValidMonth(year, month);
    await this.assertAllowed(user);
    const companyId = user.companyId!;
    const existing = await this.repo.findOne({ where: { companyId, year, month } });
    if (!existing?.isClosed) throw new BadRequestException('هذا الشهر غير مقفول');
    existing.isClosed = false;
    existing.reopenedById = user.userId;
    existing.reopenedAt = new Date();
    await this.repo.save(existing);
    return this.listYear(companyId, year);
  }
}

@ApiTags('Settings - Month Closings')
@Controller('settings/month-closings')
export class MonthClosingsController {
  constructor(private readonly service: MonthClosingsService) {}

  @Get()
  list(@CurrentUser('companyId') companyId: string, @Query('year') year?: string) {
    return this.service.listYear(companyId, Number(year) || new Date().getFullYear());
  }

  @Post(':year/:month/close')
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.service.close(user, year, month);
  }

  @Post(':year/:month/reopen')
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.service.reopen(user, year, month);
  }
}
