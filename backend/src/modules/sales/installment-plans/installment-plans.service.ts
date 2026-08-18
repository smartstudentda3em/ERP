import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { InstallmentPlan, InstallmentPlanLine } from './entities/installment-plan.entity';
import { InstallmentScheduleItem } from './entities/installment-schedule-item.entity';
import { InstallmentPayment } from './entities/installment-payment.entity';
import { Customer } from '../../parties/customers/entities/customer.entity';
import {
  CashMovementAccount,
  CashMovementSourceType,
  CashMovementType,
  CustomerCreditStatus,
  InstallmentPaymentType,
  InstallmentPlanStatus,
  PaymentMethod,
  StockMovementType,
} from '../../../entities/enums';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { ProductKitsService } from '../../inventory/products/product-kits.service';
import { CashMovementsService } from '../../treasury/cash-movements.service';
import { CreateInstallmentPlanDto, EarlySettleInstallmentPlanDto, RecordInstallmentPaymentDto } from './dto/installment-plan.dto';
import { computeInstallmentTerms, generateInstallmentSchedule } from '../../../common/utils/installment-calculator';

const round = (n: number) => Math.round(n * 10000) / 10000;

export type ScheduleItemStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

export interface ScheduleItemView {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principalPortion: number;
  interestPortion: number;
  amountDue: number;
  amountPaid: number;
  remaining: number;
  status: ScheduleItemStatus;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class InstallmentPlansService {
  constructor(
    @InjectRepository(InstallmentPlan) private readonly planRepo: Repository<InstallmentPlan>,
    @InjectRepository(InstallmentScheduleItem) private readonly itemRepo: Repository<InstallmentScheduleItem>,
    @InjectRepository(InstallmentPayment) private readonly paymentRepo: Repository<InstallmentPayment>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly productKitsService: ProductKitsService,
    private readonly cashMovementsService: CashMovementsService,
  ) {}

  async create(dto: CreateInstallmentPlanDto, companyId: string, createdById: string): Promise<InstallmentPlan> {
    const customer = await this.customerRepo.findOne({ where: { id: dto.customerId } });
    if (!customer || customer.companyId !== companyId) throw new NotFoundException('Customer not found');
    if (customer.creditStatus === CustomerCreditStatus.BLOCKED) {
      throw new ForbiddenException(customer.blockedReason || 'هذا العميل محظور من عقود التقسيط الجديدة');
    }

    return this.dataSource.transaction(async (manager) => {
      const documentNumber = await this.numberingSeriesService.getNextNumber(companyId, 'INSTALLMENT_PLAN');

      let totalPrice = 0;
      const lineEntities: Partial<InstallmentPlanLine>[] = [];
      for (const line of dto.lines) {
        const { unitCost } = await this.productKitsService.issueSmart(
          {
            companyId,
            productId: line.productId,
            warehouseId: dto.warehouseId,
            quantity: line.quantity,
            referenceType: 'INSTALLMENT_PLAN',
            referenceNumber: documentNumber,
            createdById,
          },
          undefined,
          manager,
        );
        const lineTotal = round(line.quantity * line.unitPrice);
        totalPrice = round(totalPrice + lineTotal);
        lineEntities.push({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal, unitCost });
      }

      if (dto.downPayment > totalPrice) {
        throw new BadRequestException('الدفعة المقدمة أكبر من إجمالي سعر السلعة');
      }

      const terms = computeInstallmentTerms({
        totalPrice,
        downPayment: dto.downPayment,
        interestType: dto.interestType,
        interestRate: dto.interestRate,
        tenureMonths: dto.tenureMonths,
      });

      const planRepo = manager.getRepository(InstallmentPlan);
      const plan = planRepo.create({
        documentNumber,
        companyId,
        customerId: dto.customerId,
        warehouseId: dto.warehouseId,
        purchaseDate: dto.purchaseDate,
        downPayment: dto.downPayment,
        interestType: dto.interestType,
        interestRate: dto.interestRate,
        tenureMonths: dto.tenureMonths,
        financedPrincipal: terms.financedPrincipal,
        totalInterestAmount: terms.totalInterestAmount,
        totalPayable: terms.totalPayable,
        installmentAmount: terms.installmentAmount,
        status: InstallmentPlanStatus.ACTIVE,
        createdById,
        lines: lineEntities as InstallmentPlanLine[],
      });
      const saved = await planRepo.save(plan);

      const scheduleInputs = generateInstallmentSchedule(dto.purchaseDate, terms, dto.tenureMonths);
      const itemRepo = manager.getRepository(InstallmentScheduleItem);
      await itemRepo.save(scheduleInputs.map((s) => itemRepo.create({ installmentPlanId: saved.id, ...s })));

      if (dto.downPayment > 0) {
        const movement = await this.cashMovementsService.record(
          {
            companyId,
            movementDate: dto.purchaseDate,
            type: CashMovementType.INCOME,
            account: CashMovementAccount.CASH,
            amount: dto.downPayment,
            sourceType: CashMovementSourceType.INSTALLMENT_PAYMENT,
            sourceId: saved.id,
            partyCustomerId: dto.customerId,
            description: `Down payment ${documentNumber}`,
            createdById,
          },
          manager,
        );
        const paymentDocumentNumber =
          (await this.numberingSeriesService.tryGetNextNumber(companyId, 'INSTALLMENT_PAYMENT')) ?? `INSTLP-${Date.now()}`;
        const paymentRepo = manager.getRepository(InstallmentPayment);
        await paymentRepo.save(
          paymentRepo.create({
            documentNumber: paymentDocumentNumber,
            installmentPlanId: saved.id,
            scheduleItemId: null,
            paymentType: InstallmentPaymentType.DOWN_PAYMENT,
            amount: dto.downPayment,
            principalAllocated: dto.downPayment,
            interestAllocated: 0,
            paymentDate: dto.purchaseDate,
            method: PaymentMethod.CASH,
            cashMovementId: movement.id,
            companyId,
            createdById,
          }),
        );
      }

      return saved;
    });
  }

  async findAllForCompany(companyId: string) {
    const plans = await this.planRepo.find({ where: { companyId }, relations: ['customer'], order: { createdAt: 'DESC' } });
    if (plans.length === 0) return [];

    const planIds = plans.map((p) => p.id);
    const items = await this.itemRepo.find({ where: { installmentPlanId: In(planIds) } });
    const payments = await this.paymentRepo.find({ where: { installmentPlanId: In(planIds) } });

    return plans.map((plan) => {
      const planItems = items.filter((i) => i.installmentPlanId === plan.id);
      const planPayments = payments.filter((p) => p.installmentPlanId === plan.id);
      const views = this.buildScheduleViews(plan, planItems, planPayments);
      const remainingBalance = round(views.reduce((s, v) => s + v.remaining, 0));
      const nextDue = views.find((v) => v.status !== 'PAID');
      return {
        id: plan.id,
        documentNumber: plan.documentNumber,
        customerId: plan.customerId,
        customerName: plan.customer?.name ?? '—',
        purchaseDate: plan.purchaseDate,
        totalPayable: Number(plan.totalPayable),
        installmentAmount: Number(plan.installmentAmount),
        remainingBalance,
        nextDueDate: nextDue?.dueDate ?? null,
        status: plan.status,
      };
    });
  }

  async findOneScoped(id: string, companyId: string): Promise<InstallmentPlan> {
    const plan = await this.planRepo.findOne({ where: { id }, relations: ['customer', 'warehouse', 'lines', 'lines.product'] });
    if (!plan || plan.companyId !== companyId) throw new NotFoundException('Installment plan not found');
    return plan;
  }

  async getScheduleView(id: string, companyId: string) {
    const plan = await this.findOneScoped(id, companyId);
    const items = await this.itemRepo.find({ where: { installmentPlanId: id }, order: { installmentNumber: 'ASC' } });
    const payments = await this.paymentRepo.find({ where: { installmentPlanId: id } });
    const schedule = this.buildScheduleViews(plan, items, payments);
    const downPayment = payments.find((p) => p.paymentType === InstallmentPaymentType.DOWN_PAYMENT);
    return { plan, schedule, downPaymentAmount: downPayment ? Number(downPayment.amount) : 0, payments };
  }

  /** Derives each schedule item's paid amount/status live from InstallmentPayment rows — never
   * cached, mirroring this codebase's rule for Customer.balanceDue / SalesInvoice.amountPaid. A
   * plan settled early treats every remaining item as closed regardless of its own payment sum. */
  private buildScheduleViews(
    plan: InstallmentPlan,
    items: InstallmentScheduleItem[],
    payments: InstallmentPayment[],
  ): ScheduleItemView[] {
    const todayStr = today();
    return items
      .sort((a, b) => a.installmentNumber - b.installmentNumber)
      .map((item) => {
        const amountDue = Number(item.amountDue);
        const paidForItem = payments
          .filter((p) => p.scheduleItemId === item.id)
          .reduce((s, p) => s + Number(p.amount), 0);
        const settledEarly = plan.status === InstallmentPlanStatus.SETTLED_EARLY;
        const amountPaid = settledEarly ? amountDue : round(paidForItem);
        const remaining = settledEarly ? 0 : round(amountDue - amountPaid);
        let status: ScheduleItemStatus;
        if (remaining <= 0.005) status = 'PAID';
        else if (amountPaid > 0.005) status = 'PARTIALLY_PAID';
        else if (item.dueDate < todayStr) status = 'OVERDUE';
        else status = 'PENDING';
        return {
          id: item.id,
          installmentNumber: item.installmentNumber,
          dueDate: item.dueDate,
          principalPortion: Number(item.principalPortion),
          interestPortion: Number(item.interestPortion),
          amountDue,
          amountPaid,
          remaining,
          status,
        };
      });
  }

  async recordPayment(
    planId: string,
    itemId: string,
    dto: RecordInstallmentPaymentDto,
    companyId: string,
    createdById: string,
  ): Promise<InstallmentPayment> {
    const plan = await this.findOneScoped(planId, companyId);
    if (plan.status !== InstallmentPlanStatus.ACTIVE) {
      throw new BadRequestException('لا يمكن تسجيل دفعة على عقد غير نشط');
    }
    const item = await this.itemRepo.findOne({ where: { id: itemId, installmentPlanId: planId } });
    if (!item) throw new NotFoundException('Schedule item not found');

    return this.dataSource.transaction(async (manager) => {
      const account = dto.method === 'CASH' ? CashMovementAccount.CASH : CashMovementAccount.BANK;
      const movement = await this.cashMovementsService.record(
        {
          companyId,
          movementDate: dto.paymentDate,
          type: CashMovementType.INCOME,
          account,
          amount: dto.amount,
          sourceType: CashMovementSourceType.INSTALLMENT_PAYMENT,
          sourceId: plan.id,
          partyCustomerId: plan.customerId,
          description: `Installment #${item.installmentNumber} payment ${plan.documentNumber}`,
          createdById,
        },
        manager,
      );
      const documentNumber =
        (await this.numberingSeriesService.tryGetNextNumber(companyId, 'INSTALLMENT_PAYMENT')) ?? `INSTLP-${Date.now()}`;
      // Split this payment across principal/interest proportionally to the item's own ratio, so
      // the interest-profit report can sum realized interest without reconstructing it later.
      const itemAmountDue = Number(item.amountDue) || 1;
      const interestAllocated = round(dto.amount * (Number(item.interestPortion) / itemAmountDue));
      const principalAllocated = round(dto.amount - interestAllocated);
      const paymentRepo = manager.getRepository(InstallmentPayment);
      const payment = await paymentRepo.save(
        paymentRepo.create({
          documentNumber,
          installmentPlanId: plan.id,
          scheduleItemId: item.id,
          paymentType: InstallmentPaymentType.INSTALLMENT,
          amount: dto.amount,
          principalAllocated,
          interestAllocated,
          paymentDate: dto.paymentDate,
          method: dto.method,
          cashMovementId: movement.id,
          companyId,
          createdById,
        }),
      );

      await this.maybeCompletePlan(plan.id, manager);
      return payment;
    });
  }

  async settleEarly(
    planId: string,
    dto: EarlySettleInstallmentPlanDto,
    companyId: string,
    createdById: string,
  ): Promise<InstallmentPlan> {
    const plan = await this.findOneScoped(planId, companyId);
    if (plan.status !== InstallmentPlanStatus.ACTIVE) {
      throw new BadRequestException('لا يمكن التسوية المبكرة لعقد غير نشط');
    }
    const items = await this.itemRepo.find({ where: { installmentPlanId: planId } });
    const payments = await this.paymentRepo.find({ where: { installmentPlanId: planId } });
    const views = this.buildScheduleViews(plan, items, payments);

    let remainingPrincipal = 0;
    let remainingInterest = 0;
    for (const view of views) {
      if (view.remaining <= 0.005) continue;
      const itemRemainingRatio = view.remaining / view.amountDue;
      remainingPrincipal = round(remainingPrincipal + view.principalPortion * itemRemainingRatio);
      remainingInterest = round(remainingInterest + view.interestPortion * itemRemainingRatio);
    }

    // Manual discount applies to the remaining INTEREST only — principal is never discounted.
    const discount = round(
      dto.discountAmount ?? (dto.discountPercent ? remainingInterest * (dto.discountPercent / 100) : 0),
    );
    if (discount > remainingInterest) {
      throw new BadRequestException('قيمة الخصم أكبر من إجمالي الفوائد المتبقية');
    }
    const finalAmount = round(remainingPrincipal + remainingInterest - discount);

    return this.dataSource.transaction(async (manager) => {
      if (finalAmount > 0.005) {
        const account = dto.method === 'CASH' ? CashMovementAccount.CASH : CashMovementAccount.BANK;
        const movement = await this.cashMovementsService.record(
          {
            companyId,
            movementDate: dto.settlementDate,
            type: CashMovementType.INCOME,
            account,
            amount: finalAmount,
            sourceType: CashMovementSourceType.INSTALLMENT_PAYMENT,
            sourceId: plan.id,
            partyCustomerId: plan.customerId,
            description: `Early settlement ${plan.documentNumber}`,
            createdById,
          },
          manager,
        );
        const documentNumber =
          (await this.numberingSeriesService.tryGetNextNumber(companyId, 'INSTALLMENT_PAYMENT')) ?? `INSTLP-${Date.now()}`;
        const paymentRepo = manager.getRepository(InstallmentPayment);
        await paymentRepo.save(
          paymentRepo.create({
            documentNumber,
            installmentPlanId: plan.id,
            scheduleItemId: null,
            paymentType: InstallmentPaymentType.EARLY_SETTLEMENT,
            amount: finalAmount,
            principalAllocated: remainingPrincipal,
            interestAllocated: round(remainingInterest - discount),
            paymentDate: dto.settlementDate,
            method: dto.method,
            cashMovementId: movement.id,
            companyId,
            createdById,
          }),
        );
      }

      const planRepo = manager.getRepository(InstallmentPlan);
      plan.status = InstallmentPlanStatus.SETTLED_EARLY;
      plan.settledAt = new Date();
      plan.settlementDiscountAmount = discount;
      plan.settlementNotes = dto.notes ?? null;
      return planRepo.save(plan);
    });
  }

  /** Marks a plan COMPLETED once every schedule item is fully paid — checked after every payment. */
  private async maybeCompletePlan(planId: string, manager: EntityManager): Promise<void> {
    const planRepo = manager.getRepository(InstallmentPlan);
    const itemRepo = manager.getRepository(InstallmentScheduleItem);
    const paymentRepo = manager.getRepository(InstallmentPayment);
    const plan = await planRepo.findOne({ where: { id: planId } });
    if (!plan) return;
    const items = await itemRepo.find({ where: { installmentPlanId: planId } });
    const payments = await paymentRepo.find({ where: { installmentPlanId: planId } });
    const views = this.buildScheduleViews(plan, items, payments);
    if (views.every((v) => v.status === 'PAID')) {
      plan.status = InstallmentPlanStatus.COMPLETED;
      await planRepo.save(plan);
    }
  }

  /** Only permitted before any installment/early-settlement payment has been collected (the down
   * payment itself is fine) — reverses the issued stock and removes the plan outright. Cancelling
   * a plan that already has real collections against it would need partial-reversal accounting
   * this module doesn't attempt, matching the scope confirmed with the user. */
  async cancel(id: string, companyId: string, deletedById: string): Promise<void> {
    const plan = await this.findOneScoped(id, companyId);
    const payments = await this.paymentRepo.find({ where: { installmentPlanId: id } });
    if (payments.some((p) => p.paymentType !== InstallmentPaymentType.DOWN_PAYMENT)) {
      throw new BadRequestException('لا يمكن إلغاء عقد تم تحصيل أقساط عليه بالفعل');
    }

    await this.dataSource.transaction(async (manager) => {
      for (const line of plan.lines) {
        await this.productKitsService.receiveSmart(
          {
            companyId,
            productId: line.productId,
            warehouseId: plan.warehouseId,
            quantity: Number(line.quantity),
            unitCost: Number(line.unitCost),
            referenceType: 'INSTALLMENT_PLAN_CANCEL',
            referenceId: plan.id,
            referenceNumber: plan.documentNumber,
            createdById: deletedById,
          },
          StockMovementType.SALES_RETURN,
          manager,
        );
      }
      await this.cashMovementsService.removeBySource(companyId, CashMovementSourceType.INSTALLMENT_PAYMENT, plan.id, manager);
      await manager.getRepository(InstallmentPayment).delete({ installmentPlanId: id });
      await manager.getRepository(InstallmentScheduleItem).delete({ installmentPlanId: id });
      await manager.getRepository(InstallmentPlanLine).delete({ installmentPlanId: id });
      await manager.getRepository(InstallmentPlan).delete({ id });
    });
  }

  /** "إجمالي الأموال الموزعة": every uncollected dinar (principal + interest) still owed across
   * every ACTIVE plan's schedule — live SQL aggregation, same style as dashboard.service.ts. */
  async getSummary(companyId: string): Promise<{ totalOutstanding: number }> {
    const dueRow = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(si."amountDue"), 0)', 'totalDue')
      .from('installment_schedule_items', 'si')
      .innerJoin('installment_plans', 'p', 'p.id = si."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere(`p.status = 'ACTIVE'`)
      .getRawOne();
    const paidRow = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(ip.amount), 0)', 'totalPaid')
      .from('installment_payments', 'ip')
      .innerJoin('installment_plans', 'p', 'p.id = ip."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere(`p.status = 'ACTIVE'`)
      .andWhere('ip."scheduleItemId" IS NOT NULL')
      .getRawOne();
    const totalOutstanding = round(Number(dueRow?.totalDue ?? 0) - Number(paidRow?.totalPaid ?? 0));
    return { totalOutstanding };
  }

  /** "التحصيلات المتوقعة": sum of amountDue for every ACTIVE plan's schedule item whose dueDate
   * falls in the given range, bucketed by month. */
  async getExpectedCashFlow(companyId: string, dateFrom?: string, dateTo?: string) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select(`to_char(si."dueDate", 'YYYY-MM')`, 'period')
      .addSelect('COALESCE(SUM(si."amountDue"), 0)', 'expected')
      .from('installment_schedule_items', 'si')
      .innerJoin('installment_plans', 'p', 'p.id = si."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere(`p.status = 'ACTIVE'`);
    if (dateFrom) qb.andWhere('si."dueDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('si."dueDate" <= :dateTo', { dateTo });
    qb.groupBy('period').orderBy('period', 'ASC');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({ period: r.period, expected: Number(r.expected) }));
  }

  /** "أرباح الفوائد": realized interest (the interestAllocated portion of payments recorded within
   * the range) vs. remaining interest (the interestPortion still owed on open schedule items of
   * ACTIVE plans) — uses the amount stored on each InstallmentPayment at recording time rather than
   * reconstructing it after the fact, so early-settlement discounts are reflected correctly. */
  async getInterestProfit(companyId: string, dateFrom?: string, dateTo?: string) {
    const realizedQb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(ip."interestAllocated"), 0)', 'realized')
      .from('installment_payments', 'ip')
      .innerJoin('installment_plans', 'p', 'p.id = ip."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId });
    if (dateFrom) realizedQb.andWhere('ip."paymentDate" >= :dateFrom', { dateFrom });
    if (dateTo) realizedQb.andWhere('ip."paymentDate" <= :dateTo', { dateTo });
    const realizedRow = await realizedQb.getRawOne();

    const dueRow = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(si."interestPortion"), 0)', 'totalInterestDue')
      .from('installment_schedule_items', 'si')
      .innerJoin('installment_plans', 'p', 'p.id = si."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere(`p.status = 'ACTIVE'`)
      .getRawOne();
    const paidInterestRow = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(ip."interestAllocated"), 0)', 'paidInterest')
      .from('installment_payments', 'ip')
      .innerJoin('installment_plans', 'p', 'p.id = ip."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere(`p.status = 'ACTIVE'`)
      .getRawOne();

    return {
      realizedInterest: round(Number(realizedRow?.realized ?? 0)),
      remainingInterest: round(Number(dueRow?.totalInterestDue ?? 0) - Number(paidInterestRow?.paidInterest ?? 0)),
    };
  }
}
