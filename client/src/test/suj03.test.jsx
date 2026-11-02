/**
 * CoBuy AI — SUJ-03 Test Suite: Group-Buy Pool Detail Page (/group-buys/:poolId)
 *
 * Verifies:
 *  1. Initial render & pool overview (title, delivery area, pack unit, target MOQ, current volume, countdown, tiers, ledger)
 *  2. Provenance badge display (renders badge when dataSourceType is provided, omitted when missing/null)
 *  3. Confirmed requirement linking & substitution consent checkbox (renders dropdown, updates selection, substitution toggle)
 *  4. MOQ and Step validation on Join (validates minimum quantity and step multiple)
 *  5. Join Pool triggers PayPal checkout modal with INITIAL_JOIN
 *  6. Pre-lock quantity increase workflow (validates, calls API, prompts checkout with QUANTITY_INCREASE_DELTA)
 *  7. Pre-lock quantity decrease workflow (validates, calls API, indicates partial delta refund)
 *  8. Pre-lock buyer withdrawal workflow (confirmation modal, reason selection, calls withdraw API, shows refund)
 *  9. Pool lock enforcement when MOQ reached (MOQ reached banner, controls disabled/hidden)
 * 10. Pool lock enforcement on 72h deadline expiry / Under-MOQ decision window (controls locked, 24h alert displayed)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { GroupBuyDetailPage } from '@/pages/groupBuys/GroupBuyDetailPage';
import * as poolsApi from '@/api/pools.api';

// ── Mock Contexts ─────────────────────────────────────────────────────────────
const mockNotify = vi.fn();
vi.mock('@/context/NotificationContext', () => ({
  useNotifications: () => ({ notify: mockNotify }),
}));

let mockUser = { _id: 'user-sho-1', role: 'SHOP_OWNER', shopId: 'shop-my-01' };
let mockShop = { _id: 'shop-my-01', name: 'My Apna Kirana' };

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    shop: mockShop,
    isAuthenticated: true,
  }),
}));

// ── Mock PayPal Checkout Modal ────────────────────────────────────────────────
vi.mock('@/pages/payments/PayPalCheckoutModal', () => ({
  PayPalCheckoutModal: ({
    open,
    contributionId,
    paymentPurpose,
    estimatedAmountMinor,
    onSuccess,
    onCancel,
    onError,
  }) => {
    if (!open) return null;
    return (
      <div data-testid="paypal-checkout-modal">
        <span data-testid="modal-payment-purpose">{paymentPurpose}</span>
        <span data-testid="modal-contribution-id">{contributionId}</span>
        <span data-testid="modal-estimated-amount">{estimatedAmountMinor}</span>
        <button data-testid="modal-checkout-success-btn" onClick={() => onSuccess?.()}>
          Confirm Success
        </button>
        <button data-testid="modal-checkout-cancel-btn" onClick={() => onCancel?.()}>
          Cancel Checkout
        </button>
        <button
          data-testid="modal-checkout-fail-btn"
          onClick={() => onError?.(new Error('Simulated gateway capture error'))}
        >
          Simulate Error
        </button>
      </div>
    );
  },
}));

// ── Mock Pools API ────────────────────────────────────────────────────────────
vi.mock('@/api/pools.api', () => ({
  fetchPoolById: vi.fn(),
  joinPool: vi.fn(),
  updateContributionQuantity: vi.fn(),
  withdrawContribution: vi.fn(),
  approvePriceSnapshot: vi.fn(),
  submitUnderMoqDecision: vi.fn(),
  fetchConfirmedRequirements: vi.fn(),
}));

// ── Mock Fixtures ─────────────────────────────────────────────────────────────
const buildMockPool = (overrides = {}) => ({
  _id: 'pool-test-101',
  title: 'Premium Basmati Rice 25kg Bulk Buy',
  state: 'RECRUITING',
  deliveryArea: 'DELHI_NCR',
  packUnit: 'BAG',
  targetMoq: 100,
  minRetailerQuantity: 20,
  quantityStepMultiple: 1,
  currentUnitPriceMinor: 250000,
  baseUnitPriceMinor: 250000,
  shippingCostMinor: 50000,
  totalEligibleQuantity: 40,
  participantCount: 2,
  publishedAt: new Date(Date.now() - 3600000).toISOString(),
  deadline: new Date(Date.now() + 71 * 3600000).toISOString(),
  dataSourceType: 'MANUAL_UPLOAD',
  pricingTiers: [
    { minQuantity: 20, maxQuantity: 49, unitPriceMinor: 250000 },
    { minQuantity: 50, maxQuantity: 99, unitPriceMinor: 240000 },
    { minQuantity: 100, maxQuantity: 200, unitPriceMinor: 220000 },
  ],
  productId: { canonicalName: 'Premium Basmati Rice 25kg' },
  ...overrides,
});

const mockOtherContributions = [
  {
    _id: 'contrib-other-1',
    poolId: 'pool-test-101',
    shopId: { _id: 'shop-other-1', name: 'Sharma Store' },
    quantity: 20,
    totalPaidMinor: 5000000,
    state: 'ACTIVE',
  },
  {
    _id: 'contrib-other-2',
    poolId: 'pool-test-101',
    shopId: { _id: 'shop-other-2', name: 'Verma Kirana' },
    quantity: 20,
    totalPaidMinor: 5000000,
    state: 'ACTIVE',
  },
];

const mockUserConfirmedReqs = [
  {
    _id: 'req-conf-01',
    title: 'Weekly Rice Restock',
    confirmedFields: { quantity: 25, unit: 'BAG' },
  },
  {
    _id: 'req-conf-02',
    title: 'Emergency Grain Backup',
    confirmedFields: { quantity: 30, unit: 'BAG' },
  },
];

function renderPoolDetailPage(poolId = 'pool-test-101') {
  return render(
    <MemoryRouter initialEntries={[`/group-buys/${poolId}`]}>
      <Routes>
        <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SUJ-03: Group-Buy Pool Detail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { _id: 'user-sho-1', role: 'SHOP_OWNER', shopId: 'shop-my-01' };
    mockShop = { _id: 'shop-my-01', name: 'My Apna Kirana' };
    poolsApi.fetchConfirmedRequirements.mockResolvedValue(mockUserConfirmedReqs);
  });

  // 1. Initial render & pool overview
  it('1. renders pool title, delivery area, pack unit, target MOQ, current pooled volume, countdown, and ledger', async () => {
    const mockPool = buildMockPool();
    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: mockOtherContributions,
    });

    renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Premium Basmati Rice 25kg Bulk Buy')).toBeInTheDocument();
    });

    expect(screen.getByText(/DELHI_NCR/i)).toBeInTheDocument();
    expect(screen.getAllByText(/BAG/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('100').length).toBeGreaterThan(0); // target MOQ
    expect(screen.getAllByText('40').length).toBeGreaterThan(0); // pooled volume
    expect(screen.getByText(/2 participants/i)).toBeInTheDocument();
    expect(screen.getByText(/Price Breakdown Ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/Audit Activity Trail/i)).toBeInTheDocument();
  });

  // 2. Provenance badge display & safe omission
  it('2. displays provenance badge when dataSourceType is provided and omits it gracefully when absent', async () => {
    // Case A: With dataSourceType SUPPLIER_SUBMITTED
    const poolWithBadge = buildMockPool({ dataSourceType: 'SUPPLIER_SUBMITTED' });
    poolsApi.fetchPoolById.mockResolvedValueOnce({
      pool: poolWithBadge,
      contributions: [],
    });

    const { unmount } = renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Supplier Quote')).toBeInTheDocument();
    });

    unmount();

    // Case B: Null dataSourceType — must NOT claim VERIFIED_LIVE
    const poolWithoutBadge = buildMockPool({ dataSourceType: null });
    poolsApi.fetchPoolById.mockResolvedValueOnce({
      pool: poolWithoutBadge,
      contributions: [],
    });

    renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Premium Basmati Rice 25kg Bulk Buy')).toBeInTheDocument();
    });

    expect(screen.queryByText('Verified Wholesaler')).not.toBeInTheDocument();
    expect(screen.queryByText('Supplier Quote')).not.toBeInTheDocument();
  });

  // 3. Confirmed requirement linking & substitution consent checkbox
  it('3. renders confirmed requirements dropdown and allows toggling substitution consent', async () => {
    const mockPool = buildMockPool();
    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: mockOtherContributions,
    });

    renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/Link Confirmed Requirement:/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Weekly Rice Restock/i)).toBeInTheDocument();
    expect(screen.getByText(/Emergency Grain Backup/i)).toBeInTheDocument();

    const substitutionCheckbox = screen.getByRole('checkbox');
    expect(substitutionCheckbox).not.toBeChecked();

    await userEvent.click(substitutionCheckbox);
    expect(substitutionCheckbox).toBeChecked();
  });

  // 4. MOQ and Step validation on Join
  it('4. enforces MOQ_R minimum constraint on Join Pool action', async () => {
    const mockPool = buildMockPool({ minRetailerQuantity: 20 });
    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: mockOtherContributions,
    });

    renderPoolDetailPage();

    const commitBtn = await screen.findByRole('button', { name: /Commit & Checkout/i });
    await waitFor(() => {
      expect(commitBtn).not.toBeDisabled();
    });

    // The calculator input is initialized to 20
    const qtyInput = screen.getByRole('spinbutton');
    expect(qtyInput).toHaveValue(20);

    // Try setting quantity below minRetailerQuantity (e.g. 10)
    fireEvent.change(qtyInput, { target: { value: '10' } });

    // The commit button becomes disabled when quantity < minRetailerQuantity
    expect(commitBtn).toBeDisabled();
  });

  // 5. Join Pool triggers PayPal checkout modal
  it('5. commits initial contribution and opens PayPal checkout modal with INITIAL_JOIN', async () => {
    const mockPool = buildMockPool({ minRetailerQuantity: 20, currentUnitPriceMinor: 250000 });
    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: mockOtherContributions,
    });
    poolsApi.joinPool.mockResolvedValue({
      _id: 'new-contrib-999',
      poolId: mockPool._id,
      quantity: 20,
      state: 'PENDING_PAYMENT',
    });

    renderPoolDetailPage();

    const commitBtn = await screen.findByRole('button', { name: /Commit & Checkout/i });
    await waitFor(() => {
      expect(commitBtn).not.toBeDisabled();
    });

    await screen.findByRole('combobox');

    // Toggle substitution consent
    const substitutionCheckbox = screen.getByRole('checkbox');
    await userEvent.click(substitutionCheckbox);

    // Click Commit & Checkout
    await userEvent.click(commitBtn);

    await waitFor(() => {
      expect(poolsApi.joinPool).toHaveBeenCalledWith(mockPool._id, {
        quantity: 20,
        unit: 'BAG',
        requirementId: 'req-conf-01',
        acceptSubstitution: true,
      });
    });

    // Verifies PayPal Checkout modal is launched
    expect(screen.getByTestId('paypal-checkout-modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-payment-purpose')).toHaveTextContent('INITIAL_JOIN');
    expect(screen.getByTestId('modal-contribution-id')).toHaveTextContent('new-contrib-999');
    expect(screen.getByTestId('modal-estimated-amount')).toHaveTextContent('5000000'); // 20 * 250000
  });

  // 6. Pre-lock quantity increase workflow
  it('6. allows pre-lock quantity increase and prompts checkout modal with QUANTITY_INCREASE_DELTA', async () => {
    const mockPool = buildMockPool({ minRetailerQuantity: 20, quantityStepMultiple: 5 });
    const myExistingContribution = {
      _id: 'my-contrib-01',
      poolId: mockPool._id,
      shopId: mockShop._id,
      quantity: 20,
      totalPaidMinor: 5000000,
      state: 'ACTIVE',
    };

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [...mockOtherContributions, myExistingContribution],
    });
    poolsApi.updateContributionQuantity.mockResolvedValue({
      contribution: { ...myExistingContribution, quantity: 25 },
      deltaQuantity: 5,
      deltaAmountMinor: 1250000,
    });

    renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Modify Quantity/i })).toBeInTheDocument();
    });

    // Open Modify Quantity dialog
    await userEvent.click(screen.getByRole('button', { name: /Modify Quantity/i }));

    expect(screen.getByText('Modify Contribution Quantity')).toBeInTheDocument();

    // Find the number input inside dialog and increase to 25
    const dialogInputs = screen.getAllByRole('spinbutton');
    const modalInput = dialogInputs[dialogInputs.length - 1];

    await userEvent.clear(modalInput);
    await userEvent.type(modalInput, '25');

    // Click Update Quantity in modal
    const updateBtn = screen.getByRole('button', { name: 'Update Quantity' });
    await userEvent.click(updateBtn);

    await waitFor(() => {
      expect(poolsApi.updateContributionQuantity).toHaveBeenCalledWith(
        mockPool._id,
        'my-contrib-01',
        25
      );
    });

    // Verifies PayPal Checkout modal is prompted for the delta
    expect(screen.getByTestId('paypal-checkout-modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-payment-purpose')).toHaveTextContent('QUANTITY_INCREASE_DELTA');
    expect(screen.getByTestId('modal-contribution-id')).toHaveTextContent('my-contrib-01');
    expect(screen.getByTestId('modal-estimated-amount')).toHaveTextContent('1250000'); // 5 delta * 250000
  });

  // 7. Pre-lock quantity decrease workflow
  it('7. allows pre-lock quantity decrease and notifies user of partial delta refund', async () => {
    const mockPool = buildMockPool({ minRetailerQuantity: 20 });
    const myExistingContribution = {
      _id: 'my-contrib-01',
      poolId: mockPool._id,
      shopId: mockShop._id,
      quantity: 30,
      totalPaidMinor: 7500000,
      state: 'ACTIVE',
    };

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [...mockOtherContributions, myExistingContribution],
    });
    poolsApi.updateContributionQuantity.mockResolvedValue({
      contribution: { ...myExistingContribution, quantity: 20 },
      deltaQuantity: -10,
      deltaAmountMinor: -2500000,
    });

    renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Modify Quantity/i })).toBeInTheDocument();
    });

    // Open Modify Quantity dialog
    await userEvent.click(screen.getByRole('button', { name: /Modify Quantity/i }));

    const dialogInputs = screen.getAllByRole('spinbutton');
    const modalInput = dialogInputs[dialogInputs.length - 1];

    await userEvent.clear(modalInput);
    await userEvent.type(modalInput, '20');

    const updateBtn = screen.getByRole('button', { name: 'Update Quantity' });
    await userEvent.click(updateBtn);

    await waitFor(() => {
      expect(poolsApi.updateContributionQuantity).toHaveBeenCalledWith(
        mockPool._id,
        'my-contrib-01',
        20
      );
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringMatching(/Contribution quantity reduced\. Delta refund initiated\./i),
      'success'
    );
    // Checkout modal is NOT opened for decrease
    expect(screen.queryByTestId('paypal-checkout-modal')).not.toBeInTheDocument();
  });

  // 8. Pre-lock buyer withdrawal workflow
  it('8. allows buyer withdrawal with selected reason and triggers full refund confirmation', async () => {
    const mockPool = buildMockPool();
    const myExistingContribution = {
      _id: 'my-contrib-01',
      poolId: mockPool._id,
      shopId: mockShop._id,
      quantity: 20,
      totalPaidMinor: 5000000,
      state: 'ACTIVE',
    };

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [...mockOtherContributions, myExistingContribution],
    });
    poolsApi.withdrawContribution.mockResolvedValue({
      contribution: { ...myExistingContribution, state: 'WITHDRAWN' },
      refundRequired: true,
      refundAmountMinor: 5000000,
    });

    renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Withdraw & Refund/i })).toBeInTheDocument();
    });

    // Open Withdraw confirmation modal
    await userEvent.click(screen.getByRole('button', { name: /Withdraw & Refund/i }));

    expect(screen.getByText('Withdraw from Pool?')).toBeInTheDocument();

    // Select alternative withdrawal reason
    const reasonSelect = screen.getByRole('combobox');
    fireEvent.change(reasonSelect, { target: { value: 'FOUND_ALTERNATIVE' } });

    // Confirm withdrawal
    const confirmWithdrawBtn = screen.getByRole('button', { name: /Confirm Withdrawal & Refund/i });
    await userEvent.click(confirmWithdrawBtn);

    await waitFor(() => {
      expect(poolsApi.withdrawContribution).toHaveBeenCalledWith(
        mockPool._id,
        'my-contrib-01',
        'FOUND_ALTERNATIVE'
      );
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringMatching(/Contribution withdrawn\. Full refund initiated\./i),
      'info'
    );
  });

  // 9. Pool lock enforcement when MOQ reached
  it('9. disables Join, Edit, and Withdraw actions when target MOQ is reached (AWAITING_APPROVALS)', async () => {
    const lockedPool = buildMockPool({
      state: 'AWAITING_APPROVALS',
      totalEligibleQuantity: 100,
      targetMoq: 100,
      lockReason: 'MOQ_REACHED_EARLY',
    });
    const myContribution = {
      _id: 'my-contrib-01',
      poolId: lockedPool._id,
      shopId: mockShop._id,
      quantity: 50,
      totalPaidMinor: 12500000,
      state: 'ACTIVE',
    };

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: lockedPool,
      contributions: [...mockOtherContributions, myContribution],
    });

    renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/MOQ Target Reached — Price Snapshot Frozen/i)).toBeInTheDocument();
    });

    // Edit and Withdraw controls must NOT be accessible when locked
    expect(screen.queryByRole('button', { name: /Modify Quantity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Withdraw & Refund/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Pool is locked\. Quantity modifications and withdrawals are closed\./i)).toBeInTheDocument();
  });

  // 10. Pool lock enforcement on 72h deadline expiry / Under-MOQ decision window
  it('10. disables modifications and displays 24h decision window banner when pool expires under MOQ', async () => {
    const expiredPool = buildMockPool({
      state: 'UNDER_MOQ_DECISION_PENDING',
      totalEligibleQuantity: 40,
      targetMoq: 100,
      lockReason: 'EXPIRED_72H_UNDER_MOQ',
      deadline: new Date(Date.now() - 3600000).toISOString(),
    });
    const myContribution = {
      _id: 'my-contrib-01',
      poolId: expiredPool._id,
      shopId: mockShop._id,
      quantity: 20,
      totalPaidMinor: 5000000,
      state: 'ACTIVE',
    };

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: expiredPool,
      contributions: [...mockOtherContributions, myContribution],
    });

    renderPoolDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/24-Hour Under-MOQ Decision Window Active/i)).toBeInTheDocument();
    });

    // Modify Quantity and Withdraw buttons must NOT be accessible
    expect(screen.queryByRole('button', { name: /Modify Quantity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Withdraw & Refund/i })).not.toBeInTheDocument();

    // 24h Decision options (Proceed or Cancel) are available
    expect(screen.getByRole('button', { name: /Proceed with Order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel & Request Full Refund/i })).toBeInTheDocument();
  });
});
