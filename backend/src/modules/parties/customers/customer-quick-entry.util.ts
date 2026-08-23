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
 * searching" quick-entry flow, on Sales Invoices — every sale type, cash included — and
 * Installment Plans) to a real Customer row — reusing an existing customer by phone match within
 * the same company so a repeat buyer accumulates one balance/history instead of spawning a new
 * record every sale, and refreshing their name/address to whatever was just typed. Always run
 * against the caller's own transaction manager so a later failure (e.g. insufficient stock) rolls
 * the new/updated customer back too. This is what makes the Customers list show each buyer's real
 * name/mobile/address instead of one shared "walk-in" placeholder absorbing every cash sale.
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
