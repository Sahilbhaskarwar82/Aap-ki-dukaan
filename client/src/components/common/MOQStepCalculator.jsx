import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Minus, AlertCircle, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatMinorToMajor, multiplyMinor } from '@/utils/money';
import {
  calcRetailerMoq,
  calcStepMultiple,
  validateQuantity,
  nearestValidQuantity,
  findApplicableTier,
} from '@/utils/moqMath';
import { cn } from '@/lib/utils';

/**
 * MOQStepCalculator (SUJ-01)
 *
 * Interactive quantity selector with +/- step buttons that enforces:
 *  - Retailer Minimum Commitment (MOQ_R = 20% of MOQ_W)
 *  - Quantity Step Multiples (Step = 1% of MOQ_W)
 * Shows live unit price tier and instant estimated merchandise subtotal.
 *
 * @param {object} props
 * @param {number} props.targetMoq - Wholesaler MOQ (MOQ_W)
 * @param {number} [props.retailerMoqPercentage=20] - Default 20%
 * @param {number} [props.retailerStepPercentage=1] - Default 1%
 * @param {number} [props.minRetailerQuantity] - Optional explicit MOQ_R
 * @param {number} [props.quantityStepMultiple] - Optional explicit Step
 * @param {number} [props.currentUnitPriceMinor=0] - Active price per pack/unit in minor units
 * @param {number} [props.baseUnitPriceMinor=0] - Fallback baseline price
 * @param {Array<object>} [props.tiers=[]] - Optional bulk discount tiers
 * @param {string} [props.currency='INR'] - Currency code
 * @param {string} [props.packUnit='boxes'] - Unit description
 * @param {number} [props.value] - Controlled quantity value
 * @param {number} [props.initialQuantity] - Initial quantity if uncontrolled
 * @param {function} [props.onChange] - Callback (quantity, meta) => void
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className]
 */
