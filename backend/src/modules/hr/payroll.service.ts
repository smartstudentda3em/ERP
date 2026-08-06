import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PayrollRun, PayrollRunLine } from './entities/payroll-run.entity';
import { Employee } from './entities/employee.entity';
import { CreatePayrollRunDto, UpdatePayrollRunDto } from './dto/payroll.dto';
import { CashMovementsService } from '../treasury/cash-movements.service';
import { NumberingSeriesService } from '../settings/numbering-series.controller';
import { CashMovementAccount, CashMovementSourceType, CashMovementType, DocumentStatus } from '../../entities/enums';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(PayrollRun) private readonly repo: Repository<PayrollRun>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cashMovementsService: CashMovementsService,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {}

  findAll(companyId: string) {
    return this.repo.find({
      where: { companyId },
      relations: ['lines', 'lines.employee', 'lines.branch'],
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  findOne(id: string, companyId: string) {
    return this.repo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.employee', 'lines.branch'],
    });
  }

  /**
   * Snapshots each line's employee baseSalary/branchId as of right now and computes deductions —
   * a later change to Employee.baseSalary never retroactively changes an already-saved run. Never
   * touches CashMovement; only approve() posts anything. One run per company/year/month (see the
   * unique index on PayrollRun) — this is the "منع التكرار المالي" guard at the creation step.
   */
  async create(dto: CreatePayrollRunDto, createdById: string, companyId: string): Promise<PayrollRun> {
    const existing = await this.repo.findOne({ where: { companyId, year: dto.year, month: dto.month } });
    if (existing) {
      throw new BadRequestException('A payroll run for this month already exists');
    }

    const employeeIds = dto.lines.map((l) => l.employeeId);
    const employees = await this.employeeRepo.find({ where: { id: In(employeeIds), companyId } });
    if (employees.length !== new Set(employeeIds).size) {
      throw new NotFoundException('One or more employees not found');
    }
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const documentNumber =
      (await this.numberingSeriesService.tryGetNextNumber(companyId, 'PAYROLL_RUN')) ?? `PR-${Date.now()}`;

    const lines = dto.lines.map((l) => {
      const employee = employeeById.get(l.employeeId)!;
      const baseSalary = Number(employee.baseSalary);
      // Daily rate = monthly salary / 30; hourly rate = daily rate / 8-hour workday — the same
      // standard formula مذكور بالمواصفة for absence/lateness deductions.
      const dailyRate = baseSalary / 30;
      const hourlyRate = dailyRate / 8;
      const absenceDays = l.absenceDays ?? 0;
      const lateHours = l.lateHours ?? 0;
      const otherDeductions = l.otherDeductions ?? 0;
      const absenceDeduction = dailyRate * absenceDays;
      const lateDeduction = hourlyRate * lateHours;
      const netSalary = Math.max(0, baseSalary - absenceDeduction - lateDeduction - otherDeductions);

      return Object.assign(new PayrollRunLine(), {
        employeeId: employee.id,
        branchId: employee.branchId,
        baseSalary,
        absenceDays,
        lateHours,
        otherDeductions,
        absenceDeduction,
        lateDeduction,
        netSalary,
      });
    });

    const run = this.repo.create({
      companyId,
      documentNumber,
      year: dto.year,
      month: dto.month,
      notes: dto.notes ?? null,
      status: DocumentStatus.CONFIRMED,
      createdById,
      lines,
    });

    return this.repo.save(run);
  }

  /**
   * One CashMovement per branch (net salaries grouped by each line's snapshot branchId), so the
   * Expense/Profit reports see one "رواتب الموظفين" line per branch instead of one per employee.
   * Posted against the last day of the payroll month, so it lands in that month's Expense Report
   * regardless of which day the posting actually happens on. Shared by approve() (first posting)
   * and update() (re-posting after an edit to an already-approved run) so the two can never drift.
   */
  private async postPayrollCashMovements(
    run: PayrollRun,
    companyId: string,
    postedById: string,
    manager: EntityManager,
  ): Promise<void> {
    const totalsByBranch = new Map<string, number>();
    for (const line of run.lines) {
      totalsByBranch.set(line.branchId, (totalsByBranch.get(line.branchId) ?? 0) + Number(line.netSalary));
    }

    const lastDay = new Date(run.year, run.month, 0).getDate();
    const movementDate = `${run.year}-${String(run.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    for (const [branchId, amount] of totalsByBranch) {
      if (amount <= 0) continue;
      await this.cashMovementsService.record(
        {
          companyId,
          branchId,
          movementDate,
          type: CashMovementType.EXPENSE,
          account: CashMovementAccount.CASH,
          amount,
          sourceType: CashMovementSourceType.PAYROLL,
          sourceId: run.id,
          category: 'رواتب الموظفين',
          description: `رواتب شهر ${run.month}/${run.year} - ${run.documentNumber}`,
          createdById: postedById,
        },
        manager,
      );
    }
  }

  /**
   * The only point where payroll actually posts to operating expenses. Only legal from CONFIRMED,
   * and status becomes APPROVED right after, so this can never run twice for the same run — that
   * one-way transition is what prevents double-posting.
   */
  async approve(id: string, companyId: string, approverId: string): Promise<PayrollRun> {
    return this.dataSource.transaction(async (manager) => {
      const runRepo = manager.getRepository(PayrollRun);
      const run = await runRepo.findOne({ where: { id, companyId }, relations: ['lines'] });
      if (!run) throw new NotFoundException('Payroll run not found');
      if (run.status !== DocumentStatus.CONFIRMED) {
        throw new BadRequestException('Only a submitted (pending-approval) payroll run can be approved');
      }

      await this.postPayrollCashMovements(run, companyId, approverId, manager);

      run.status = DocumentStatus.APPROVED;
      run.approvedById = approverId;
      run.approvedAt = new Date();
      return runRepo.save(run);
    });
  }

  /**
   * Recomputes each line's deductions/net salary from its own snapshot baseSalary (never
   * refetches the employee — same reasoning as create()) using whatever absence/lateness/other
   * figures the caller sent. If the run is already APPROVED (net salaries already posted as
   * CashMovement rows — see postPayrollCashMovements()), those rows are removed and re-posted with
   * the corrected totals in the same transaction, via CashMovementsService.removeBySource(), so an
   * edit's financial impact is always reflected immediately rather than requiring a separate
   * "unapprove" step first.
   */
  async update(id: string, dto: UpdatePayrollRunDto, companyId: string, updatedById: string): Promise<PayrollRun> {
    return this.dataSource.transaction(async (manager) => {
      const runRepo = manager.getRepository(PayrollRun);
      const lineRepo = manager.getRepository(PayrollRunLine);
      const run = await runRepo.findOne({ where: { id, companyId }, relations: ['lines'] });
      if (!run) throw new NotFoundException('Payroll run not found');

      const lineByEmployeeId = new Map(run.lines.map((l) => [l.employeeId, l]));
      for (const dtoLine of dto.lines) {
        const line = lineByEmployeeId.get(dtoLine.employeeId);
        if (!line) {
          throw new NotFoundException(`No payroll line found for employee ${dtoLine.employeeId} on this run`);
        }
        const baseSalary = Number(line.baseSalary);
        const dailyRate = baseSalary / 30;
        const hourlyRate = dailyRate / 8;
        line.absenceDays = dtoLine.absenceDays ?? 0;
        line.lateHours = dtoLine.lateHours ?? 0;
        line.otherDeductions = dtoLine.otherDeductions ?? 0;
        line.absenceDeduction = dailyRate * line.absenceDays;
        line.lateDeduction = hourlyRate * line.lateHours;
        line.netSalary = Math.max(0, baseSalary - line.absenceDeduction - line.lateDeduction - line.otherDeductions);
      }
      await lineRepo.save(run.lines);

      if (dto.notes !== undefined) run.notes = dto.notes;

      if (run.status === DocumentStatus.APPROVED) {
        await this.cashMovementsService.removeBySource(companyId, CashMovementSourceType.PAYROLL, run.id, manager);
        await this.postPayrollCashMovements(run, companyId, updatedById, manager);
      }

      return runRepo.save(run);
    });
  }

  /**
   * Deletes the run and (via PayrollRunLine's onDelete: 'CASCADE') its lines. If the run was
   * already APPROVED, its posted CashMovement rows are reversed first via removeBySource() so a
   * deleted payroll run never leaves a dangling operating-expense entry behind.
   */
  async remove(id: string, companyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const runRepo = manager.getRepository(PayrollRun);
      const run = await runRepo.findOne({ where: { id, companyId } });
      if (!run) throw new NotFoundException('Payroll run not found');

      if (run.status === DocumentStatus.APPROVED) {
        await this.cashMovementsService.removeBySource(companyId, CashMovementSourceType.PAYROLL, run.id, manager);
      }

      await runRepo.remove(run);
    });
  }
}
