/**
 * CoBuy AI — SUJ-04 Test Suite: Versioned Price Snapshot Review & Approval (/group-buys/:poolId/approve)
 *
 * Verifies:
 *  1. Successful explicit snapshot approval (renders frozen details, calls API with snapshot ID, displays success)
 *  2. Invalidated approval warning banner (renders prominent warning when approvalStatus === 'INVALIDATED_BY_CHANGE')
 *  3. Payment reconciliation — Tier-savings refund due (initial payment > frozen payable, shows refund due)
 *  4. Payment reconciliation — Additional balance due (initial payment < frozen payable, shows balance due)
 *  5. Payment reconciliation — Fully settled (initial payment === frozen payable, indicates fully settled)
 *  6. Missing snapshot error state (gracefully handles pools with no frozen snapshot)
 *  7. Missing member share error state (gracefully handles non-participants or unallocated shares)
 *  8. Superseded snapshot guard (disables approval and warns if snapshot.isSuperseded === true)
 *  9. Duplicate approval prevention (disables button if already approved for this snapshot)
 * 10. API failure handling (displays error notification and keeps page state intact)
 * 11. Role authorization guard (prevents non-shop-owners from approving)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { PoolApprovalPage } from '@/pages/groupBuys/PoolApprovalPage';
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

// ── Mock Pools API ────────────────────────────────────────────────────────────
vi.mock('@/api/pools.api', () => ({
  fetchPoolById: vi.fn(),
  approvePriceSnapshot: vi.fn(),
}));

// ── Mock Fixtures ─────────────────────────────────────────────────────────────
const buildMockSnapshot = (overrides = {}) => ({
  _id: 'snap-001',
  poolId: 'pool-test-101',
  version: 2,
  totalEligibleQuantity: 100,
  baseUnitPriceMinor: 250000,
  appliedUnitPriceMinor: 220000,
  merchandiseTotalMinor: 22000000,
  shippingCostMinor: 100000,
  shippingStatus: 'KNOWN',
  shippingAllocationMethod: 'PER_UNIT',
  taxInclusion: 'GST_EXCLUDED',
  groupTotalPayableMinor: 22100000,
  currency: 'INR',
  isSuperseded: false,
  createdAt: '2026-11-01T12:00:00.000Z',
  supplierTerms: '3 business days standard delivery',
  cancellationPolicy: 'Non-cancellable after group lock',
  quoteValidity: 'Valid until 2026-11-10',
  memberShares: [
    {
      contributionId: 'my-contrib-01',
      shopId: 'shop-my-01',
      quantity: 20,
      unit: 'BAG',
      appliedUnitPriceMinor: 220000,
      merchandiseShareMinor: 4400000,
      shippingShareMinor: 20000,
      roundingAdjustmentMinor: 0,
      totalPayableMinor: 4420000,
      verifiedSavingsMinor: 600000,
    },
    {
      contributionId: 'other-contrib-02',
      shopId: 'shop-other-02',
      quantity: 80,
      unit: 'BAG',
      appliedUnitPriceMinor: 220000,
      merchandiseShareMinor: 17600000,
      shippingShareMinor: 80000,
      roundingAdjustmentMinor: 0,
      totalPayableMinor: 17680000,
      verifiedSavingsMinor: 2400000,
    },
  ],
  ...overrides,
});

const buildMockPool = (overrides = {}) => {
  const snapshot = buildMockSnapshot(overrides.latestPriceSnapshotId || {});
  return {
    _id: 'pool-test-101',
    title: 'Premium Basmati Rice 25kg Bulk Buy',
    state: 'AWAITING_APPROVALS',
    deliveryArea: 'DELHI_NCR',
    packUnit: 'BAG',
    currency: 'INR',
    targetMoq: 100,
    totalEligibleQuantity: 100,
    latestPriceSnapshotId: snapshot,
    priceBreakdownVersion: snapshot.version,
    ...overrides,
  };
};

const buildMockContribution = (overrides = {}) => ({
  _id: 'my-contrib-01',
  poolId: 'pool-test-101',
  shopId: { _id: 'shop-my-01', name: 'My Apna Kirana' },
  quantity: 20,
  unit: 'BAG',
  totalPaidMinor: 5000000, // 50,000 INR initially paid
  totalRefundedMinor: 0,
  approvalStatus: 'PENDING_APPROVAL',
  state: 'ACTIVE',
  ...overrides,
});

function renderPoolApprovalPage(poolId = 'pool-test-101') {
  return render(
    <MemoryRouter initialEntries={[`/group-buys/${poolId}/approve`]}>
      <Routes>
        <Route path="/group-buys/:poolId/approve" element={<PoolApprovalPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SUJ-04: Versioned Price Snapshot Review & Approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { _id: 'user-sho-1', role: 'SHOP_OWNER', shopId: 'shop-my-01' };
    mockShop = { _id: 'shop-my-01', name: 'My Apna Kirana' };
  });

  // 1. Successful snapshot approval
  it('1. renders frozen snapshot information and calls approvePriceSnapshot with correct IDs', async () => {
    const mockPool = buildMockPool();
    const mockContribution = buildMockContribution();

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });
    poolsApi.approvePriceSnapshot.mockResolvedValue({
      ...mockContribution,
      approvalStatus: 'APPROVED',
      approvedPriceSnapshotId: 'snap-001',
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByText(/Review Final Price & Approve/i)).toBeInTheDocument();
    });

    // Verifies frozen snapshot information is displayed
    expect(screen.getAllByText(/Snapshot v2/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Frozen Price Snapshot Specifications \(v2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/3 business days standard delivery/i)).toBeInTheDocument();
    expect(screen.getByText(/Non-cancellable after group lock/i)).toBeInTheDocument();
    expect(screen.getByText(/Valid until 2026-11-10/i)).toBeInTheDocument();

    // Verifies explicit button text format: I Review and Approve Final Cost Breakdown (Snapshot vX)
    const approveBtn = screen.getByRole('button', {
      name: /I Review and Approve Final Cost Breakdown \(Snapshot v2\)/i,
    });
    expect(approveBtn).toBeInTheDocument();
    expect(approveBtn).not.toBeDisabled();

    // Click explicit approval
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(poolsApi.approvePriceSnapshot).toHaveBeenCalledWith('pool-test-101', 'snap-001');
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringMatching(/Snapshot v2\) approved successfully/i),
      'success'
    );
  });

  // 2. Invalidated approval warning banner
  it('2. displays prominent warning banner when participant approvalStatus is INVALIDATED_BY_CHANGE', async () => {
    const mockPool = buildMockPool();
    const mockContribution = buildMockContribution({
      approvalStatus: 'INVALIDATED_BY_CHANGE',
    });

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('invalidated-warning-banner')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Previous Approval Invalidated by Price \/ Terms Change/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your previous approval is no longer valid/i)
    ).toBeInTheDocument();

    // User is still eligible to review and approve the new snapshot
    const approveBtn = screen.getByRole('button', {
      name: /I Review and Approve Final Cost Breakdown \(Snapshot v2\)/i,
    });
    expect(approveBtn).not.toBeDisabled();
  });

  // 3. Payment reconciliation — Tier-savings refund due
  it('3. calculates and highlights tier-savings refund when amount paid exceeds snapshot total', async () => {
    // Paid 50,000 INR (5,000,000 minor); Snapshot requires 44,200 INR (4,420,000 minor)
    // Refund due = 5,800 INR (580,000 minor)
    const mockPool = buildMockPool();
    const mockContribution = buildMockContribution({
      totalPaidMinor: 5000000,
    });

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('reconciliation-refund-box')).toBeInTheDocument();
    });

    expect(screen.getByText(/Tier-Savings Refund \/ Credit Due:/i)).toBeInTheDocument();
    expect(screen.getByTestId('reconciliation-total-paid')).toHaveTextContent('₹50,000');
    expect(screen.getByTestId('reconciliation-final-payable')).toHaveTextContent('₹44,200');

    // Asserts note explains refund is not processed immediately upon clicking approve
    expect(
      screen.getByText(/refund is not processed immediately upon clicking approve/i)
    ).toBeInTheDocument();

    // Verified bulk savings vs baseline
    expect(screen.getByText(/Verified Bulk Savings vs Baseline Offer:/i)).toBeInTheDocument();
  });

  // 4. Payment reconciliation — Additional balance due
  it('4. calculates and displays additional balance due when snapshot total exceeds amount paid', async () => {
    // Snapshot requires 44,200 INR (4,420,000 minor); User only paid 30,000 INR (3,000,000 minor)
    // Additional due = 14,200 INR (1,420,000 minor)
    const mockPool = buildMockPool();
    const mockContribution = buildMockContribution({
      totalPaidMinor: 3000000,
    });

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('reconciliation-additional-box')).toBeInTheDocument();
    });

    expect(screen.getByText(/Additional Balance Outstanding:/i)).toBeInTheDocument();
    expect(screen.getByTestId('reconciliation-total-paid')).toHaveTextContent('₹30,000');
    expect(screen.getByTestId('reconciliation-final-payable')).toHaveTextContent('₹44,200');
    expect(screen.getByText(/payable through the standard PayPal Sandbox payment flow/i)).toBeInTheDocument();
  });

  // 5. Payment reconciliation — Fully settled
  it('5. displays fully settled status when amount paid exactly matches snapshot payable', async () => {
    // Both equal 44,200 INR (4,420,000 minor)
    const mockPool = buildMockPool();
    const mockContribution = buildMockContribution({
      totalPaidMinor: 4420000,
    });

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('reconciliation-settled-box')).toBeInTheDocument();
    });

    expect(screen.getByText(/Account Fully Settled/i)).toBeInTheDocument();
    expect(screen.getByText(/No additional balance is required, and no refund is due/i)).toBeInTheDocument();
  });

  // 6. Missing snapshot error state
  it('6. displays clear warning when pool does not have a frozen snapshot', async () => {
    const poolNoSnapshot = {
      _id: 'pool-test-101',
      title: 'Pool Without Snapshot',
      state: 'RECRUITING',
      latestPriceSnapshotId: null,
    };

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: poolNoSnapshot,
      contributions: [buildMockContribution()],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('pool-approval-no-snapshot')).toBeInTheDocument();
    });

    expect(screen.getByText(/No Frozen Price Snapshot Available/i)).toBeInTheDocument();
    expect(screen.queryByTestId('explicit-approval-btn')).not.toBeInTheDocument();
  });

  // 7. Missing member share error state
  it('7. displays error and disables approval when participant has no allocated share in snapshot', async () => {
    const snapshotWithoutUser = buildMockSnapshot({
      memberShares: [
        {
          contributionId: 'someone-elses-contrib',
          shopId: 'shop-other-02',
          quantity: 100,
          unit: 'BAG',
          appliedUnitPriceMinor: 220000,
          merchandiseShareMinor: 22000000,
          shippingShareMinor: 100000,
          roundingAdjustmentMinor: 0,
          totalPayableMinor: 22100000,
          verifiedSavingsMinor: 3000000,
        },
      ],
    });

    const mockPool = buildMockPool({ latestPriceSnapshotId: snapshotWithoutUser });
    const mockContribution = buildMockContribution();

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('missing-share-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/No Participant Share in This Snapshot/i)).toBeInTheDocument();
    const approveBtn = screen.getByTestId('explicit-approval-btn');
    expect(approveBtn).toBeDisabled();
  });

  // 8. Superseded snapshot guard
  it('8. renders superseded warning and disables approval when snapshot isSuperseded is true', async () => {
    const supersededSnapshot = buildMockSnapshot({ isSuperseded: true });
    const mockPool = buildMockPool({ latestPriceSnapshotId: supersededSnapshot });
    const mockContribution = buildMockContribution();

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('superseded-warning-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/Price Snapshot Superseded/i)).toBeInTheDocument();
    const approveBtn = screen.getByTestId('explicit-approval-btn');
    expect(approveBtn).toBeDisabled();
    expect(approveBtn).toHaveTextContent(/Snapshot v2 Superseded/i);
  });

  // 9. Duplicate approval prevention
  it('9. renders approved banner and disables button when exact snapshot is already approved', async () => {
    const mockPool = buildMockPool();
    const mockContribution = buildMockContribution({
      approvalStatus: 'APPROVED',
      approvedPriceSnapshotId: 'snap-001',
      approvedAt: '2026-11-01T15:00:00.000Z',
    });

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('approved-success-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/Cost Breakdown Approved \(Snapshot v2\)/i)).toBeInTheDocument();
    const approveBtn = screen.getByTestId('explicit-approval-btn');
    expect(approveBtn).toBeDisabled();
    expect(approveBtn).toHaveTextContent(/Snapshot v2 Already Approved/i);
  });

  // 10. API failure handling
  it('10. displays error notification when approvePriceSnapshot rejects', async () => {
    const mockPool = buildMockPool();
    const mockContribution = buildMockContribution();

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });
    poolsApi.approvePriceSnapshot.mockRejectedValue(new Error('Network error during snapshot approval'));

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('explicit-approval-btn')).toBeInTheDocument();
    });

    const approveBtn = screen.getByTestId('explicit-approval-btn');
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(poolsApi.approvePriceSnapshot).toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Network error during snapshot approval', 'error');
  });

  // 11. Role authorization guard
  it('11. disables approval button and shows message when user is not a SHOP_OWNER', async () => {
    mockUser = { _id: 'user-supp-1', role: 'SUPPLIER', shopId: null };

    const mockPool = buildMockPool();
    const mockContribution = buildMockContribution();

    poolsApi.fetchPoolById.mockResolvedValue({
      pool: mockPool,
      contributions: [mockContribution],
    });

    renderPoolApprovalPage();

    await waitFor(() => {
      expect(screen.getByTestId('explicit-approval-btn')).toBeInTheDocument();
    });

    const approveBtn = screen.getByTestId('explicit-approval-btn');
    expect(approveBtn).toBeDisabled();
    expect(
      screen.getByText(/Only authorized shop owners can submit formal approval/i)
    ).toBeInTheDocument();
  });
});
