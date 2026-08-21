import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { SalesRepresentative } from '../../modules/parties/entities/sales-representative.entity';

/** Mirrors SALES_REP_ROLE_NAME in backend/src/modules/users/users.service.ts. */
const SALES_REP_ROLE_NAME = 'مندوب';
/** Mirrors BRANCH_MANAGER_ROLE_NAME in backend/src/modules/users/users.service.ts. */
const BRANCH_MANAGER_ROLE_NAME = 'مدير فرع';

/**
 * Enforces that non-admin callers can only ever attribute a sales transaction (quotation, invoice,
 * payment) to themselves — never to another sales representative or user, no matter what the
 * client sent. Always re-derives the caller's admin status and own linked rep fresh from the DB
 * (never trusts the JWT's cached permissions for this), mirroring the same defense-in-depth
 * convention already used by SystemService.factoryReset().
 */
@Injectable()
export class SalesRepAccessService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SalesRepresentative) private readonly repRepo: Repository<SalesRepresentative>,
  ) {}

  async isSystemAdmin(userId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return user?.roles?.some((role) => role.isSystemRole) ?? false;
  }

  /** True when the CALLER themselves (not some other rep's id) holds the "مندوب" role — used to
   * decide whether purchase-cost/margin fields must be omitted from a product list response, since
   * a مندوب must never receive that data at all, even in a raw API response they'd never render
   * (see ProductsService.findAllForCompany/findCatalogForCompany/findSellableRawMaterialsForCompany,
   * consumed directly by the Sales Invoice line editor). */
  async isCallerSalesRep(userId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['roles'] });
    return user?.roles?.some((r) => r.name === SALES_REP_ROLE_NAME) ?? false;
  }

  /** True when the CALLER holds the "مدير فرع" role — used by SalesInvoicesService.findAll() to
   * decide whether the zero-commission filter applies. Re-derives the role from the DB rather than
   * trusting a `dashboard.view`/permission-code inference (the previous approach), since that
   * permission is no longer a reliable signal once مدير فرع stops holding it. */
  async isCallerBranchManager(userId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['roles'] });
    return user?.roles?.some((r) => r.name === BRANCH_MANAGER_ROLE_NAME) ?? false;
  }

  /** True when `salesRepresentativeId` is linked to a "مندوب" (field sales agent) login account —
   * shared by SalesInvoicesService (an invoice's own paid amount) and SalesPaymentsService (a
   * follow-up receipt) to decide whether a payment routes into that rep's own
   * CashMovementAccount.REP_TREASURY pocket instead of the company's real CASH/BANK, and to skip
   * the usual paymentAccount requirement for them (they never choose an account at all). */
  async isSalesAgentRep(salesRepresentativeId: string | null | undefined): Promise<boolean> {
    if (!salesRepresentativeId) return false;
    const rep = await this.repRepo.findOne({ where: { id: salesRepresentativeId } });
    if (!rep?.userId) return false;
    const user = await this.userRepo.findOne({ where: { id: rep.userId }, relations: ['roles'] });
    return user?.roles?.some((r) => r.name === SALES_REP_ROLE_NAME) ?? false;
  }

  /** For quotations/payments: a single salesRepresentativeId field. */
  async resolveSalesRepresentativeId(
    userId: string,
    requestedId: string | null | undefined,
    companyId: string,
  ): Promise<string | null> {
    const isAdmin = await this.isSystemAdmin(userId);
    if (isAdmin) return requestedId ?? null;
    // Scoped to the active company — a user with access to multiple companies may have a
    // different rep profile in each, and their rep in company A must never leak into company B.
    const ownRep = await this.repRepo.findOne({ where: { userId, companyId } });
    return ownRep?.id ?? null;
  }

  /** For sales invoices: the combined "rep or user" owner field. */
  async resolveInvoiceOwner(
    userId: string,
    requested: { salesRepresentativeId?: string | null; createdById?: string | null },
    companyId: string,
  ): Promise<{ salesRepresentativeId: string | null; createdById: string }> {
    const isAdmin = await this.isSystemAdmin(userId);
    if (isAdmin) {
      return {
        salesRepresentativeId: requested.salesRepresentativeId ?? null,
        createdById: requested.createdById || userId,
      };
    }
    const ownRep = await this.repRepo.findOne({ where: { userId, companyId } });
    return { salesRepresentativeId: ownRep?.id ?? null, createdById: userId };
  }

  /** For read-side filters (e.g. the Sales report's "الفرع" dropdown): non-admins are pinned to
   * their own rep's branch and can never widen the filter to another branch, no matter what the
   * client requests. A non-admin with no linked rep (or a rep with no branch) sees every branch,
   * matching resolveInvoiceOwner's same fallback rather than blocking them outright. */
  async resolveBranchId(userId: string, requestedBranchId: string | null | undefined, companyId: string): Promise<string | null> {
    const isAdmin = await this.isSystemAdmin(userId);
    if (isAdmin) return requestedBranchId ?? null;
    const ownRep = await this.repRepo.findOne({ where: { userId, companyId } });
    return ownRep?.branchId ?? null;
  }
}
