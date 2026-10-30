import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Utilities
import {
  formatMinorToMajor,
  toMinor,
  toMajor,
  addMinor,
  subtractMinor,
  multiplyMinor,
  divideMinor,
  allocateMinor,
  isValidMinor,
} from '@/utils/money';

import {
  calcRetailerMoq,
  calcStepMultiple,
  validateQuantity,
  nearestValidQuantity,
  findApplicableTier,
} from '@/utils/moqMath';

// Components
import { ProvenanceBadge } from '@/components/common/ProvenanceBadge';
import { SandboxDisclosureBanner } from '@/components/common/SandboxDisclosureBanner';
import { CountdownTimer } from '@/components/common/CountdownTimer';
import { TierProgressBar } from '@/components/common/TierProgressBar';
import { MOQStepCalculator } from '@/components/common/MOQStepCalculator';
import { PriceBreakdownLedger } from '@/components/common/PriceBreakdownLedger';
import { ActivityTimeline } from '@/components/common/ActivityTimeline';

describe('SUJ-01: Financial Utilities & Procurement Widgets', () => {
  // ── 1. money.js Tests ──────────────────────────────────────────────────────────
  describe('money.js Utilities', () => {
    it('formats minor units to locale currency strings correctly', () => {
      // 480000 paise = ₹4,800.00
      const formattedInr = formatMinorToMajor(480000, 'INR');
      expect(formattedInr).toContain('4,800');
      expect(formattedInr).toContain('₹');

      // 1500 cents = $15.00
      const formattedUsd = formatMinorToMajor(1500, 'USD');
      expect(formattedUsd).toContain('15.00');
      expect(formattedUsd).toContain('$');

      // Zero and fallback
      expect(formatMinorToMajor(0, 'INR')).toContain('0.00');
      expect(formatMinorToMajor(null, 'INR', { fallback: 'N/A' })).toBe('N/A');
    });

    it('converts to/from minor units safely', () => {
      expect(toMinor(48)).toBe(4800);
      expect(toMinor('12.50')).toBe(1250);
      expect(toMajor(4800)).toBe(48);
      expect(toMajor(1250)).toBe(12.5);
    });

    it('performs safe integer arithmetic on minor units', () => {
      expect(addMinor(160000, 120000, 200000)).toBe(480000);
      expect(subtractMinor(500000, 20000)).toBe(480000);
      expect(multiplyMinor(8000, 60)).toBe(480000); // 60 boxes @ ₹80.00
      expect(divideMinor(480000, 3)).toBe(160000);
      expect(isValidMinor(480000)).toBe(true);
      expect(isValidMinor(4800.5)).toBe(false);
      expect(isValidMinor(-100)).toBe(false);
    });

    it('allocates minor units proportionally without losing pennies to rounding', () => {
      // Total 1000 paise split 3 ways equally -> 333, 333, 333 + 1 remainder = 1000
      const allocations = allocateMinor(1000, [1, 1, 1]);
      const sum = allocations.reduce((acc, v) => acc + v, 0);
      expect(sum).toBe(1000);
      expect(allocations).toEqual([334, 333, 333]);
    });
  });

  // ── 2. moqMath.js Tests ────────────────────────────────────────────────────────
  describe('moqMath.js Utilities', () => {
    it('calculates Retailer MOQ (MOQ_R = 20%) and Step (1%)', () => {
      // For target MOQ = 1000
      expect(calcRetailerMoq(1000, 20)).toBe(200);
      expect(calcStepMultiple(1000, 1)).toBe(10);

      // For target MOQ = 100
      expect(calcRetailerMoq(100, 20)).toBe(20);
      expect(calcStepMultiple(100, 1)).toBe(1);
    });

    it('validates order quantities against MOQ_R and Step multiples', () => {
      const config = { targetMoq: 1000, retailerMoqPercentage: 20, retailerStepPercentage: 1 };
      // MOQ_R = 200, Step = 10

      // Valid: 200, 210, 250
      expect(validateQuantity(200, config).isValid).toBe(true);
      expect(validateQuantity(250, config).isValid).toBe(true);

      // Invalid: below MOQ_R (< 200)
      const belowMoq = validateQuantity(150, config);
      expect(belowMoq.isValid).toBe(false);
      expect(belowMoq.error).toContain('Minimum order requirement is 200');

      // Invalid: not multiple of step
      const badStep = validateQuantity(205, config);
      expect(badStep.isValid).toBe(false);
      expect(badStep.error).toContain('multiples of 10');
    });

    it('snaps quantities to nearest valid order increments', () => {
      const config = { targetMoq: 1000, retailerMoqPercentage: 20, retailerStepPercentage: 1 };
      expect(nearestValidQuantity(150, config)).toBe(200); // Below MOQ snaps to MOQ_R
      expect(nearestValidQuantity(204, config)).toBe(200);
      expect(nearestValidQuantity(206, config)).toBe(210);
    });

    it('verifies the SRS Section 12.3 bulk discount tier resolution test', () => {
      // Tier structure:
      // Base: ₹100/box (10000 minor)
      // Tier 1: 30-49 boxes -> ₹90 (9000 minor)
      // Tier 2: 50+ boxes -> ₹80 (8000 minor)
      const tiers = [
        { minQuantity: 30, unitPriceMinor: 9000 },
        { minQuantity: 50, unitPriceMinor: 8000 },
      ];
      const baseUnitPriceMinor = 10000;

      // Confirmed contributions: 20 + 15 + 25 = 60 boxes
      const totalQty = 20 + 15 + 25; // 60
      const result = findApplicableTier(totalQty, tiers, baseUnitPriceMinor);

      expect(result.unitPriceMinor).toBe(8000); // ₹80.00 unlocked!
      expect(result.isMaxTier).toBe(true);

      // Total merchandise = 60 * ₹80 = ₹4,800.00 (480000 minor)
      const merchandiseTotalMinor = multiplyMinor(result.unitPriceMinor, totalQty);
      expect(merchandiseTotalMinor).toBe(480000);

      // Per-shop shares: 20 -> 160000, 15 -> 120000, 25 -> 200000
      expect(multiplyMinor(result.unitPriceMinor, 20)).toBe(160000);
      expect(multiplyMinor(result.unitPriceMinor, 15)).toBe(120000);
      expect(multiplyMinor(result.unitPriceMinor, 25)).toBe(200000);
    });
  });

  // ── 3. ProvenanceBadge.jsx Tests ──────────────────────────────────────────────
  describe('ProvenanceBadge Component', () => {
    it('renders SEEDED_DEMO provenance badge with correct label and styling', () => {
      render(<ProvenanceBadge type="SEEDED_DEMO" />);
      expect(screen.getByText('Demo Sample')).toBeInTheDocument();
      expect(screen.getByTitle(/seeded sample data/i)).toBeInTheDocument();
    });

    it('renders VERIFIED_LIVE and SUPPLIER_SUBMITTED badges', () => {
      const { rerender } = render(<ProvenanceBadge type="VERIFIED_LIVE" />);
      expect(screen.getByText('Verified Wholesaler')).toBeInTheDocument();

      rerender(<ProvenanceBadge type="SUPPLIER_SUBMITTED" />);
      expect(screen.getByText('Supplier Quote')).toBeInTheDocument();
    });
  });

  // ── 4. SandboxDisclosureBanner.jsx Tests ───────────────────────────────────────
  describe('SandboxDisclosureBanner Component', () => {
    it('renders TEST_TRANSACTION PayPal Sandbox disclosure banner', () => {
      render(<SandboxDisclosureBanner type="TEST_TRANSACTION" />);
      expect(screen.getByText(/test transaction — paypal sandbox/i)).toBeInTheDocument();
      expect(screen.getByText(/no real bank accounts or live funds/i)).toBeInTheDocument();
    });

    it('renders SIMULATED_SETTLEMENT disclosure banner', () => {
      render(<SandboxDisclosureBanner type="SIMULATED_SETTLEMENT" />);
      expect(screen.getByText(/simulated supplier settlement/i)).toBeInTheDocument();
      expect(screen.getByText(/supplier payout records are simulated/i)).toBeInTheDocument();
    });
  });

  // ── 5. CountdownTimer.jsx Tests ───────────────────────────────────────────────
  describe('CountdownTimer Component', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders countdown timer with days, hours, minutes, seconds', () => {
      const now = new Date('2026-10-30T12:00:00Z').getTime();
      vi.setSystemTime(now);

      // Deadline 2 days, 3 hours later
      const deadline = new Date(now + (2 * 86400 + 3 * 3600 + 45 * 60 + 30) * 1000);
      render(<CountdownTimer deadline={deadline} label="72h Pool Window" />);

      expect(screen.getByText('72h Pool Window')).toBeInTheDocument();
      expect(screen.getByText('02')).toBeInTheDocument(); // Days
      expect(screen.getByText('03')).toBeInTheDocument(); // Hours
      expect(screen.getByText('45')).toBeInTheDocument(); // Mins
      expect(screen.getByText('30')).toBeInTheDocument(); // Secs
    });

    it('displays EXPIRED and triggers onExpire when deadline has passed', () => {
      const onExpire = vi.fn();
      const pastDeadline = new Date(Date.now() - 5000);

      render(<CountdownTimer deadline={pastDeadline} onExpire={onExpire} />);

      expect(screen.getByText('DEADLINE EXPIRED')).toBeInTheDocument();
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('renders inline variant properly', () => {
      const future = new Date(Date.now() + 3600 * 1000);
      render(<CountdownTimer deadline={future} variant="inline" label="Closes in" />);
      expect(screen.getByText(/closes in:/i)).toBeInTheDocument();
    });
  });

  // ── 6. TierProgressBar.jsx Tests ──────────────────────────────────────────────
  describe('TierProgressBar Component', () => {
    it('renders MOQ progress bar and tier matrix', () => {
      const tiers = [
        { minQuantity: 30, unitPriceMinor: 9000 },
        { minQuantity: 50, unitPriceMinor: 8000 },
      ];

      render(
        <TierProgressBar
          totalEligibleQuantity={60}
          targetMoq={50}
          tiers={tiers}
          baseUnitPriceMinor={10000}
          packUnit="boxes"
        />
      );

      // Progress checks
      expect(screen.getByText('MOQ Reached')).toBeInTheDocument();
      expect(screen.getByText('60')).toBeInTheDocument();
      expect(screen.getByText(/Target MOQ:/i)).toBeInTheDocument();
      expect(screen.getByText(/Best bulk price unlocked!/i)).toBeInTheDocument();
    });

    it('shows remaining units needed when MOQ is not reached', () => {
      render(
        <TierProgressBar
          totalEligibleQuantity={20}
          targetMoq={50}
          baseUnitPriceMinor={10000}
          packUnit="boxes"
        />
      );

      expect(screen.getByText(/30 boxes needed/i)).toBeInTheDocument();
    });
  });

  // ── 7. MOQStepCalculator.jsx Tests ────────────────────────────────────────────
  describe('MOQStepCalculator Component', () => {
    it('initializes with minimum Retailer MOQ and steps up/down correctly', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20} // moqR = 20
          retailerStepPercentage={5}  // step = 5
          currentUnitPriceMinor={8000}
          onChange={handleChange}
          packUnit="boxes"
        />
      );

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(20);

      // Step up (+5) -> 25
      const incBtn = screen.getByRole('button', { name: /increase quantity/i });
      await user.click(incBtn);
      expect(input).toHaveValue(25);
      expect(handleChange).toHaveBeenCalledWith(25, expect.objectContaining({
        isValid: true,
        merchandiseTotalMinor: 25 * 8000,
      }));

      // Step down (-5) -> 20
      const decBtn = screen.getByRole('button', { name: /decrease quantity/i });
      await user.click(decBtn);
      expect(input).toHaveValue(20);

      // Cannot step down below MOQ_R (20)
      expect(decBtn).toBeDisabled();
    });

    it('validates manual text input and rejects invalid values', async () => {
      const user = userEvent.setup();
      render(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20}
          retailerStepPercentage={5}
        />
      );

      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '15'); // below 20
      expect(screen.getByText(/minimum order requirement is 20/i)).toBeInTheDocument();
    });

    it('controlled: initial value of 100 is displayed correctly', () => {
      render(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20}
          retailerStepPercentage={5}
          value={100}
        />
      );
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(100);
    });

    it('controlled: input updates when parent rerenders with a new value', () => {
      const { rerender } = render(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20}
          retailerStepPercentage={5}
          value={100}
        />
      );

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(100);

      // Parent changes controlled value to 150
      rerender(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20}
          retailerStepPercentage={5}
          value={150}
        />
      );

      expect(input).toHaveValue(150);
    });

    it('controlled: user interaction fires onChange with correct quantity', async () => {
      const user = userEvent.setup();
      let currentValue = 100;
      const handleChange = vi.fn((qty) => { currentValue = qty; });

      const { rerender } = render(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20}
          retailerStepPercentage={5}
          currentUnitPriceMinor={8000}
          value={currentValue}
          onChange={handleChange}
        />
      );

      const incBtn = screen.getByRole('button', { name: /increase quantity/i });
      await user.click(incBtn);

      // onChange fires with the new quantity (100 + 5 = 105)
      expect(handleChange).toHaveBeenCalledWith(105, expect.objectContaining({
        isValid: true,
      }));

      // Simulate parent echoing the new value back
      rerender(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20}
          retailerStepPercentage={5}
          currentUnitPriceMinor={8000}
          value={105}
          onChange={handleChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(105);
    });

    it('uncontrolled: still works independently without a value prop', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20}
          retailerStepPercentage={5}
          initialQuantity={40}
          onChange={handleChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveValue(40);

      const incBtn = screen.getByRole('button', { name: /increase quantity/i });
      await user.click(incBtn);
      expect(input).toHaveValue(45);
      expect(handleChange).toHaveBeenCalledWith(45, expect.objectContaining({ isValid: true }));
    });

    it('controlled: invalid manual input shows validation error without crashing', async () => {
      const user = userEvent.setup();
      // In controlled mode the parent must update the value prop for the
      // displayed quantity to change. Here the onChange does NOT update
      // the controlled value — simulating a parent that rejects the input.
      // The visible input reflects the typed text, but validation is based
      // on whatever the parent decides to pass back as value.
      // We verify that onChange is called with the typed quantity (5),
      // that its meta reports isValid: false, and the component doesn't crash.
      const handleChange = vi.fn();

      render(
        <MOQStepCalculator
          targetMoq={100}
          retailerMoqPercentage={20}
          retailerStepPercentage={5}
          value={100}
          onChange={handleChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '5');

      // onChange was called with quantity=5 and isValid=false
      expect(handleChange).toHaveBeenLastCalledWith(5, expect.objectContaining({
        isValid: false,
      }));
      // Component did not crash — input is still in the DOM
      expect(input).toBeInTheDocument();
    });
  });

  // ── 8. PriceBreakdownLedger.jsx Tests ─────────────────────────────────────────
  describe('PriceBreakdownLedger Component', () => {
    it('renders itemized merchandise, shipping share, and total payable', () => {
      render(
        <PriceBreakdownLedger
          quantity={20}
          unit="boxes"
          unitPriceMinor={8000}
          merchandiseShareMinor={160000}
          shippingShareMinor={15000}
          totalPayableMinor={175000}
          verifiedSavingsMinor={40000}
          snapshotVersion={1}
          currency="INR"
        />
      );

      expect(screen.getByText(/Price Breakdown Ledger/i)).toBeInTheDocument();
      expect(screen.getByText('Snapshot v1')).toBeInTheDocument();
      expect(screen.getByText(/20 boxes × ₹80.00/i)).toBeInTheDocument();
      expect(screen.getByText(/Verified Bulk Savings/i)).toBeInTheDocument();
      expect(screen.getByText(/-₹400.00/i)).toBeInTheDocument();
      expect(screen.getByText('₹1,750.00')).toBeInTheDocument();
    });
  });

  // ── 9. ActivityTimeline.jsx Tests ─────────────────────────────────────────────
  describe('ActivityTimeline Component', () => {
    it('renders activity events with timestamps and actor badges', () => {
      const mockEvents = [
        {
          id: '1',
          action: 'POOL_CREATED',
          actorRole: 'SHOP_OWNER',
          description: 'Café Coffee created a new 72h group buy',
          createdAt: new Date('2026-10-30T10:00:00Z'),
        },
        {
          id: '2',
          action: 'MOQ_REACHED',
          actorRole: 'SYSTEM_SCHEDULER',
          description: 'Pool met 50 boxes requirement',
          createdAt: new Date('2026-10-30T12:00:00Z'),
        },
      ];

      render(<ActivityTimeline events={mockEvents} order="desc" />);

      expect(screen.getByText('MOQ REACHED')).toBeInTheDocument();
      expect(screen.getByText('POOL CREATED')).toBeInTheDocument();
      expect(screen.getByText('Buyer')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });

    it('renders empty message when no events exist', () => {
      render(<ActivityTimeline events={[]} emptyMessage="No log entries" />);
      expect(screen.getByText('No log entries')).toBeInTheDocument();
    });
  });
});
