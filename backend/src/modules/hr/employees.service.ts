import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { PayrollRun, PayrollRunLine } from './entities/payroll-run.entity';
import { EmployeeLeave } from './entities/employee-leave.entity';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { CreateEmployeeLeaveDto } from './dto/employee-leave.dto';
import { SalesRepresentative } from '../parties/entities/sales-representative.entity';
import { CommissionException } from '../parties/entities/commission-exception.entity';
import { RepFixedItemCommission } from '../parties/entities/rep-fixed-item-commission.entity';
import { Company } from '../settings/entities/company.entity';
import { SalesRepAccessService } from '../../common/services/sales-rep-access.service';

/** Air Conditioning — mirrors sales-representatives.controller.ts's own AIR_CONDITIONING_COMPANY_CODE. */
const AIR_CONDITIONING_COMPANY_CODE = 'AC';

/** = (end - start) inclusive, for 'YYYY-MM-DD' date strings — how many calendar days a leave record spans. */
function daysBetweenInclusive(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86400000) + 1;
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
    @InjectRepository(PayrollRun) private readonly payrollRunRepo: Repository<PayrollRun>,
    @InjectRepository(PayrollRunLine) private readonly payrollLineRepo: Repository<PayrollRunLine>,
    @InjectRepository(EmployeeLeave) private readonly leaveRepo: Repository<EmployeeLeave>,
    @InjectRepository(SalesRepresentative) private readonly salesRepresentativeRepo: Repository<SalesRepresentative>,
    @InjectRepository(CommissionException) private readonly commissionExceptionsRepo: Repository<CommissionException>,
    @InjectRepository(RepFixedItemCommission) private readonly fixedItemCommissionsRepo: Repository<RepFixedItemCommission>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly salesRepAccess: SalesRepAccessService,
  ) {}

  /** `search` matches name OR jobTitle (case-insensitive substring); `branchId` narrows to one
   * branch — both power the "بحث بالاسم أو المسمى الوظيفي" + branch-filter header on the
   * Employees screen. */
  findAll(companyId: string, search?: string, branchId?: string) {
    const where = branchId ? { companyId, branchId } : { companyId };
    if (!search) {
      return this.repo.find({ where, relations: ['branch'], order: { createdAt: 'DESC' } });
    }
    return this.repo.find({
      where: [
        { ...where, name: ILike(`%${search}%`) },
        { ...where, jobTitle: ILike(`%${search}%`) },
      ],
      relations: ['branch'],
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: string, companyId: string) {
    return this.repo.findOne({ where: { id, companyId }, relations: ['branch'] });
  }

  create(dto: CreateEmployeeDto, companyId: string): Promise<Employee> {
    const employee = this.repo.create({
      companyId,
      name: dto.name,
      jobTitle: dto.jobTitle,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      branchId: dto.branchId,
      baseSalary: dto.baseSalary,
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(employee);
  }

  /** name/phone/email/branch/isActive on a رep-linked row (salesRepresentativeId set) are owned by
   * "المناديب" — SalesRepresentativesService.syncEmployeeForRep() keeps them in sync one-way from
   * there, and any edit made here would just be overwritten on the rep's next save. Only jobTitle
   * (customizable after the auto-set default) and baseSalary (never touched by that sync) are ever
   * HR-editable for such a row; every field stays editable for a manually-added employee. */
  async update(id: string, dto: UpdateEmployeeDto, companyId: string): Promise<Employee> {
    const employee = await this.repo.findOne({ where: { id, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const isRepLinked = !!employee.salesRepresentativeId;

    if (!isRepLinked) {
      if (dto.name !== undefined) employee.name = dto.name;
      if (dto.phone !== undefined) employee.phone = dto.phone;
      if (dto.email !== undefined) employee.email = dto.email;
      if (dto.branchId !== undefined) employee.branchId = dto.branchId;
      if (dto.isActive !== undefined) employee.isActive = dto.isActive;
    }
    if (dto.jobTitle !== undefined) employee.jobTitle = dto.jobTitle;
    if (dto.baseSalary !== undefined) employee.baseSalary = dto.baseSalary;

    return this.repo.save(employee);
  }

  /** Employees already referenced by a payroll line (any month) can't be hard-deleted — that
   * history has to stay intact for the Expense/Profit reports it already fed. Deactivating
   * (isActive: false) is the way to retire an employee from future payroll runs instead. */
  async remove(id: string, companyId: string): Promise<void> {
    const employee = await this.repo.findOne({ where: { id, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const hasPayrollHistory = await this.payrollLineRepo.exist({ where: { employeeId: id } });
    if (hasPayrollHistory) {
      throw new BadRequestException('Cannot delete an employee with payroll history — deactivate instead');
    }

    await this.repo.remove(employee);
  }

  /** Mirrors SalesRepresentativesService's private resolveLineRate() so the commission figure shown
   * here (the "العمولة" column of an employee's monthly salary breakdown) can never diverge from the
   * branch-manager commission reports/dashboard: a line's rate is its product-specific exception,
   * else its category's exception, else the manager's own general commissionRate. Duplicated rather
   * than imported since HrModule can't depend on PartiesModule (PartiesModule already depends on
   * HrModule — importing the other way would be circular). */
  private resolveLineRate(
    line: { productId: string; categoryId: string | null },
    exceptions: { byProductId: Map<string, number>; byCategoryId: Map<string, number> } | undefined,
    generalRate: number,
  ): number {
    return (
      exceptions?.byProductId.get(line.productId) ??
      (line.categoryId ? exceptions?.byCategoryId.get(line.categoryId) : undefined) ??
      generalRate
    );
  }

  /**
   * Per-month commission earned by this employee over [periodStart, periodEnd], keyed by month
   * number — zero for every month when the employee isn't linked to a branch manager (no
   * SalesRepresentative row with a matching userId), which is the common case for non-manager
   * employees. Same exception-aware per-line rate resolution as the branch-manager commission
   * report/dashboard, just bucketed by the invoice's month instead of summed across the whole range.
   */
  private async getMonthlyCommissions(
    employee: Employee,
    companyId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Map<number, number>> {
    const commissionByMonth = new Map<number, number>();
    if (!employee.userId) return commissionByMonth;

    const rep = await this.salesRepresentativeRepo.findOne({ where: { userId: employee.userId, companyId } });
    if (!rep) return commissionByMonth;

    // AC only: a مندوب's commission is a fixed amount per item on invoices they assisted with
    // (assistingSalesRepresentativeId), never a percentage of their branch's whole sales — see
    // sales-representatives.controller.ts's buildManagerDashboardForRep() for the identical split,
    // which this mirrors so the two screens can never disagree.
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (company?.code === AIR_CONDITIONING_COMPANY_CODE && (await this.salesRepAccess.isSalesAgentRep(rep.id))) {
      return this.getMonthlyFixedCommissions(rep.id, companyId, periodStart, periodEnd);
    }

    if (!rep.branchId) return commissionByMonth;

    const generalRate = Number(rep.commissionRate ?? 0);
    const lineRows = await this.dataSource
      .createQueryBuilder()
      .select('i."invoiceDate"', 'invoiceDate')
      .addSelect('l."lineTotal"', 'lineTotal')
      .addSelect('l."productId"', 'productId')
      .addSelect('p."categoryId"', 'categoryId')
      .from('sales_invoice_lines', 'l')
      .innerJoin('sales_invoices', 'i', 'i.id = l."invoiceId"')
      .innerJoin('products', 'p', 'p.id = l."productId"')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."branchId" = :branchId', { branchId: rep.branchId })
      .andWhere('i."invoiceDate" >= :periodStart AND i."invoiceDate" <= :periodEnd', { periodStart, periodEnd })
      .getRawMany();

    const exceptionRows = await this.commissionExceptionsRepo.find({
      where: { companyId, salesRepresentativeId: rep.id },
    });
    const exceptions = { byProductId: new Map<string, number>(), byCategoryId: new Map<string, number>() };
    for (const e of exceptionRows) {
      if (e.productId) exceptions.byProductId.set(e.productId, Number(e.commissionRate));
      else if (e.categoryId) exceptions.byCategoryId.set(e.categoryId, Number(e.commissionRate));
    }

    for (const line of lineRows) {
      const rate = this.resolveLineRate(line, exceptions, generalRate);
      if (rate <= 0) continue;
      const month = Number(String(line.invoiceDate).slice(5, 7));
      const commission = (Number(line.lineTotal) * rate) / 100;
      commissionByMonth.set(month, (commissionByMonth.get(month) ?? 0) + commission);
    }

    return commissionByMonth;
  }

  /** AC only — the fixed-per-item counterpart to getMonthlyCommissions() above, for a مندوب who
   * assisted sales (SalesInvoice.assistingSalesRepresentativeId) rather than owning a branch. */
  private async getMonthlyFixedCommissions(
    repId: string,
    companyId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Map<number, number>> {
    const commissionByMonth = new Map<number, number>();

    const lineRows = await this.dataSource
      .createQueryBuilder()
      .select('i."invoiceDate"', 'invoiceDate')
      .addSelect('l."quantity"', 'quantity')
      .addSelect('l."productId"', 'productId')
      .from('sales_invoice_lines', 'l')
      .innerJoin('sales_invoices', 'i', 'i.id = l."invoiceId"')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."assistingSalesRepresentativeId" = :repId', { repId })
      .andWhere('i."invoiceDate" >= :periodStart AND i."invoiceDate" <= :periodEnd', { periodStart, periodEnd })
      .getRawMany();

    const fixedRows = await this.fixedItemCommissionsRepo.find({ where: { companyId, salesRepresentativeId: repId } });
    const fixedAmountByProductId = new Map(fixedRows.map((r) => [r.productId, Number(r.amount)]));

    for (const line of lineRows) {
      const unitAmount = fixedAmountByProductId.get(line.productId);
      if (!unitAmount) continue;
      const month = Number(String(line.invoiceDate).slice(5, 7));
      const commission = unitAmount * Number(line.quantity);
      commissionByMonth.set(month, (commissionByMonth.get(month) ?? 0) + commission);
    }

    return commissionByMonth;
  }

  /**
   * Powers the employee detail panel's "بحث بالسنة/الشهر" — always returns a `salary.monthly`
   * array (1 entry when `month` is given, all 12 for the whole year) plus `totals` summed across
   * whatever months are in that array, so the frontend renders the same shape either way and just
   * decides how many rows to draw. `leaves` is every EmployeeLeave record overlapping the
   * requested period, month-scoped or year-scoped the same way.
   */
  async getHistory(employeeId: string, companyId: string, year: number, month?: number) {
    const employee = await this.repo.findOne({ where: { id: employeeId, companyId }, relations: ['branch'] });
    if (!employee) throw new NotFoundException('Employee not found');

    const months = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
    const runs = await this.payrollRunRepo.find({
      where: month ? { companyId, year, month } : { companyId, year },
      relations: ['lines'],
    });

    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    const periodStart = `${year}-${String(firstMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(year, lastMonth, 0).getDate();
    const periodEnd = `${year}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Commission is only meaningful for months an actual payroll run exists for — it's added on
    // top of that run's stored deduction figures below, never shown standalone for a month with no
    // payroll run yet.
    const commissionByMonth = await this.getMonthlyCommissions(employee, companyId, periodStart, periodEnd);

    const monthly = months.map((m) => {
      const run = runs.find((r) => r.month === m);
      const line = run?.lines.find((l) => l.employeeId === employeeId);
      if (!run || !line) {
        return {
          month: m,
          hasPayrollRun: false,
          baseSalary: 0,
          absenceDays: 0,
          lateHours: 0,
          absenceDeduction: 0,
          lateDeduction: 0,
          otherDeductions: 0,
          commission: 0,
          netSalary: 0,
          status: null as string | null,
        };
      }
      const commission = commissionByMonth.get(m) ?? 0;
      const baseSalary = Number(line.baseSalary);
      const absenceDeduction = Number(line.absenceDeduction);
      const lateDeduction = Number(line.lateDeduction);
      const otherDeductions = Number(line.otherDeductions);
      return {
        month: m,
        hasPayrollRun: true,
        baseSalary,
        absenceDays: Number(line.absenceDays),
        lateHours: Number(line.lateHours),
        absenceDeduction,
        lateDeduction,
        otherDeductions,
        commission,
        // Adds the manager's earned commission on top of the stored PayrollRunLine figure — this is
        // a display-only recomputation for this panel, the officially posted payroll netSalary
        // (what feeds the الرواتب expense total) is untouched.
        netSalary: Math.max(0, baseSalary - absenceDeduction - lateDeduction - otherDeductions) + commission,
        status: run.status as string,
      };
    });

    const totals = monthly.reduce(
      (acc, m) => ({
        baseSalary: acc.baseSalary + m.baseSalary,
        absenceDays: acc.absenceDays + m.absenceDays,
        lateHours: acc.lateHours + m.lateHours,
        absenceDeduction: acc.absenceDeduction + m.absenceDeduction,
        lateDeduction: acc.lateDeduction + m.lateDeduction,
        otherDeductions: acc.otherDeductions + m.otherDeductions,
        commission: acc.commission + m.commission,
        netSalary: acc.netSalary + m.netSalary,
      }),
      {
        baseSalary: 0,
        absenceDays: 0,
        lateHours: 0,
        absenceDeduction: 0,
        lateDeduction: 0,
        otherDeductions: 0,
        commission: 0,
        netSalary: 0,
      },
    );

    const allLeaves = await this.leaveRepo.find({ where: { employeeId, companyId }, order: { startDate: 'DESC' } });
    const overlapping = allLeaves.filter((l) => l.startDate <= periodEnd && l.endDate >= periodStart);
    const leaveRecords = overlapping.map((l) => ({
      id: l.id,
      startDate: l.startDate,
      endDate: l.endDate,
      type: l.type,
      notes: l.notes,
      days: daysBetweenInclusive(l.startDate, l.endDate),
    }));

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        jobTitle: employee.jobTitle,
        branchName: employee.branch?.nameAr ?? employee.branch?.nameEn ?? null,
        baseSalary: Number(employee.baseSalary),
        isActive: employee.isActive,
      },
      year,
      month: month ?? null,
      salary: { monthly, totals },
      leaves: { records: leaveRecords, totalDays: leaveRecords.reduce((s, r) => s + r.days, 0) },
    };
  }

  async createLeave(employeeId: string, dto: CreateEmployeeLeaveDto, companyId: string, createdById: string): Promise<EmployeeLeave> {
    const employee = await this.repo.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (dto.endDate < dto.startDate) throw new BadRequestException('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');

    const leave = this.leaveRepo.create({
      companyId,
      employeeId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      type: dto.type,
      notes: dto.notes ?? null,
      createdById,
    });
    return this.leaveRepo.save(leave);
  }

  async removeLeave(employeeId: string, leaveId: string, companyId: string): Promise<void> {
    const leave = await this.leaveRepo.findOne({ where: { id: leaveId, employeeId, companyId } });
    if (!leave) throw new NotFoundException('Leave record not found');
    await this.leaveRepo.remove(leave);
  }
}
