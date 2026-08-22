/**
 * Official letterhead shared by every printable document (Sales Invoice, Quotation, Customer
 * Outstanding-Balance Statement) — company name (Arabic + English), logo, contact bar, and a
 * document-title block. Company text is settings-driven (falls back to this business's known
 * values if Settings hasn't been filled in yet) so a future edit to the company profile updates
 * every document at once instead of requiring another code change.
 */
export interface LetterheadCompany {
  nameAr?: string | null;
  nameEn?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
}

const DEFAULT_NAME_AR = 'شركة الأمين الهندسية للتجارة العامة والمقاولات';
const DEFAULT_NAME_EN = 'Al-AMiin Engineering CO. for Gen. Trading & Contracting';
const DEFAULT_ADDRESS = 'الفروانية - مجمع راوية - الدور الأول';
const DEFAULT_PHONE = '67793717';

export function DocumentLetterhead({
  docTypeLabel,
  metaLine,
  company,
}: {
  docTypeLabel: string;
  metaLine?: string;
  company?: LetterheadCompany | null;
}) {
  const nameAr = company?.nameAr || DEFAULT_NAME_AR;
  const nameEn = company?.nameEn || DEFAULT_NAME_EN;
  const address = company?.address || DEFAULT_ADDRESS;
  const phone = company?.phone || DEFAULT_PHONE;
  const email = company?.email;

  return (
    <div className="document-letterhead" style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: 10, marginBottom: 15, breakAfter: 'avoid' }}>
      <table className="letterhead-name-row" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '40%', textAlign: 'right', verticalAlign: 'middle' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1e3a8a', margin: 0, lineHeight: 1.3 }}>{nameAr}</div>
            </td>
            <td style={{ width: '20%', textAlign: 'center', verticalAlign: 'middle' }}>
              {company?.logoUrl && <img src={company.logoUrl} alt={nameEn} style={{ maxWidth: 80, height: 'auto' }} />}
            </td>
            <td style={{ width: '40%', textAlign: 'left', direction: 'ltr', verticalAlign: 'middle' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1e3a8a', margin: 0, lineHeight: 1.3 }}>{nameEn}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div
        className="letterhead-contact-bar"
        style={{
          width: '100%',
          backgroundColor: '#f1f5f9',
          borderRadius: 5,
          padding: '6px 10px',
          marginTop: 10,
          fontSize: 12,
          color: '#4b5563',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ textAlign: 'right', width: email ? '34%' : '50%' }}>
                <b>العنوان:</b> {address}
              </td>
              <td style={{ textAlign: 'center', width: email ? '32%' : '50%' }}>
                <b>هاتف / واتساب:</b> {phone}
              </td>
              {email && (
                <td style={{ textAlign: 'left', width: '34%', direction: 'ltr' }}>
                  <b>Email:</b> {email}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'center', margin: '18px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span
          style={{
            backgroundColor: '#1e3a8a',
            color: '#fff',
            padding: '7px 28px',
            fontSize: '13pt',
            fontWeight: 800,
            borderRadius: 999,
            display: 'inline-block',
            textAlign: 'center',
          }}
        >
          {docTypeLabel}
        </span>
        {metaLine && <div style={{ marginTop: 8, fontSize: '10pt', color: '#334155' }}>{metaLine}</div>}
      </div>
    </div>
  );
}
