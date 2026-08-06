import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockAudit, StockAuditLine } from './entities/stock-audit.entity';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { DocumentStatus } from '../../../entities/enums';
import { ApproveStockAuditDto, CreateStockAuditDto, UpdateStockAuditDto } from './dto/stock-audit.dto';
import { Warehouse } from '../../settings/entities/warehouse.entity';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';

@Injectable()
export class StockAuditsService {
  constructor(
    @InjectRepository(StockAudit) private readonly repo: Repository<StockAudit>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockAdjustmentsService: StockAdjustmentsService,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {}

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
