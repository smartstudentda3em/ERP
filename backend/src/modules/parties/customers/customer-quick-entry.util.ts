import { EntityManager } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';

export interface QuickCustomerInput {
  name: string;
  phone: string;
  address?: string | null;
}

/**
 * Resolves a typed Name/Phone/Address triple (Air Conditioning's "type it directly instead of
 * searching" quick-entry flow, on both Sales Invoices and Installment Plans) to a real Customer
 * row — reusing an existing customer by phone match within the same company so a repeat buyer
 * accumulates one balance/history instead of spawning a new record every sale, and refreshing
 * their name/address to whatever was just typed. Always run against the caller's own transaction
 * manager so a later failure (e.g. insufficient stock) rolls the new/updated customer back too.
 */
export async function findOrCreateQuickCustomer(
  manager: EntityManager,
  numberingSeriesService: NumberingSeriesService,
  companyId: string,
  input: QuickCustomerInput,
): Promise<Customer> {
  const repo = manager.getRepository(Customer);
  const existing = await repo.findOne({ where: { companyId, mobile: input.phone } });
  if (existing) {
    let changed = false;
    if (input.name && existing.name !== input.name) {
      existing.name = input.name;
      changed = true;
    }
    if (input.address && existing.address !== input.address) {
      existing.address = input.address;
      changed = true;
    }
    return changed ? repo.save(existing) : existing;
  }

  const code = (await numberingSeriesService.tryGetNextNumber(companyId, 'CUSTOMER', manager)) ?? `CUST-${Date.now()}`;
  return repo.save(
    repo.create({ companyId, code, name: input.name, mobile: input.phone, address: input.address ?? undefined }),
  );
}

/**
 * Cash quick-sales are explicitly never added to the Customers list (see the Sales Invoice
 * requirement this backs) — every one is attributed instead to a single shared placeholder
 * Customer row per company, lazily get-or-created here rather than seeded up front, so a
 * production deploy never needs a manual seed-script run. Mirrors Printing Press's WALKIN
 * customer (see run-seed.ts), but scoped to its own 'WALKIN-AC' code so the two never collide —
 * Press's WALKIN absorbs every sale with no per-customer tracking at all, while this one exists
 * purely as an FK placeholder for AC's cash branch (the real identity lives in the invoice's own
 * free-text customerName/customerPhone/customerAddress columns).
 */
export async function findOrCreateWalkInCustomer(manager: EntityManager, companyId: string): Promise<Customer> {
  const repo = manager.getRepository(Customer);
  const existing = await repo.findOne({ where: { companyId, code: 'WALKIN-AC' } });
  if (existing) return existing;
  return repo.save(
    repo.create({ companyId, code: 'WALKIN-AC', name: 'عميل نقدي (تكييفات) / Cash Customer', openingBalance: 0 }),
  );
}
