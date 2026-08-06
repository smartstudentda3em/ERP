import { useTranslation } from 'react-i18next';

/** Sign-off block shared by every printable document — two signature lines plus a dedicated
 * company-stamp box, and a fixed authenticity note underneath. `breakInside: avoid` keeps this
 * whole block from being split across a page boundary during print/PDF pagination. */
export function DocumentFooter() {
  const { t } = useTranslation();
  return (
    <div className="document-footer" style={{ marginTop: 40, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '10pt', color: '#334155' }}>
        <div style={{ textAlign: 'center', width: '31%' }}>
          <div style={{ borderTop: '1px solid #94a3b8', marginTop: 40, paddingTop: 6 }}>
            {t('printDocument.recipientSignature')}
          </div>
        </div>
        <div style={{ textAlign: 'center', width: '31%' }}>
          <div style={{ borderTop: '1px solid #94a3b8', marginTop: 40, paddingTop: 6 }}>
            {t('printDocument.accountantSignature')}
          </div>
        </div>
        <div style={{ textAlign: 'center', width: '31%' }}>
          <div style={{ border: '1px solid #94a3b8', borderRadius: 4, height: 66, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {t('printDocument.officialStamp')}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20, textAlign: 'center', fontSize: '8.5pt', color: '#64748b' }}>
        {t('printDocument.authenticityNote')}
      </div>
    </div>
  );
}
