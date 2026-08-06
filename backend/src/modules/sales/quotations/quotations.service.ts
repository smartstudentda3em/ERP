import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Quotation, QuotationLine } from './entities/quotation.entity';
import { CreateQuotationDto, UpdateQuotationDto } from './dto/quotation.dto';
import { computeDocumentTotals, computeLine } from '../../../common/utils/pricing';
import { SalesDocumentStatus } from '../../../entities/enums';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { SalesRepAccessService } from '../../../common/services/sales-rep-access.service';
import { SalesInvoicesService } from '../sales-invoices/sales-invoices.service';
import { SalesInvoice } from '../sales-invoices/entities/sales-invoice.entity';

/** Once a quotation has moved past this set of statuses, editing/deleting it is restricted to a
 * true Administrator — mirrors the request's "مسودة/معلق يعدّل بحرية، مقبول/محوّل مقيّد بالأدمن". */
const FREELY_EDITABLE_STATUSES = [SalesDocumentStatus.DRAFT];
/** A quotation already converted (or dead) can never be converted again. */
const NON_CONVERTIBLE_STATUSES = [
  SalesDocumentStatus.INVOICED,
  SalesDocumentStatus.PAID,
  SalesDocumentStatus.PARTIALLY_PAID,
  SalesDocumentStatus.CANCELLED,
];

@Injectable()
export class QuotationsService {
  constructor(
    @InjectRepository(Quotation) private readonly repo: Repository<Quotation>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly salesRepAccess: SalesRepAccessService,
    private readonly salesInvoicesService: SalesInvoicesService,
  ) {}

