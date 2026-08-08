import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockAudit, StockAuditLine } from './entities/stock-audit.entity';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { DocumentStatus, StockMovementType } from '../../../entities/enums';
import { ApproveStockAuditDto, CreateStockAuditDto, UpdateStockAuditDto } from './dto/stock-audit.dto';
import { Warehouse } from '../../settings/entities/warehouse.entity';
import { Product } from '../products/entities/product.entity';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';

// Genuine new stock entering the warehouse — always added.
const INCOMING_ADD_TYPES = [
  StockMovementType.PURCHASE_RECEIPT,
  StockMovementType.ADJUSTMENT_IN,
  StockMovementType.TRANSFER_IN,
  StockMovementType.OPENING_STOCK,
];

// PURCHASE_RETURN is subtracted, never treated as a fresh incoming: PurchaseReceiptsService never
// deletes or edits a PURCHASE_RECEIPT movement once posted (receipts have no status/soft-delete —
// see PurchaseReceiptsService.remove()/update()) — cancelling or shrinking a receipt instead posts
// a compensating PURCHASE_RETURN issue for the difference, leaving the original PURCHASE_RECEIPT
// in the ledger untouched. Without netting this out, a receipt that was later cancelled or
// corrected down would still count its full original quantity here forever.
//
// SALES_RETURN is excluded entirely (added nowhere) rather than subtracted-then-added: it only
// ever appears when an invoice or installment plan is deleted/cancelled, reversing a SALES_ISSUE
// that this method never subtracted in the first place (see the class doc on getSetupLines() for
// why outgoing movements are never netted against previous stock). Counting SALES_RETURN as a
// fresh incoming would double the quantity — once as phantom "new stock" here, and a second time
// because the sale that supposedly consumed it was never subtracted to begin with.
const INCOMING_SUBTRACT_TYPES = [StockMovementType.PURCHASE_RETURN];

/** First day of the month after `dateStr` (e.g. '2026-08-01' -> '2026-09-01') — an exclusive
 * upper bound so a whole audited month's movements are included regardless of which day within
 * it they landed on. */
function firstDayOfNextMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