export function MOQStepCalculator({
  targetMoq = 100,
  retailerMoqPercentage = 20,
  retailerStepPercentage = 1,
  minRetailerQuantity,
  quantityStepMultiple,
  currentUnitPriceMinor = 0,
  baseUnitPriceMinor = 0,
  tiers = [],
  currency = 'INR',
  packUnit = 'boxes',
  value: controlledValue,
  initialQuantity,
  onChange,
  disabled = false,
  className,
  ...props
}) {
  // Compute minimum order quantity and step increment
  const moqR = useMemo(
    () => minRetailerQuantity || calcRetailerMoq(targetMoq, retailerMoqPercentage),
    [minRetailerQuantity, targetMoq, retailerMoqPercentage]
  );

  const step = useMemo(
    () => quantityStepMultiple || calcStepMultiple(targetMoq, retailerStepPercentage),
    [quantityStepMultiple, targetMoq, retailerStepPercentage]
  );

  // Initial internal state (used only when uncontrolled)
  const startingQty = controlledValue !== undefined
    ? controlledValue
    : (initialQuantity || moqR);

  const [internalQuantity, setInternalQuantity] = useState(startingQty);
  const [inputValue, setInputValue] = useState(String(startingQty));

  // In controlled mode the quantity is always the prop value; no effect needed.
  const isControlled = controlledValue !== undefined;
  const quantity = isControlled ? controlledValue : internalQuantity;
  const setQuantity = isControlled
    ? () => {} // parent owns the value; local state is irrelevant
    : setInternalQuantity;

  // Sync inputValue when the controlled prop changes externally.
  // This uses React's "derived state during render" pattern (NOT a useEffect):
  // React discards this render and immediately re-renders with updated state.
  // This avoids the react/set-state-in-effect lint warning while keeping
  // inputValue consistent with controlledValue across parent-driven updates.
  const [prevControlledValue, setPrevControlledValue] = useState(controlledValue);
  if (isControlled && controlledValue !== prevControlledValue) {
    setPrevControlledValue(controlledValue);
    setInputValue(String(controlledValue));
  }

  // Validation state
  const validation = useMemo(() => {
    return validateQuantity(quantity, {
      targetMoq,
      minRetailerQuantity: moqR,
      quantityStepMultiple: step,
    });
  }, [quantity, targetMoq, moqR, step]);

  // Determine active unit price (from tiers or prop)
  const resolvedUnitPrice = useMemo(() => {
    if (tiers && tiers.length > 0) {
      const { unitPriceMinor } = findApplicableTier(quantity, tiers, baseUnitPriceMinor || currentUnitPriceMinor);
      return unitPriceMinor;
    }
    return currentUnitPriceMinor || baseUnitPriceMinor || 0;
  }, [quantity, tiers, baseUnitPriceMinor, currentUnitPriceMinor]);

  // Estimated merchandise total in minor units
  const estimatedTotalMinor = useMemo(() => {
    if (!validation.isValid) return 0;
    return multiplyMinor(resolvedUnitPrice, quantity);
  }, [resolvedUnitPrice, quantity, validation.isValid]);

  // Dispatch change notification
  const notifyChange = useCallback(
    (newQty) => {
      const check = validateQuantity(newQty, {
        targetMoq,
        minRetailerQuantity: moqR,
        quantityStepMultiple: step,
      });

      const totalMinor = check.isValid ? multiplyMinor(resolvedUnitPrice, newQty) : 0;

      if (typeof onChange === 'function') {
        onChange(newQty, {
          isValid: check.isValid,
          error: check.error,
          unitPriceMinor: resolvedUnitPrice,
          merchandiseTotalMinor: totalMinor,
          moqR,
          step,
        });
      }
    },
    [targetMoq, moqR, step, resolvedUnitPrice, onChange]
  );

  // Stepper handlers
  const handleDecrement = () => {
    if (disabled) return;
    const nextQty = Math.max(moqR, quantity - step);
    setQuantity(nextQty);
    setInputValue(String(nextQty));
    notifyChange(nextQty);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const nextQty = quantity + step;
    setQuantity(nextQty);
    setInputValue(String(nextQty));
    notifyChange(nextQty);
  };

  const handleInputChange = (e) => {
    const raw = e.target.value;
    setInputValue(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      setQuantity(parsed);
      notifyChange(parsed);
    }
  };

  const handleInputBlur = () => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < moqR) {
      // Snap to moqR
      setQuantity(moqR);
      setInputValue(String(moqR));
      notifyChange(moqR);
    } else {
      // Snap to valid multiple
      const valid = nearestValidQuantity(parsed, {
        targetMoq,
        minRetailerQuantity: moqR,
        quantityStepMultiple: step,
      });
      setQuantity(valid);
      setInputValue(String(valid));
      notifyChange(valid);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-midnight-border bg-midnight-card p-4 space-y-4 shadow-sm',
        className
      )}
      {...props}
    >
      {/* Title & Guidance */}
      <div className="flex items-center justify-between text-xs">
        <label htmlFor="moq-quantity-input" className="font-semibold text-midnight-text uppercase tracking-wider">
          Contribution Quantity
        </label>
        <span className="text-midnight-muted">
          Min: <strong className="text-white font-mono">{moqR}</strong> | Step: <strong className="text-white font-mono">+{step}</strong>
        </span>
      </div>

      {/* Stepper Control */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={disabled || quantity <= moqR}
          onClick={handleDecrement}
          aria-label="Decrease quantity"
          className="h-10 w-10 shrink-0 border-midnight-border hover:border-slate-500"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <div className="relative flex-1">
          <input
            id="moq-quantity-input"
            type="number"
            min={moqR}
            step={step}
            value={inputValue}
            disabled={disabled}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            aria-invalid={!validation.isValid}
            className={cn(
              'h-10 w-full text-center font-mono font-bold text-base rounded-md border bg-midnight-surface px-3 py-2 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 tabular-nums',
              validation.isValid
                ? 'border-midnight-border focus-visible:ring-midnight-red focus-visible:border-midnight-red'
                : 'border-midnight-rose focus-visible:ring-midnight-rose focus-visible:border-midnight-rose text-rose-300'
            )}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-normal text-midnight-muted pointer-events-none">
            {packUnit}
          </span>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={disabled}
          onClick={handleIncrement}
          aria-label="Increase quantity"
          className="h-10 w-10 shrink-0 border-midnight-border hover:border-slate-500"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Instant Validation Feedback */}
      {!validation.isValid ? (
        <div className="flex items-start gap-1.5 text-xs text-midnight-rose bg-rose-950/20 border border-rose-900/30 p-2 rounded">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{validation.error}</span>
        </div>
      ) : (
        <p className="text-[11px] text-midnight-muted">
          Complies with minimum {moqR} {packUnit} in multiples of {step}.
        </p>
      )}

      {/* Live Estimated Merchandise Share */}
      <div className="pt-3 border-t border-midnight-border/50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-midnight-muted">
          <ShoppingCart className="h-3.5 w-3.5 text-teal-400" />
          <span>Estimated Merchandise:</span>
        </div>
        <div className="text-right">
          <span className="font-mono font-bold text-sm text-white tabular-nums">
            {formatMinorToMajor(estimatedTotalMinor, currency)}
          </span>
          <span className="text-[11px] text-midnight-muted ml-1.5 font-normal">
            ({formatMinorToMajor(resolvedUnitPrice, currency)}/{packUnit})
          </span>
        </div>
      </div>
    </div>
  );
}

export default MOQStepCalculator;

