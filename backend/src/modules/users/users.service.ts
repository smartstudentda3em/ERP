import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, In, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { UserCompany } from './entities/user-company.entity';
import { CreateUserDto, UpdateUserDto, UpdateOwnProfileDto } from './dto/user.dto';
import { SalesRepresentative } from '../parties/entities/sales-representative.entity';
import { Employee } from '../hr/entities/employee.entity';
import { NumberingSeriesService } from '../settings/numbering-series.controller';
import { Quotation } from '../sales/quotations/entities/quotation.entity';
import { SalesInvoice } from '../sales/sales-invoices/entities/sales-invoice.entity';
import { SalesPayment } from '../sales/sales-payments/entities/sales-payment.entity';
import { PurchaseReceipt } from '../inventory/stock-movements/entities/purchase-receipt.entity';
import { StockAudit } from '../inventory/stock-movements/entities/stock-audit.entity';
import { PayrollRun } from '../hr/entities/payroll-run.entity';
import { CashMovement } from '../treasury/entities/cash-movement.entity';
import { SalesDocumentStatus } from '../../entities/enums';
import { QuotationsService } from '../sales/quotations/quotations.service';
import { SalesInvoicesService } from '../sales/sales-invoices/sales-invoices.service';
import { PurchaseReceiptsService } from '../inventory/stock-movements/purchase-receipts.service';
import { StockAuditsService } from '../inventory/stock-movements/stock-audits.service';
import { PayrollService } from '../hr/payroll.service';

/** The one permanent, unmodifiable Administrator account — kept in sync with the seed default in run-seed.ts. */
const PROTECTED_ADMIN_EMAIL = 'aymanmakroum83@gmail.com';

/** The exact role name the "add user" form treats as a branch manager — see
 * UsersRolesPage.tsx's conditional branch-select field. Kept as a plain name match (not
 * isSystemRole/restrictedCompanyId) since that's literally what was asked for and every other
 * role name in this system is free-text anyway. */
const BRANCH_MANAGER_ROLE_NAME = 'مدير فرع';

/** Applied once, only when auto-provisioning a brand-new SalesRepresentative row (never on repair
 * of an existing one, so it can never clobber a rate an admin already customized). */