@Injectable()
export class StockAuditsService {
  constructor(
    @InjectRepository(StockAudit) private readonly repo: Repository<StockAudit>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockAdjustmentsService: StockAdjustmentsService,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {}

  /**
   * Backs the "بدء جرد جديد" setup screen's "المخزون السابق (بالوحدة)" column — deliberately
   * never reads live stockLevels.quantityOnHand, which reflects consumption this audit itself is
   * meant to measure. Instead, per product:
   *  - If a previous APPROVED audit exists for this product in this warehouse: previous stock =
   *    that audit's counted actualQuantity + net genuine receipts into the warehouse since then
   *    (purchases, positive adjustments/transfers, minus any purchase returns) through this
   *    audit's month.
   *  - Otherwise (first-ever audit for this product/warehouse): previous stock = the same net
   *    receipts total, from the beginning through this audit's month.
   * Outgoing movements (sales, adjustments out, etc.) are never subtracted — the whole point of
   * "الكمية المستهلكة" (systemQuantity - actualQuantity) on the audit line is to surface exactly
   * that untracked consumption, so subtracting it here would erase the very thing the audit
   * exists to reveal. PURCHASE_RETURN and SALES_RETURN are the two exceptions to "outgoing types
   * are never touched" — see INCOMING_SUBTRACT_TYPES above for why each is handled specially
   * rather than being either summed as incoming or ignored like every other outflow.
   *
   * Every query here is scoped by BOTH companyId and warehouseId (never one alone), so a receipt
   * or movement posted for another branch's warehouse — or another company entirely — can never
   * bleed into this one's total. Movements are additionally deduped by their originating document
   * reference before being summed, so a receipt/invoice whose stock effect was somehow posted
   * twice is only ever counted once (see the dedup pass below).
   */
  async getSetupLines(
    companyId: string,
    warehouseId: string,
    auditDate: string,
  ): Promise<{ productId: string; previousStock: number }[]> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const upperBoundExclusive = firstDayOfNextMonth(auditDate);

    const products = await this.productRepo.find({ where: { companyId, isActive: true } as any });

    const approvedLineRows = await this.dataSource
      .createQueryBuilder()
      .select('line."productId"', 'productId')
      .addSelect('line."actualQuantity"', 'actualQuantity')
      .addSelect('audit."auditDate"', 'auditDate')
      .from('stock_audit_lines', 'line')
      .innerJoin('stock_audits', 'audit', 'audit.id = line."auditId"')
      .where('audit."companyId" = :companyId', { companyId })
      .andWhere('audit."warehouseId" = :warehouseId', { warehouseId })
      .andWhere('audit.status = :status', { status: DocumentStatus.APPROVED })
      .andWhere('audit."auditDate" < :upperBound', { upperBound: upperBoundExclusive })
      .orderBy('audit."auditDate"', 'DESC')
      .getRawMany();

    // Keep only the latest approved line per product — rows arrive newest-audit-first, so the
    // first occurrence of each productId is already the one we want.
    const lastApprovedByProductId = new Map<string, { actualQuantity: number; auditDate: string }>();
    for (const r of approvedLineRows) {
      if (!lastApprovedByProductId.has(r.productId)) {
        lastApprovedByProductId.set(r.productId, { actualQuantity: Number(r.actualQuantity ?? 0), auditDate: r.auditDate });
      }
    }

    const movementRows = await this.dataSource
      .createQueryBuilder()
      .select('m."productId"', 'productId')
      .addSelect('m.quantity', 'quantity')
      .addSelect('m."createdAt"', 'createdAt')
      .addSelect('m.type', 'type')
      .addSelect('m."referenceType"', 'referenceType')
      .addSelect('m."referenceNumber"', 'referenceNumber')
      .from('stock_movements', 'm')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere('m."warehouseId" = :warehouseId', { warehouseId })
      .andWhere('m.type IN (:...types)', { types: [...INCOMING_ADD_TYPES, ...INCOMING_SUBTRACT_TYPES] })
      .andWhere('m."createdAt" < :upperBound', { upperBound: upperBoundExclusive })
      .getRawMany();

    // Defends against the same receipt/invoice somehow posting its stock effect twice (a retried
    // request, a double-submitted form before a UI-level guard existed) rather than against
    // legitimate repeat purchases of the same product on the same day — those carry different
    // referenceNumbers and are never collapsed. Keeps the first-seen row per
    // (referenceType, referenceNumber, type, productId); a genuine duplicate always shares all
    // four, since it's the same movement posted again for the same document.
    const seenReferenceKeys = new Set<string>();
    const dedupedMovementRows = movementRows.filter((m) => {
      if (!m.referenceNumber) return true; // no document to key on — nothing to dedupe against
      const key = `${m.referenceType ?? ''}|${m.referenceNumber}|${m.type}|${m.productId}`;
      if (seenReferenceKeys.has(key)) return false;
      seenReferenceKeys.add(key);
      return true;
    });

    const incomingByProductId = new Map<string, number>();
    for (const m of dedupedMovementRows) {
      const last = lastApprovedByProductId.get(m.productId);
      if (last && new Date(m.createdAt) < new Date(firstDayOfNextMonth(last.auditDate))) continue;
      const signedQuantity = INCOMING_SUBTRACT_TYPES.includes(m.type) ? -Number(m.quantity) : Number(m.quantity);
      incomingByProductId.set(m.productId, (incomingByProductId.get(m.productId) ?? 0) + signedQuantity);
    }

    return products.map((p) => {
      const last = lastApprovedByProductId.get(p.id);
      const incoming = incomingByProductId.get(p.id) ?? 0;
      return { productId: p.id, previousStock: (last?.actualQuantity ?? 0) + incoming };
    });
  }

  /**
   * `totalConsumedValue` mirrors StockAuditDetailPage's own totalConsumedValue exactly (same
   * newStockQuantity/consumed/unitCost formula, line by line) so the list's column and the detail
   * page's header card can never disagree — computed live here rather than stored, same reasoning
   * as ShipmentsService.findAll()'s totalCost.
   */
  async findAll(companyId: string) {
    const audits = await this.repo.find({
      where: { companyId },
      relations: ['lines', 'warehouse', 'warehouse.branch'],
      order: { createdAt: 'DESC' },
    });
    return audits.map((audit) => ({
      ...audit,
      totalConsumedValue: audit.lines.reduce((sum, line) => {
        if (line.actualQuantity === null) return sum;
        const newQuantity =
          audit.status === DocumentStatus.APPROVED
            ? Number(line.adjustedQuantity ?? line.actualQuantity)
            : Number(line.actualQuantity);
        const consumed = Number(line.systemQuantity) - newQuantity;
        return sum + consumed * Number(line.unitCost);
      }, 0),
    }));
  }

