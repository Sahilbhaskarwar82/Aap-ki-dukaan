import React from 'react';
import { Tag, ShieldCheck, Info } from 'lucide-react';
import { formatMinorToMajor } from '@/utils/money';
import { cn } from '@/lib/utils';

/**
 * PriceBreakdownLedger (SUJ-01)
 *
 * Transparent, itemized financial breakdown component rendering:
 *  - Quantity & Unit Price
 *  - Merchandise Subtotal
 *  - Allocated Shipping Share (PER_UNIT / EQUAL_SHARE / EXCLUDED)
 *  - Rounding Adjustment
 *  - Verified Bulk Savings
 *  - Final Total Payable (in minor units)
 *
 * Fulfills SRS FR-PRICE-004, FR-PRICE-005, FR-PRICE-006, and BR-006.
 *
 * @param {object} props
 * @param {object} [props.contribution] - Full contribution or member share object
 * @param {number} [props.quantity] - Order quantity
 * @param {string} [props.unit='units'] - Unit name
 * @param {number} [props.unitPriceMinor] - Applied unit price
 * @param {number} [props.merchandiseShareMinor] - Merchandise subtotal
 * @param {number} [props.shippingShareMinor=0] - Shipping share
 * @param {number} [props.roundingAdjustmentMinor=0] - Rounding correction
 * @param {number} [props.totalPayableMinor] - Grand total payable
 * @param {number} [props.verifiedSavingsMinor=0] - Proven savings vs baseline
 * @param {string} [props.currency='INR'] - Currency code
 * @param {string} [props.shippingAllocationMethod='PER_UNIT'] - PER_UNIT | EQUAL_SHARE | EXCLUDED
 * @param {string} [props.shippingStatus='KNOWN'] - KNOWN | EXCLUDED_OR_PENDING
 * @param {string} [props.taxNote='GST excluded (paid directly to supplier)']
 * @param {number|string} [props.snapshotVersion] - Optional frozen snapshot version tag
 * @param {string} [props.className]
 */
