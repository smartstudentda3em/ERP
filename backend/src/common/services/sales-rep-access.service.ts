import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { SalesRepresentative } from '../../modules/parties/entities/sales-representative.entity';

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
