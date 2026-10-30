import React from 'react';
import { CheckCircle2, TrendingDown, Sparkles } from 'lucide-react';
import { formatMinorToMajor } from '@/utils/money';
import { calcMoqProgressPercentage, remainingForMoq, findApplicableTier } from '@/utils/moqMath';
import { cn } from '@/lib/utils';

/**
 * TierProgressBar (SUJ-01)
 *
 * Visual progress bar rendering pool quantity vs Wholesaler MOQ (MOQ_W),
 * completion percentage, and active bulk discount price tiers.
 * Satisfies SRS FR-POOL-006 and BR-004.
 *
 * @param {object} props
 * @param {number} props.totalEligibleQuantity - Current combined quantity in pool
 * @param {number} props.targetMoq - Wholesaler target MOQ
 * @param {Array<{ minQuantity: number, unitPriceMinor: number, label?: string }>} [props.tiers=[]] - Discount tiers
 * @param {number} [props.baseUnitPriceMinor=0] - Default single-unit/base price in minor units
 * @param {string} [props.currency='INR'] - Currency code
 * @param {string} [props.packUnit='units'] - Unit name (e.g. 'boxes', 'cartons')
 * @param {string} [props.className]
 */
export function TierProgressBar({
  totalEligibleQuantity = 0,
  targetMoq = 1,
  tiers = [],
  baseUnitPriceMinor = 0,
  currency = 'INR',
  packUnit = 'units',
  className,
  ...props
}) {
  const currentQty = Math.max(0, Number(totalEligibleQuantity) || 0);
  const moqTarget = Math.max(1, Number(targetMoq) || 1);
  const progressPercent = calcMoqProgressPercentage(currentQty, moqTarget);
  const remainingUnits = remainingForMoq(currentQty, moqTarget);
  const isMoqReached = currentQty >= moqTarget;

  // Resolve tier information
  const { currentTier, nextTier, unitsToNextTier, unitPriceMinor, isMaxTier } = findApplicableTier(
    currentQty,
    tiers,
    baseUnitPriceMinor
  );

  return (
    <div
      className={cn(
        'rounded-lg border border-midnight-border bg-midnight-card p-4 space-y-4 shadow-sm',
        className
      )}
      {...props}
    >
      {/* Header: Progress Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-midnight-muted">
            MOQ Progress
          </span>
          {isMoqReached ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" />
              MOQ Reached
            </span>
          ) : (
            <span className="text-xs text-amber-400 font-medium">
              {remainingUnits} {packUnit} needed
            </span>
          )}
        </div>

        {/* Current Active Price */}
        <div className="flex items-baseline gap-1 text-right">
          <span className="text-xs text-midnight-muted">Current Tier:</span>
          <span className="text-sm font-bold text-white tabular-nums">
            {formatMinorToMajor(unitPriceMinor, currency)}
          </span>
          <span className="text-xs text-midnight-muted">/{packUnit}</span>
        </div>
      </div>

      {/* Main Visual Progress Bar */}
      <div className="relative space-y-1.5">
        <div className="h-3.5 w-full overflow-hidden rounded-full bg-midnight-surface border border-midnight-border/70 relative">
          <div
            role="progressbar"
            aria-valuenow={currentQty}
            aria-valuemin={0}
            aria-valuemax={moqTarget}
            style={{ width: `${progressPercent}%` }}
            className={cn(
              'h-full transition-all duration-500 ease-out rounded-full',
              isMoqReached
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-sm shadow-emerald-500/50'
                : 'bg-gradient-to-r from-teal-600 to-teal-400 shadow-sm shadow-teal-500/50'
            )}
          />
        </div>

        {/* Progress Numbers */}
        <div className="flex items-center justify-between text-xs font-mono text-midnight-muted tabular-nums">
          <span>
            <strong className="text-midnight-text font-semibold">{currentQty}</strong> {packUnit} ordered
          </span>
          <span>
            Target MOQ: <strong className="text-midnight-text font-semibold">{moqTarget}</strong> {packUnit} ({progressPercent}%)
          </span>
        </div>
      </div>

      {/* Bulk Pricing Tiers Matrix */}
      {tiers && tiers.length > 0 && (
        <div className="pt-2 border-t border-midnight-border/50 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-midnight-muted font-medium">
            <span className="flex items-center gap-1 text-slate-300">
              <TrendingDown className="h-3 w-3 text-teal-400" />
              Quantity Price Tiers:
            </span>
            {nextTier && (
              <span className="text-teal-300 font-mono text-[11px]">
                +{unitsToNextTier} {packUnit} unlocks{' '}
                <strong className="text-white">
                  {formatMinorToMajor(nextTier.unitPriceMinor, currency)}
                </strong>
              </span>
            )}
            {isMaxTier && (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Best bulk price unlocked!
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tiers.map((tier, idx) => {
              const isUnlocked = currentQty >= tier.minQuantity;
              const isCurrent = currentTier === tier;

              return (
                <div
                  key={tier.minQuantity || idx}
                  className={cn(
                    'rounded-md p-2 text-xs border transition-all',
                    isCurrent
                      ? 'border-teal-500/50 bg-teal-950/40 text-teal-200 ring-1 ring-teal-500/40'
                      : isUnlocked
                      ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                      : 'border-midnight-border/50 bg-midnight-surface/40 text-midnight-muted'
                  )}
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-[10px] uppercase text-midnight-muted">
                      ≥ {tier.minQuantity} {packUnit}
                    </span>
                    {isUnlocked && (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    )}
                  </div>
                  <div className="mt-1 font-bold text-sm tabular-nums text-white">
                    {formatMinorToMajor(tier.unitPriceMinor, currency)}
                    <span className="text-[10px] font-normal text-midnight-muted">/{packUnit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default TierProgressBar;