export function PriceBreakdownLedger({
  contribution,
  quantity: propQuantity,
  unit: propUnit,
  unitPriceMinor: propUnitPrice,
  merchandiseShareMinor: propMerchandiseShare,
  shippingShareMinor: propShippingShare,
  roundingAdjustmentMinor: propRoundingAdjustment,
  totalPayableMinor: propTotalPayable,
  verifiedSavingsMinor: propVerifiedSavings,
  currency = 'INR',
  shippingAllocationMethod = 'PER_UNIT',
  shippingStatus = 'KNOWN',
  taxNote = 'GST excluded at invoice generation',
  snapshotVersion,
  className,
  ...props
}) {
  // Extract values with fallback to contribution object
  const c = contribution || {};

  const quantity = Number.isFinite(propQuantity)
    ? propQuantity
    : Number(c.quantity) || 0;

  const unit = propUnit || c.unit || 'units';

  const unitPriceMinor = Number.isFinite(propUnitPrice)
    ? propUnitPrice
    : (c.appliedUnitPriceMinor ?? c.unitPriceMinor ?? 0);

  const merchandiseShareMinor = Number.isFinite(propMerchandiseShare)
    ? propMerchandiseShare
    : (c.merchandiseShareMinor ?? c.estimatedMerchandiseShareMinor ?? (quantity * unitPriceMinor));

  const shippingShareMinor = Number.isFinite(propShippingShare)
    ? propShippingShare
    : (c.shippingShareMinor ?? c.estimatedShippingShareMinor ?? 0);

  const roundingAdjustmentMinor = Number.isFinite(propRoundingAdjustment)
    ? propRoundingAdjustment
    : (c.roundingAdjustmentMinor ?? 0);

  const totalPayableMinor = Number.isFinite(propTotalPayable)
    ? propTotalPayable
    : (c.totalPayableMinor ?? c.finalTotalPayableMinor ?? (merchandiseShareMinor + shippingShareMinor + roundingAdjustmentMinor));

  const verifiedSavingsMinor = Number.isFinite(propVerifiedSavings)
    ? propVerifiedSavings
    : (c.verifiedSavingsMinor ?? 0);

  // Friendly description for shipping allocation
  const shippingMethodLabel = {
    PER_UNIT: 'Proportional (per unit)',
    PER_WEIGHT: 'Proportional (by weight)',
    EQUAL_SHARE: 'Split equally per shop',
    EXCLUDED: 'Excluded / direct pickup',
  }[shippingAllocationMethod] || shippingAllocationMethod;

  const isShippingExcluded = shippingStatus === 'EXCLUDED_OR_PENDING' || shippingAllocationMethod === 'EXCLUDED';

  return (
    <div
      className={cn(
        'rounded-lg border border-midnight-border bg-midnight-card overflow-hidden shadow-sm',
        className
      )}
      {...props}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-midnight-surface/50 border-b border-midnight-border">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-teal-400" />
          <h4 className="text-xs font-semibold tracking-wider uppercase text-white">
            Price Breakdown Ledger
          </h4>
        </div>
        {snapshotVersion && (
          <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
            Snapshot v{snapshotVersion}
          </span>
        )}
      </div>

      {/* Ledger Line Items */}
      <div className="p-4 space-y-2.5 text-xs">
        {/* Merchandise Share */}
        <div className="flex items-center justify-between">
          <div className="text-midnight-text">
            <span>Merchandise Share</span>
            <span className="text-midnight-muted ml-1.5 font-mono text-[11px]">
              ({quantity} {unit} × {formatMinorToMajor(unitPriceMinor, currency)})
            </span>
          </div>
          <span className="font-mono font-semibold text-white tabular-nums">
            {formatMinorToMajor(merchandiseShareMinor, currency)}
          </span>
        </div>

        {/* Shipping Share */}
        <div className="flex items-center justify-between">
          <div className="text-midnight-text">
            <span>Shipping Share</span>
            <span className="text-midnight-muted ml-1.5 text-[11px]">
              ({isShippingExcluded ? 'Pending/Excluded' : shippingMethodLabel})
            </span>
          </div>
          <span className="font-mono font-semibold text-white tabular-nums">
            {isShippingExcluded ? (
              <span className="text-midnight-muted font-normal text-[11px]">Pending / At Delivery</span>
            ) : (
              formatMinorToMajor(shippingShareMinor, currency)
            )}
          </span>
        </div>

        {/* Rounding Adjustment (if non-zero) */}
        {roundingAdjustmentMinor !== 0 && (
          <div className="flex items-center justify-between text-midnight-muted">
            <span className="text-[11px]">Rounding Adjustment (integer penny allocation)</span>
            <span className="font-mono text-[11px] tabular-nums">
              {roundingAdjustmentMinor > 0 ? '+' : ''}
              {formatMinorToMajor(roundingAdjustmentMinor, currency)}
            </span>
          </div>
        )}

        {/* Verified Savings Callout */}
        {verifiedSavingsMinor > 0 && (
          <div className="flex items-center justify-between p-2 rounded bg-emerald-950/30 border border-emerald-500/30 text-emerald-300">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="font-medium text-xs">Verified Bulk Savings</span>
            </div>
            <span className="font-mono font-bold text-xs tabular-nums text-emerald-400">
              -{formatMinorToMajor(verifiedSavingsMinor, currency)}
            </span>
          </div>
        )}

        {/* Subtotal / Grand Total Divider */}
        <div className="pt-3 mt-1 border-t border-midnight-border flex items-baseline justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Total Payable Amount
            </span>
            <p className="text-[10px] text-midnight-muted mt-0.5">
              {taxNote}
            </p>
          </div>
          <div className="text-right">
            <span className="font-mono font-bold text-lg text-white tabular-nums">
              {formatMinorToMajor(totalPayableMinor, currency)}
            </span>
            <div className="text-[10px] font-mono text-midnight-muted">
              {currency} minor: {totalPayableMinor}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="px-4 py-2 bg-midnight-surface/30 border-t border-midnight-border/40 text-[10px] text-midnight-muted flex items-center gap-1.5">
        <Info className="h-3 w-3 text-midnight-muted shrink-0" />
        <span>Authoritative backend calculations (BR-006). All values stored in integer minor units.</span>
      </div>
    </div>
  );
}

export default PriceBreakdownLedger;