  /** Branch-scoped exactly like getSalesLines()/resolveBranchId(): a non-admin caller pinned to a
   * branch (via their own linked SalesRepresentative) only ever sees that branch's quotations —
   * an admin, or a non-admin with no branch, sees every quotation as before. */
  async findAll(companyId: string, userId: string) {
    const branchId = await this.salesRepAccess.resolveBranchId(userId, undefined, companyId);
    return this.repo.find({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      relations: ['customer', 'salesRepresentative'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<Quotation> {
    const quotation = await this.repo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.product', 'customer', 'salesRepresentative'],
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    return quotation;
  }

  async create(dto: CreateQuotationDto, createdById: string, companyId: string): Promise<Quotation> {
    // Non-admins can never attribute a quotation to anyone but themselves — see
    // SalesRepAccessService; the client-submitted salesRepresentativeId is ignored for them.
    const salesRepresentativeId = await this.salesRepAccess.resolveSalesRepresentativeId(
      createdById,
      dto.salesRepresentativeId,
      companyId,
    );
    // A non-admin can never attribute a quotation to a branch other than their own — mirrors the
    // rep/owner overrides above.
    const branchId = await this.salesRepAccess.resolveBranchId(createdById, dto.branchId, companyId);

    // Quotations carry no discount/tax — line totals are simply quantity × unit price.
    const linesNoDiscountOrTax = dto.lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    }));
    const totals = computeDocumentTotals(linesNoDiscountOrTax);
    const documentNumber = await this.numberingSeriesService.getNextNumber(companyId, 'QUOTATION');

    const quotation = this.repo.create({
      documentNumber,
      quotationDate: dto.quotationDate,
      validUntil: dto.validUntil ?? null,
      customerId: dto.customerId,
      companyId,
      branchId,
      salesRepresentativeId,
      status: SalesDocumentStatus.DRAFT,
      notes: dto.notes ?? null,
      createdById,
      subtotal: totals.subtotal,
      grandTotal: totals.grandTotal,
      lines: dto.lines.map((line, i) => {
        const computed = computeLine(linesNoDiscountOrTax[i]);
        return Object.assign(new QuotationLine(), {
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: computed.lineTotal,
        });
      }),
    });

    return this.repo.save(quotation);
  }

  async confirm(id: string, companyId: string): Promise<Quotation> {
    const quotation = await this.findOne(id, companyId);
    quotation.status = SalesDocumentStatus.CONFIRMED;
    return this.repo.save(quotation);
  }

  /** Once accepted/converted, only a true Administrator may still edit or delete it — keeps a
   * financially-consequential record from being casually altered by a regular sales user. */
  private assertMayModify(quotation: Quotation, isSystemRole: boolean): void {
    if (!FREELY_EDITABLE_STATUSES.includes(quotation.status) && !isSystemRole) {
      throw new ForbiddenException(
        'Only an administrator may edit or delete a quotation that is no longer a draft',
      );
    }
  }

  async update(id: string, dto: UpdateQuotationDto, companyId: string, isSystemRole: boolean): Promise<Quotation> {
    return this.dataSource.transaction(async (manager) => {
      const quotationRepo = manager.getRepository(Quotation);
      const lineRepo = manager.getRepository(QuotationLine);
      const quotation = await quotationRepo.findOne({ where: { id, companyId }, relations: ['lines'] });
      if (!quotation) throw new NotFoundException('Quotation not found');
      this.assertMayModify(quotation, isSystemRole);

      if (dto.quotationDate !== undefined) quotation.quotationDate = dto.quotationDate;
      if (dto.validUntil !== undefined) quotation.validUntil = dto.validUntil ?? null;
      if (dto.customerId !== undefined) quotation.customerId = dto.customerId;
      if (dto.branchId !== undefined) quotation.branchId = dto.branchId ?? null;
      if (dto.salesRepresentativeId !== undefined) quotation.salesRepresentativeId = dto.salesRepresentativeId ?? null;
      if (dto.notes !== undefined) quotation.notes = dto.notes ?? null;

      if (dto.lines) {
        const linesNoDiscountOrTax = dto.lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice }));
        const totals = computeDocumentTotals(linesNoDiscountOrTax);
        quotation.subtotal = totals.subtotal;
        quotation.grandTotal = totals.grandTotal;

        // Delete-then-recreate rather than patching in place — the incoming set of products can
        // freely add/remove/reorder lines, so there's no stable identity to diff against.
        await lineRepo.delete({ quotationId: id });
        quotation.lines = dto.lines.map((line, i) => {
          const computed = computeLine(linesNoDiscountOrTax[i]);
          return lineRepo.create({
            quotationId: id,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: computed.lineTotal,
          });
        });
      }

      return quotationRepo.save(quotation);
    });
  }

  async remove(id: string, companyId: string, isSystemRole: boolean): Promise<void> {
    const quotation = await this.findOne(id, companyId);
    this.assertMayModify(quotation, isSystemRole);
    await this.repo.remove(quotation);
  }

  /**
   * Converts an accepted quotation directly into a Sales Invoice — reuses
   * SalesInvoicesService.create() rather than duplicating its stock/COGS/numbering logic. Picks
   * the company's default warehouse (falling back to any warehouse it has) since quotations don't
   * carry one themselves. Marks the quotation INVOICED so it can never be converted twice.
   */
  async convertToInvoice(id: string, companyId: string, createdById: string): Promise<SalesInvoice> {
    const quotation = await this.findOne(id, companyId);
    if (NON_CONVERTIBLE_STATUSES.includes(quotation.status)) {
      throw new BadRequestException('This quotation has already been converted or is no longer active');
    }

    const warehouseRow = await this.dataSource
      .createQueryBuilder()
      .select('w.id', 'id')
      .from('warehouses', 'w')
      .where('w."companyId" = :companyId', { companyId })
      .orderBy('w."isDefault"', 'DESC')
      .getRawOne();
    if (!warehouseRow) throw new BadRequestException('No warehouse configured for this company');

    const invoice = await this.salesInvoicesService.create(
      {
        invoiceDate: new Date().toISOString().slice(0, 10),
        customerId: quotation.customerId,
        warehouseId: warehouseRow.id,
        companyId,
        branchId: quotation.branchId ?? undefined,
        salesRepresentativeId: quotation.salesRepresentativeId ?? undefined,
        notes: quotation.notes ?? undefined,
        lines: quotation.lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        })),
      },
      createdById,
      companyId,
    );

    quotation.status = SalesDocumentStatus.INVOICED;
    await this.repo.save(quotation);

    return invoice;
  }
}
