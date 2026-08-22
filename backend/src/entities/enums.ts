export enum DocumentStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
  CLOSED = 'CLOSED',
}

export enum SalesDocumentStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  INVOICED = 'INVOICED',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  CANCELLED = 'CANCELLED',
}

export enum StockMovementType {
  PURCHASE_RECEIPT = 'PURCHASE_RECEIPT',
  SALES_ISSUE = 'SALES_ISSUE',
  SALES_RETURN = 'SALES_RETURN',
  PURCHASE_RETURN = 'PURCHASE_RETURN',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  OPENING_STOCK = 'OPENING_STOCK',
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHEQUE = 'CHEQUE',
  CARD = 'CARD',
  ONLINE = 'ONLINE',
}

export enum ValuationMethod {
  WEIGHTED_AVERAGE = 'WEIGHTED_AVERAGE',
  FIFO = 'FIFO',
}

/** Which unit a sales line was transacted in — the product's base unit, or its package tier. */
export enum SaleUnitKind {
  UNIT = 'UNIT',
  PACKAGE = 'PACKAGE',
}

export enum NumberingResetPeriod {
  NEVER = 'NEVER',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

/** Direct cash-flow model replacing double-entry bookkeeping: every movement is either money
 * coming in or money going out of a treasury account — no debit/credit account pairs. */
export enum CashMovementType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum CashMovementAccount {
  CASH = 'CASH',
  BANK = 'BANK',
  /** A "مندوب" (field sales agent) role's own cash-in-hand pocket — sales they create are routed
   * here instead of the company's real CASH/BANK balance (see sales-invoices.service.ts), scoped
   * per-rep via CashMovement.salesRepresentativeId, until an admin settles/clears it into CASH or
   * BANK via the Treasury transfer modal (see CashMovementsService.createTransfer). */
  REP_TREASURY = 'REP_TREASURY',
}

export enum CashMovementSourceType {
  SALES_INVOICE = 'SALES_INVOICE',
  SALES_PAYMENT = 'SALES_PAYMENT',
  PURCHASE_RECEIPT = 'PURCHASE_RECEIPT',
  SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',
  MANUAL = 'MANUAL',
  /** A partner capital injection — money in that isn't sales revenue, tracked separately so it never inflates the profit/revenue reports. */
  CAPITAL_INJECTION = 'CAPITAL_INJECTION',
  /** A profit distribution paid out to partners — tracked separately from operating expenses so reports can break it out on its own line. */
  DIVIDEND = 'DIVIDEND',
  /** A collection (regular installment or early-settlement lump sum) against an installment plan. */
  INSTALLMENT_PAYMENT = 'INSTALLMENT_PAYMENT',
  /** An internal move of the business's own money between its Cash and Bank accounts — never
   * revenue or an expense, so it's excluded from every P&L report the same way CAPITAL_INJECTION
   * is; see CashMovementsService.createTransfer(). */
  TRANSFER = 'TRANSFER',
  /** Net salaries posted automatically when a monthly payroll run is approved — one row per
   * branch, folded into "المصروفات التشغيلية" (operating expenses) alongside MANUAL entries so
   * salaries are never entered twice; see PayrollService.approve(). */
  PAYROLL = 'PAYROLL',
  /** A payment made against a shipment's cost (deposit, on-account, or final settlement) — kept
   * distinct from PURCHASE_RECEIPT/SUPPLIER_PAYMENT since a shipment has no single supplier of its
   * own (each cargo line can name a different one); see ShipmentPaymentsService. */
  SHIPMENT_PAYMENT = 'SHIPMENT_PAYMENT',
  /** A commission payout to a مندوب or مدير فرع (both are just SalesRepresentative rows,
   * distinguished only by their linked user's role, never a field on the entity itself) —
   * "العمولات المصروفة" on Stationery/Air Conditioning's Expenses screen, "صرف الأرباح" on
   * Printing Press's manager-only "أرباح المدراء والشركاء" tab. Attributed to the beneficiary via
   * CashMovement.salesRepresentativeId, the same way DIVIDEND is attributed to a partner via
   * partnerId; see PartnersTreasuryController's commission-payouts routes. */
  COMMISSION_PAYOUT = 'COMMISSION_PAYOUT',
}

/** How much of a shipment's cost a given payment represents. */
export enum ShipmentPaymentType {
  /** Paid up front, before the shipment is fully costed out. */
  DEPOSIT = 'DEPOSIT',
  /** An additional payment on account, before final settlement. */
  PARTIAL = 'PARTIAL',
  /** Closes out the shipment's remaining balance. */
  FINAL_SETTLEMENT = 'FINAL_SETTLEMENT',
  /** A memo-only record of shipping cost paid — deliberately never posts a CashMovement (see
   * ShipmentPaymentsService), so it tracks total freight spend on a shipment without double
   * counting money that was (or will be) debited through some other real payment. */
  SHIPPING_COST = 'SHIPPING_COST',
}

/** An employee's logged leave/vacation period — see EmployeeLeave entity. */
export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  UNPAID = 'UNPAID',
  OTHER = 'OTHER',
}

/** A customer's eligibility to be sold to on installment — checked only when creating a new
 * InstallmentPlan, never on regular cash/credit sales invoices. */
export enum CustomerCreditStatus {
  RELIABLE = 'RELIABLE',
  BLOCKED = 'BLOCKED',
}

export enum InstallmentInterestType {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export enum InstallmentPlanStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  SETTLED_EARLY = 'SETTLED_EARLY',
}

export enum InstallmentPaymentType {
  /** Collected at contract signing, before the financed schedule even starts. */
  DOWN_PAYMENT = 'DOWN_PAYMENT',
  INSTALLMENT = 'INSTALLMENT',
  EARLY_SETTLEMENT = 'EARLY_SETTLEMENT',
}

export enum WhatsAppMessageType {
  ADMIN_DAILY_REPORT = 'ADMIN_DAILY_REPORT',
  CUSTOMER_REMINDER = 'CUSTOMER_REMINDER',
}

/** Where one import cargo line currently sits, before it's placed on an actual shipment. */
export enum ImportCargoStatus {
  ORDERED = 'ORDERED',
  READY_FOR_SHIPPING = 'READY_FOR_SHIPPING',
  SHIPPED = 'SHIPPED',
}

/** Distinguishes a stock-tracked raw material (the default, every existing product) from a
 * Printing Press "المنتجات" catalog item — a pure sales price-list entry with no stock/package
 * tracking, sharing the same `products` table purely to reuse its selling-price/name plumbing. */
export enum ProductType {
  RAW_MATERIAL = 'RAW_MATERIAL',
  CATALOG_ITEM = 'CATALOG_ITEM',
  /** Air Conditioning only — one row per capacity price tier of a named Service (see the Service
   * entity and ProductsService.createService/updateService). Carries no real stock, exactly like
   * CATALOG_ITEM, and is skipped the same way everywhere stock is issued/received/reported. */
  SERVICE = 'SERVICE',
}