const BRANCH_MANAGER_DEFAULT_COMMISSION_RATE = 5;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserCompany) private readonly userCompanyRepo: Repository<UserCompany>,
    @InjectRepository(SalesRepresentative) private readonly salesRepRepo: Repository<SalesRepresentative>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly quotationsService: QuotationsService,
    private readonly salesInvoicesService: SalesInvoicesService,
    private readonly purchaseReceiptsService: PurchaseReceiptsService,
    private readonly stockAuditsService: StockAuditsService,
    private readonly payrollService: PayrollService,
  ) {}

  /** Attaches each user's accessible-company ACL (see UserCompany) — not a column on User itself. */
  private async withCompanyIds(users: User[]): Promise<(User & { companyIds: string[] })[]> {
    if (!users.length) return [];
    const links = await this.userCompanyRepo.find({ where: { userId: In(users.map((u) => u.id)) } });
    const byUser = new Map<string, string[]>();
    for (const link of links) {
      byUser.set(link.userId, [...(byUser.get(link.userId) ?? []), link.companyId]);
    }
    return users.map((u) => ({ ...u, companyIds: byUser.get(u.id) ?? [] }));
  }

  private isGlobalUser(user: { roles?: Role[] }): boolean {
    return user.roles?.some((r) => r.isSystemRole) ?? false;
  }

  /** A role like "مدير فرع - المطبعة" (Role.restrictedCompanyId set) hard-locks any user given it
   * to that one company — overriding whatever companyIds the caller sent, so this can never be
   * bypassed by a form that forgets to restrict the picker. Returns the caller's own companyIds
   * unchanged when none of the resolved roles carry a restriction. */
  private enforceRoleCompanyRestriction(roles: Role[], companyIds: string[] | undefined): string[] | undefined {
    const restricted = roles.find((r) => r.restrictedCompanyId);
    if (!restricted) return companyIds;
    return [restricted.restrictedCompanyId!];
  }

  /**
   * When a user is saved with the "مدير فرع" role and a branch selected, auto-provisions (or
   * repairs) a matching SalesRepresentative row so they immediately show up under "مدراء الفروع"
   * for an admin to open and finish the remaining commission/target data — without this, that link
   * had to be created by hand as a separate manual step after the user already existed. Silently
   * does nothing for any other role, or when no branch was chosen.
   */
  private async syncBranchManagerRepresentative(user: User, roles: Role[], branchId: string | null): Promise<void> {
    const branchManagerRole = roles.find((r) => r.name === BRANCH_MANAGER_ROLE_NAME);
    if (!branchManagerRole || !branchId) return;
    const companyId = branchManagerRole.restrictedCompanyId ?? user.companyId;
    if (!companyId) return;

    const existing = await this.salesRepRepo.findOne({ where: { userId: user.id } });
    if (existing) {
      existing.branchId = branchId;
      existing.companyId = companyId;
      await this.salesRepRepo.save(existing);
      return;
    }

    const code =
      (await this.numberingSeriesService.tryGetNextNumber(companyId, 'SALES_REPRESENTATIVE')) || `REP-${Date.now()}`;
    await this.salesRepRepo.save(
      this.salesRepRepo.create({
        companyId,
        code,
        name: user.fullName,
        phone: user.phone ?? null,
        email: user.email ?? undefined,
        branchId,
        userId: user.id,
        // Default general commission rate for a freshly auto-provisioned branch manager — the admin
        // can still override it afterwards via RepresentativesListTab; this only avoids a silent 0%
        // that would otherwise leave every commission report empty until someone remembers to set it.
        commissionRate: BRANCH_MANAGER_DEFAULT_COMMISSION_RATE,
      }),
    );
  }

  /**
   * Same auto-provisioning idea as syncBranchManagerRepresentative, but for the HR module's
   * Employee entity — lets a logged-in branch manager's own payroll data be resolved from their
   * userId instead of requiring an admin to manually link an Employee row after the fact. The admin
   * still edits the real baseSalary afterwards via EmployeesPage; this only guarantees the link exists.
   */
  private async syncBranchManagerEmployee(user: User, roles: Role[], branchId: string | null): Promise<void> {
    const branchManagerRole = roles.find((r) => r.name === BRANCH_MANAGER_ROLE_NAME);
    if (!branchManagerRole || !branchId) return;
    const companyId = branchManagerRole.restrictedCompanyId ?? user.companyId;
    if (!companyId) return;

    const existing = await this.employeeRepo.findOne({ where: { userId: user.id } });
    if (existing) {
      existing.branchId = branchId;
      existing.companyId = companyId;
      await this.employeeRepo.save(existing);
      return;
    }

    await this.employeeRepo.save(
      this.employeeRepo.create({
        companyId,
        branchId,
        name: user.fullName,
        jobTitle: BRANCH_MANAGER_ROLE_NAME,
        baseSalary: 0,
        userId: user.id,
      }),
    );
  }

  /**
   * Administrators (isSystemRole) are visible from every company context; everyone else is only
   * visible where they hold a UserCompany row for the caller's active company — this is what keeps
   * a Manager created under Company A from leaking into Company B's Users & Roles list.
   */
  async findAllForCompany(companyId: string): Promise<(User & { companyIds: string[] })[]> {
    const users = await this.userRepo.find({ relations: ['roles'], order: { createdAt: 'DESC' } });
    const withCompanies = await this.withCompanyIds(users);
    return withCompanies.filter((u) => this.isGlobalUser(u) || u.companyIds.includes(companyId));
  }

  async findOne(id: string): Promise<User & { companyIds: string[] }> {
    const user = await this.userRepo.findOne({ where: { id }, relations: ['roles'] });
    if (!user) throw new NotFoundException('User not found');
    const [withCompanies] = await this.withCompanyIds([user]);
    return withCompanies;
  }

  /** Same rule as findAllForCompany applied to a single lookup: a user outside the caller's active
   * company 404s exactly like one that doesn't exist, so ids can't be probed cross-company —
   * unless the caller is themselves a true Administrator (isGlobalUser), who — same as they can
   * already see every user regardless of active company in findAllForCompany — can also look up,
   * edit, or delete any of them without first switching into whichever company that user happens
   * to be scoped to. Re-checked fresh against the DB (not the JWT's cached isSystemRole) since this
   * gates a real authorization decision. */
  async findOneScoped(id: string, companyId: string, callerId: string): Promise<User & { companyIds: string[] }> {
    const [user, caller] = await Promise.all([this.findOne(id), this.findOne(callerId)]);
    if (!this.isGlobalUser(user) && !this.isGlobalUser(caller) && !user.companyIds.includes(companyId)) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** "Account Settings" — the profile the currently logged-in user is looking at for themself,
   * regardless of role (Administrator included). Deliberately bypasses findOneScoped()'s
   * active-company visibility check, since a user must always be able to see their own account
   * even if, say, they're currently switched into a company they'd otherwise have no ACL row for. */
  async getOwnProfile(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.stripPasswordHash(user);
  }

  /**
   * Self-service "Account Settings" update — every role, including the protected primary
   * Administrator, may change their own phone/email this way. Deliberately never touches
   * roles/isActive/companyId/branchId/companyIds/passwordHash (password changes go through the
   * separate AuthService.changePassword(), which requires the caller's current password) and
   * deliberately does NOT apply the PROTECTED_ADMIN_EMAIL block that UsersService.update() enforces
   * — that block exists to stop an admin editing/deleting *someone else's* protected account, not
   * to stop the protected account's own owner from updating their own contact details.
   */
  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.email && dto.email.toLowerCase() !== user.email?.toLowerCase()) {
      const existing = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
      if (existing) throw new ConflictException('Email already in use');
      user.email = dto.email.toLowerCase();
    }

    const trimmedPhone = dto.phone !== undefined ? dto.phone.trim() : undefined;
    if (trimmedPhone !== undefined && trimmedPhone !== user.phone) {
      const existing = await this.userRepo.findOne({ where: { phone: trimmedPhone } });
      if (existing) throw new ConflictException('Phone number already in use');
      user.phone = trimmedPhone;
    }

    const savedUser = await this.userRepo.save(user);
    return this.stripPasswordHash(savedUser);
  }

  async create(dto: CreateUserDto): Promise<User> {
    // Trimmed at the point of writing so a stored phone/password is always the canonical value
    // login() (which trims the same way) will actually be looking/verifying for — an accidental
    // leading/trailing space typed into either field here must never make the account unloginable.
    const phone = dto.phone.trim();
    const password = dto.password.trim();

    const existingPhone = await this.userRepo.findOne({ where: { phone } });
    if (existingPhone) throw new ConflictException('Phone number already in use');

    if (dto.email) {
      const existingEmail = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
      if (existingEmail) throw new ConflictException('Email already in use');
    }

    const roles = dto.roleIds?.length
      ? await this.roleRepo.find({ where: { id: In(dto.roleIds) } })
      : [];

    const user = this.userRepo.create({
      email: dto.email ? dto.email.toLowerCase() : null,
      fullName: dto.fullName,
      passwordHash: await argon2.hash(password),
      phone,
      companyId: dto.companyId ?? null,
      branchId: dto.branchId ?? null,
      roles,
    });
    const savedUser = await this.userRepo.save(user);

    // Ignored entirely for a true Administrator — that role has implicit access to every company
    // via isSystemRole, so no ACL rows are needed (or checked) for it. See AuthService.extractCompanyIds().
    const enforcedCompanyIds = this.enforceRoleCompanyRestriction(roles, dto.companyIds);
    if (enforcedCompanyIds?.length) {
      await this.userCompanyRepo.save(
        enforcedCompanyIds.map((companyId) => this.userCompanyRepo.create({ userId: savedUser.id, companyId })),
      );
    }

    await this.syncBranchManagerRepresentative(savedUser, roles, dto.branchId ?? null);
    await this.syncBranchManagerEmployee(savedUser, roles, dto.branchId ?? null);

    return this.stripPasswordHash(savedUser);
  }

  async update(id: string, dto: UpdateUserDto, companyId: string, callerId: string): Promise<User> {
    const user = await this.findOneScoped(id, companyId, callerId);
    if (user.email?.toLowerCase() === PROTECTED_ADMIN_EMAIL) {
      throw new BadRequestException('The primary system administrator account cannot be edited');
    }

    if (dto.email && dto.email.toLowerCase() !== user.email?.toLowerCase()) {
      const existing = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
      if (existing) throw new ConflictException('Email already in use');
      user.email = dto.email.toLowerCase();
    }

    // Trimmed the same way create()/login() trim — an admin pasting a phone or reset password with
    // an accidental leading/trailing space must not silently break the account's next login.
    const trimmedPhone = dto.phone?.trim();
    if (trimmedPhone && trimmedPhone !== user.phone) {
      const existing = await this.userRepo.findOne({ where: { phone: trimmedPhone } });
      if (existing) throw new ConflictException('Phone number already in use');
    }

    if (dto.roleIds) {
      user.roles = await this.roleRepo.find({ where: { id: In(dto.roleIds) } });
    }

    // Admin-initiated reset — only ever set when the caller actually typed a new password, since
    // an empty/omitted field must leave the existing hash untouched.
    if (dto.password) {
      user.passwordHash = await argon2.hash(dto.password.trim());
    }

    Object.assign(user, {
      fullName: dto.fullName ?? user.fullName,
      phone: trimmedPhone ?? user.phone,
      isActive: dto.isActive ?? user.isActive,
      companyId: dto.companyId ?? user.companyId,
      branchId: dto.branchId ?? user.branchId,
    });
    const savedUser = await this.userRepo.save(user);

    // Present (even an empty array) means "replace the full set" — same convention as roleIds,
    // just done as a delete+reinsert since companyIds isn't a relation TypeORM can diff for us.
    // `user.roles` already reflects any role change made above, so a switch onto/off a
    // restricted role takes effect in the same request that changed it.
    if (dto.companyIds) {
      const enforcedCompanyIds = this.enforceRoleCompanyRestriction(user.roles, dto.companyIds);
      await this.userCompanyRepo.delete({ userId: savedUser.id });
      if (enforcedCompanyIds?.length) {
        await this.userCompanyRepo.save(
          enforcedCompanyIds.map((companyId) => this.userCompanyRepo.create({ userId: savedUser.id, companyId })),
        );
      }
    }

    await this.syncBranchManagerRepresentative(savedUser, savedUser.roles, savedUser.branchId);
    await this.syncBranchManagerEmployee(savedUser, savedUser.roles, savedUser.branchId);

    return this.stripPasswordHash(savedUser);
  }

  /**
   * Permanently deletes a user AND every business record they created — an explicit, informed
   * choice (this is real destruction of quotations/invoices/payments/receipts/audits/payroll runs,
   * not just the login). `createdById`/`approvedById` on those entities are plain uuid columns, not
   * real foreign keys, so Postgres would never block a bare `DELETE FROM users` — but a bare delete
   * would also leave every stock movement, cash movement, and invoice/payment balance those records
   * touched uncorrected. Each entity's own remove()/cancel() is called instead of raw deletes so the
   * existing, already-correct stock/cash reversal logic in each service runs exactly as it would if
   * an admin deleted those records one at a time by hand.
   *
   * Standalone (non-invoice) sales payments have no service-level remove() at all, so their
   * cash-movement reversal and invoice amountPaid/status rollback is done directly here.
   *
   * Each sub-service call commits its own transaction, so this is NOT one atomic all-or-nothing
   * operation — if a later step fails, earlier deletions already happened for real. That matches how
   * a human admin manually deleting these records one by one would behave, and avoids the deadlock
   * risk of nesting this many independent service transactions inside one outer transaction.
   */
  async remove(id: string, companyId: string, callerId: string): Promise<void> {
    const user = await this.findOneScoped(id, companyId, callerId);
    if (user.email?.toLowerCase() === PROTECTED_ADMIN_EMAIL) {
      throw new BadRequestException('The primary system administrator account cannot be deleted');
    }

    const quotations = await this.dataSource.getRepository(Quotation).find({ where: { createdById: id } });
    for (const q of quotations) {
      await this.quotationsService.remove(q.id, q.companyId, true);
    }

    // Reverses stock (SALES_RETURN) and deletes each invoice's own SalesPayment + CashMovement rows.
    const invoices = await this.dataSource.getRepository(SalesInvoice).find({ where: { createdById: id } });
    for (const inv of invoices) {
      await this.salesInvoicesService.remove(inv.id, callerId, inv.companyId);
    }

    // Standalone payments this user recorded — including ones against an invoice created by someone
    // else (so not covered by the invoice loop above). Anything already deleted as part of an
    // invoice this loop's own createdById-scoped query wouldn't have picked up anyway (invoices
    // above are scoped to this user's own invoices; this covers every payment this user recorded,
    // whoever's invoice it was applied to).
    const payments = await this.dataSource.getRepository(SalesPayment).find({ where: { createdById: id } });
    for (const payment of payments) {
      await this.dataSource.transaction(async (manager) => {
        const paymentRepo = manager.getRepository(SalesPayment);
        const stillExists = await paymentRepo.findOne({ where: { id: payment.id } });
        if (!stillExists) return; // already removed via its invoice's own cascade above

        if (payment.invoiceId) {
          const invoiceRepo = manager.getRepository(SalesInvoice);
          const invoice = await invoiceRepo.findOne({ where: { id: payment.invoiceId } });
          if (invoice) {
            const remaining = Math.max(0, Number(invoice.amountPaid) - Number(payment.amount));
            invoice.amountPaid = remaining;
            invoice.status =
              remaining <= 0
                ? SalesDocumentStatus.CONFIRMED
                : remaining < Number(invoice.grandTotal)
                  ? SalesDocumentStatus.PARTIALLY_PAID
                  : SalesDocumentStatus.PAID;
            await invoiceRepo.save(invoice);
          }
        }
        if (payment.cashMovementId) {
          await manager.getRepository(CashMovement).delete({ id: payment.cashMovementId });
        }
        await paymentRepo.delete({ id: payment.id });
      });
    }

    const receipts = await this.dataSource.getRepository(PurchaseReceipt).find({ where: { createdById: id } });
    for (const r of receipts) {
      await this.purchaseReceiptsService.remove(r.id, r.companyId, callerId);
    }

    const audits = await this.dataSource.getRepository(StockAudit).find({ where: { createdById: id } });
    for (const a of audits) {
      await this.stockAuditsService.remove(a.id, a.companyId, callerId);
    }

    const payrollRuns = await this.dataSource
      .getRepository(PayrollRun)
      .find({ where: [{ createdById: id }, { approvedById: id }] });
    for (const run of payrollRuns) {
      await this.payrollService.remove(run.id, run.companyId);
    }

    // UserCompany and Session rows cascade automatically (onDelete: 'CASCADE' FKs); any
    // SalesRepresentative row linking to this user has its userId set to null automatically
    // (onDelete: 'SET NULL') rather than being deleted itself.
    await this.userRepo.delete({ id });
  }

  // save() returns whatever fields were actually set on the in-memory entity, regardless of
  // passwordHash's { select: false } — that option only suppresses the column on find/findOne
  // query results, not on an entity object the caller already populated. Every write path that
  // touches passwordHash (create, and update whenever a password reset was requested) must strip
  // it back out before the controller serializes the response, or the argon2 hash leaks over the API.
  private stripPasswordHash(user: User): User {
    const { passwordHash: _passwordHash, ...rest } = user;
    return rest as User;
  }
}