  findOne(id: string, companyId: string) {
    return this.repo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.product', 'warehouse', 'warehouse.branch'],
    });
  }

  /**
   * Records the physical count only — deliberately never touches real stock levels. The audit is
   * saved CONFIRMED (locked/read-only from here on) and waits for a separate administrative
   * approval (see approve()) before any variance is actually applied.
   */
  async create(dto: CreateStockAuditDto, createdById: string, companyId: string): Promise<StockAudit> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id: dto.warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const documentNumber =
      (await this.numberingSeriesService.tryGetNextNumber(companyId, 'STOCK_AUDIT')) ?? `AUDIT-${Date.now()}`;

    const audit = this.repo.create({
      companyId,
      documentNumber,
      auditDate: dto.auditDate,
      warehouseId: dto.warehouseId,
      notes: dto.notes ?? null,
      status: DocumentStatus.CONFIRMED,
      createdById,
      lines: dto.lines.map((l) =>
        Object.assign(new StockAuditLine(), {
          productId: l.productId,
          systemQuantity: l.systemQuantity,
          actualQuantity: l.actualQuantity ?? null,
          unitCost: l.unitCost,
        }),
      ),
    });

    return this.repo.save(audit);
  }

  /**
   * Edits an audit's header (month/date, notes) and/or its lines' counted quantities. A
   * CONFIRMED audit hasn't moved any stock yet, so editing its lines is a plain field update.
   * An APPROVED audit already moved real stock via approve() — editing its lines here reverses
   * that original effect first (swapping systemQuantity/countedQuantity per line negates the
   * originally-applied delta) and then reapplies a fresh adjustment for the new counts, both
   * inside the same transaction as the line/header save so a failure partway (e.g. the warehouse
   * no longer holds enough stock to honor the reversal) rolls back the whole edit instead of
   * leaving stock half-corrected.
   */
  async update(id: string, dto: UpdateStockAuditDto, companyId: string, updatedById: string): Promise<StockAudit> {
    return this.dataSource.transaction(async (manager) => {
      const auditRepo = manager.getRepository(StockAudit);
      const lineRepo = manager.getRepository(StockAuditLine);
      const audit = await auditRepo.findOne({ where: { id, companyId }, relations: ['lines'] });
      if (!audit) throw new NotFoundException('Stock audit not found');

      if (dto.auditDate !== undefined) audit.auditDate = dto.auditDate;
      if (dto.notes !== undefined) audit.notes = dto.notes;

      if (dto.lines) {
        const wasApproved = audit.status === DocumentStatus.APPROVED;
        const countedBefore = audit.lines.filter((l) => l.actualQuantity !== null);

        if (wasApproved && countedBefore.length > 0) {
          await this.stockAdjustmentsService.create(
            {
              adjustmentDate: audit.auditDate,
              warehouseId: audit.warehouseId,
              reason: `تراجع عن جرد ${audit.documentNumber} (تعديل)`,
              // Swapped system/counted so the computed delta is the exact negative of the
              // original one applied at approval time — cancels it out precisely. Reverses
              // adjustedQuantity (the value actually written to stock, possibly admin-overridden
              // at approval), not actualQuantity, or an overridden line would reverse wrong.
              lines: countedBefore.map((l) => ({
                productId: l.productId,
                systemQuantity: Number(l.adjustedQuantity ?? l.actualQuantity),
                countedQuantity: Number(l.systemQuantity),
                unitCost: Number(l.unitCost),
              })),
            },
            updatedById,
            companyId,
            manager,
          );
        }

        const newActualByProductId = new Map(dto.lines.map((l) => [l.productId, l.actualQuantity ?? null]));
        for (const line of audit.lines) {
          if (newActualByProductId.has(line.productId)) {
            line.actualQuantity = newActualByProductId.get(line.productId)!;
            // Editing the count invalidates any prior admin override — reset here, and, if the
            // audit is already approved, re-set to match the freshly reapplied value below.
            line.adjustedQuantity = null;
          }
        }
        await lineRepo.save(audit.lines);

        if (wasApproved) {
          const countedAfter = audit.lines.filter((l) => l.actualQuantity !== null);
          if (countedAfter.length > 0) {
            const adjustment = await this.stockAdjustmentsService.create(
              {
                adjustmentDate: audit.auditDate,
                warehouseId: audit.warehouseId,
                reason: `تعديل جرد ${audit.documentNumber}`,
                lines: countedAfter.map((l) => ({
                  productId: l.productId,
                  systemQuantity: Number(l.systemQuantity),
                  countedQuantity: Number(l.actualQuantity),
                  unitCost: Number(l.unitCost),
                })),
              },
              updatedById,
              companyId,
              manager,
            );
            audit.stockAdjustmentId = adjustment.id;
            for (const line of countedAfter) {
              line.adjustedQuantity = Number(line.actualQuantity);
            }
            await lineRepo.save(countedAfter);
          } else {
            audit.stockAdjustmentId = null;
          }
        }
      }

      return auditRepo.save(audit);
    });
  }

  /**
   * Deletes an audit and its lines. A CONFIRMED audit never moved stock, so this is a plain
   * delete. An APPROVED audit already moved real stock via approve() — this reverses that effect
   * first (same swapped system/counted trick as update() above) inside the same transaction as
   * the removal, so a failed rollback (insufficient stock to reverse) aborts the delete entirely
   * rather than leaving stock corrected but the audit record still gone.
   */
  async remove(id: string, companyId: string, removedById: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const auditRepo = manager.getRepository(StockAudit);
      const audit = await auditRepo.findOne({ where: { id, companyId }, relations: ['lines'] });
      if (!audit) throw new NotFoundException('Stock audit not found');

      if (audit.status === DocumentStatus.APPROVED) {
        const counted = audit.lines.filter((l) => l.actualQuantity !== null);
        if (counted.length > 0) {
          await this.stockAdjustmentsService.create(
            {
              adjustmentDate: audit.auditDate,
              warehouseId: audit.warehouseId,
              reason: `حذف جرد ${audit.documentNumber} (تراجع)`,
              // Reverses adjustedQuantity (the value actually written to stock at approval,
              // possibly admin-overridden), not actualQuantity — see update()'s reversal above.
              lines: counted.map((l) => ({
                productId: l.productId,
                systemQuantity: Number(l.adjustedQuantity ?? l.actualQuantity),
                countedQuantity: Number(l.systemQuantity),
                unitCost: Number(l.unitCost),
              })),
            },
            removedById,
            companyId,
            manager,
          );
        }
      }

      await auditRepo.remove(audit);
    });
  }

  /**
   * The only point where a stock audit's counted variances actually move stock — delegates
   * entirely to the existing StockAdjustmentsService rather than duplicating issue/receive logic.
   * Lines left uncounted (actualQuantity null) are skipped and stay "بانتظار الجرد" indefinitely,
   * carried over to whichever future audit finally counts them.
   */
  async approve(id: string, companyId: string, approverId: string, dto?: ApproveStockAuditDto): Promise<StockAudit> {
    return this.dataSource.transaction(async (manager) => {
      const auditRepo = manager.getRepository(StockAudit);
      const lineRepo = manager.getRepository(StockAuditLine);
      const audit = await auditRepo.findOne({ where: { id, companyId }, relations: ['lines'] });
      if (!audit) throw new NotFoundException('Stock audit not found');
      if (audit.status !== DocumentStatus.CONFIRMED) {
        throw new BadRequestException('Only a submitted (pending-approval) audit can be approved');
      }

      // Per-line admin override of the counted quantity ("كمية المخزون الجديدة"), entered while
      // reviewing the pending audit — defaults to the manager's actualQuantity when left untouched.
      // This final value is what actually gets written to stock below, and is persisted on the
      // line afterward for its locked, read-only display once approved.
      const overrideByProductId = new Map((dto?.lines ?? []).map((l) => [l.productId, l.adjustedQuantity]));
      const countedLines = audit.lines.filter((l) => l.actualQuantity !== null);
      if (countedLines.length > 0) {
        const adjustment = await this.stockAdjustmentsService.create(
          {
            adjustmentDate: audit.auditDate,
            warehouseId: audit.warehouseId,
            reason: `جرد شهري ${audit.documentNumber}`,
            lines: countedLines.map((l) => ({
              productId: l.productId,
              systemQuantity: Number(l.systemQuantity),
              countedQuantity: overrideByProductId.get(l.productId) ?? Number(l.actualQuantity),
              unitCost: Number(l.unitCost),
            })),
          },
          approverId,
          companyId,
          manager,
        );
        audit.stockAdjustmentId = adjustment.id;

        for (const line of countedLines) {
          line.adjustedQuantity = overrideByProductId.get(line.productId) ?? Number(line.actualQuantity);
        }
        await lineRepo.save(countedLines);
      }

      audit.status = DocumentStatus.APPROVED;
      audit.approvedById = approverId;
      audit.approvedAt = new Date();
      return auditRepo.save(audit);
    });
  }
}
