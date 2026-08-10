import { formatAmount } from '../../lib/number-format';

/**
 * Renders a stock quantity with packages as the primary figure (per this ERP's wholesale-first
 * convention: inventory is always expressed in packages, never raw units) and any leftover base
 * units as a small secondary note — shown only when a remainder actually exists.
 */
export function PackageQuantity({
  baseQuantity,
  unitsPerPackage,
  packageUnitName,
  unitName,
}: {
  baseQuantity: number;
  unitsPerPackage?: number | null;
  packageUnitName?: string;
  unitName?: string;
}) {
  if (!unitsPerPackage) {
    return <span>{formatAmount(baseQuantity)}</span>;
  }

  const packages = Math.floor(baseQuantity / unitsPerPackage);
  const remainderUnits = baseQuantity % unitsPerPackage;

  return (
    <span>
      <span className="font-medium">
        {formatAmount(packages)} {packageUnitName}
      </span>
      {remainderUnits > 0 && (
        <span className="ms-1 text-xs text-[var(--text-muted)]">
          + {formatAmount(remainderUnits)} {unitName}
        </span>
      )}
    </span>
  );
}
