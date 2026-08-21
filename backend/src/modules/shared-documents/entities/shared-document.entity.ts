import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/**
 * A PDF generated client-side (invoice/quotation) and handed to the server purely so it has a
 * real, public HTTPS URL — needed for the "مشاركة" button's fallback on browsers that support
 * navigator.share() for a link (Level 1 Web Share) but not for an attached file (Level 2,
 * canShare({files})). Samsung Internet is the confirmed real-world case: it can share a URL but
 * not a File. No companyId/createdById FK — this is a short-lived, unauthenticated-readable
 * artifact (see SharedDocumentsCleanupCron), not a real business record; the plain uuid columns
 * are for audit/troubleshooting only.
 */
@Entity('shared_documents')
export class SharedDocument extends BaseEntity {
  @Column('uuid')
  companyId: string;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ type: 'varchar', length: 300 })
  originalFilename: string;

  @Column({ type: 'varchar', length: 100, default: 'application/pdf' })
  mimeType: string;
}
