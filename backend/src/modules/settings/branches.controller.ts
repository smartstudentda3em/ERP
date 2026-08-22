import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { Branch } from './entities/branch.entity';
import { CreateBranchDto, UpdateBranchDto } from './dto/settings.dto';
import { SalesInvoice } from '../sales/sales-invoices/entities/sales-invoice.entity';
import { PurchaseReceipt } from '../inventory/stock-movements/entities/purchase-receipt.entity';
import { Quotation } from '../sales/quotations/entities/quotation.entity';
import { InstallmentPlan } from '../sales/installment-plans/entities/installment-plan.entity';

@Injectable()
export class BranchesService extends CompanyScopedCrudService<Branch> {
  constructor(
    @InjectRepository(Branch) repo: Repository<Branch>,
    @InjectRepository(SalesInvoice) private readonly salesInvoicesRepo: Repository<SalesInvoice>,
    @InjectRepository(PurchaseReceipt) private readonly purchaseReceiptsRepo: Repository<PurchaseReceipt>,
    @InjectRepository(Quotation) private readonly quotationsRepo: Repository<Quotation>,
    @InjectRepository(InstallmentPlan) private readonly installmentPlansRepo: Repository<InstallmentPlan>,
  ) {
    super(repo);
  }

  /** System-wide delete-protection rule: every real trading-document table's `branchId` is
   * `onDelete: "SET NULL"` (a branch tag is informational on those, not something the DB alone
   * should refuse to touch) — left unchecked, deleting a branch with real history would silently
   * strip its attribution from every sales invoice, purchase receipt, quotation, and installment
   * plan it was ever tagged on, corrupting every per-branch report with no warning. This explicit
   * check is what actually stops that; Warehouse/User/Partner/SalesRepresentative/CashMovement tags
   * on a branch stay informational (their own delete paths, if any, are protected separately).
   */
  async removeForCompany(id: string, companyId: string): Promise<void> {
    const [hasInvoices, hasReceipts, hasQuotations, hasInstallments] = await Promise.all([
      this.salesInvoicesRepo.exist({ where: { branchId: id, companyId } }),
      this.purchaseReceiptsRepo.exist({ where: { branchId: id, companyId } }),
      this.quotationsRepo.exist({ where: { branchId: id, companyId } }),
      this.installmentPlansRepo.exist({ where: { branchId: id, companyId } }),
    ]);
    if (hasInvoices || hasReceipts || hasQuotations || hasInstallments) {
      throw new BadRequestException(
        'لا يمكن حذف هذا الفرع — توجد عمليات (فواتير، مشتريات، عروض أسعار، أو تقسيط) مسجلة عليه في النظام.',
      );
    }
    return super.removeForCompany(id, companyId);
  }
}

@ApiTags('Settings - Branches')
@Controller('settings/branches')
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  /** `companyId` query param lets an admin fetch another accessible company's branches while
   * their own active session is elsewhere — needed by the Users & Roles "add user" form's branch
   * picker for a role restricted to one specific company (see Role.restrictedCompanyId), which may
   * not match whatever company the admin currently has active. Only ever honored for a company the
   * caller can actually reach (every company for a true Administrator, else their own companyIds) —
   * never a blind cross-tenant lookup. */
  @Get() @Permissions('settings.branch.view') findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyIdParam?: string,
  ) {
    const companyId =
      companyIdParam && (user.allCompanies || user.companyIds.includes(companyIdParam))
        ? companyIdParam
        : user.companyId!;
    return this.service.findAllForCompany(companyId);
  }
  @Get(':id') @Permissions('settings.branch.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('settings.branch.create') create(
    @Body() dto: CreateBranchDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.branch.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.branch.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
