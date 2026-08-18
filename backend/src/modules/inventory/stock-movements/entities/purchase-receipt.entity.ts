import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Product } from "../../products/entities/product.entity";
import { Warehouse } from "../../../settings/entities/warehouse.entity";
import { Supplier } from "../../../parties/suppliers/entities/supplier.entity";
import { Company } from "../../../settings/entities/company.entity";
import { Branch } from "../../../settings/entities/branch.entity";

/**
 * Stage 2 of the two-step product workflow: recording an actual delivery/shipment for a product
 * that was already defined (Stage 1, no pricing) via the Products screen. Feeds the weighted-
 * average StockService engine and refreshes the product's suggested prices — never the other
 * way around, so re-pricing a future shipment never requires touching the product record itself.
 */
@Entity("purchase_receipts")
@Unique(["companyId", "documentNumber"])
export class PurchaseReceipt extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({
    type: "varchar",
    length: 50,
  })
  documentNumber: string;

  @Column({ type: "date" })
  receiptDate: string;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column("uuid")
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouseId" })
  warehouse: Warehouse;

  @Column("uuid")
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier;

  /** Printing Press only — which branch this purchase was made for; other companies leave it null. */
  @Column("uuid", { nullable: true })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "branchId" })
  branch: Branch | null;

  /** Quantity entered by the user, in packages (e.g. "50" cartons). */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantityPackages: number;

  /** Snapshot of the product's units-per-package at the moment of receipt. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitsPerPackage: number;

  /** Computed: quantityPackages × unitsPerPackage — what actually enters stock. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  totalUnits: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  packagePurchasePrice: number;

  /** Computed: packagePurchasePrice ÷ unitsPerPackage. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitCost: number;

  /** Computed: quantityPackages × packagePurchasePrice — what this receipt owes the supplier. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  totalAmount: number;

  /** Amount paid to the supplier for this receipt, up front (cash/transfer) — the rest posts to the supplier's outstanding balance. */
  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  paidAmount: number;

  /** Optional — when given, refreshes the product's suggested package selling price. */
  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  packageSellingPrice: number;

  /** Optional — when given, refreshes the product's suggested unit selling price. */
  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  unitSellingPrice: number;

  @Column("uuid")
  createdById: string;
}
