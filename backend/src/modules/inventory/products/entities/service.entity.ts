import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Company } from "../../../settings/entities/company.entity";

/**
 * A named service offering (e.g. "تركيب مكيف") whose actual sellable price points are real
 * Product rows — one per capacity tier (productType=SERVICE, linked back via Product.serviceId).
 * This entity is purely a grouping/label parent so the Services screen can show "تركيب مكيف" once
 * with its tiers nested under it, while each tier remains a normal, directly sellable Product the
 * existing sales/invoicing/stock-skip/reporting pipeline already handles unchanged (see
 * ProductType.SERVICE's own doc comment). Deliberately has no `@OneToMany` back-reference to
 * Product here — that would need importing Product into this file while Product also imports
 * Service, a real circular file import; tier products are looked up directly by serviceId instead
 * (see ProductsService.findServicesForCompany).
 *
 * AC-only in practice — gated frontend-side (Services tab only renders for isAirConditioning),
 * same convention as every other AC-only feature in this codebase; nothing stops another company
 * from having one at the schema level, but nothing ever creates one for them either.
 */
@Entity("services")
export class Service extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({ type: "varchar", length: 200 })
  name: string;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;
}
