/**
 * CoBuy AI — Group-Buy Bug Fix Test Suite
 *
 * Tests for three bugs identified in the investigation report:
 *  1. "Publish Group-Buy" button navigates to /group-buys/create (not undefined)
 *  2. Pool creator shop name is displayed on marketplace cards and detail page
 *  3. Approval workflow: ObjectId matching, snapshot ID, missing shop safety
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { GroupBuyMarketplacePage } from '@/pages/groupBuys/GroupBuyMarketplacePage';
import { GroupBuyDetailPage } from '@/pages/groupBuys/GroupBuyDetailPage';
import * as poolsApi from '@/api/pools.api';

// ── Track navigation ──────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
  PayPalCheckoutModal: ({ open }) => {
    if (!open) return null;
    return <div data-testid="paypal-checkout-modal">PayPal Modal</div>;
  },
}));

// ── Mock Pools API ────────────────────────────────────────────────────────────
vi.mock('@/api/pools.api', () => ({
  fetchPools: vi.fn(),
  fetchPoolById: vi.fn(),
  fetchProductCatalogue: vi.fn(),
  joinPool: vi.fn(),
  updateContributionQuantity: vi.fn(),
  withdrawContribution: vi.fn(),
  approvePriceSnapshot: vi.fn(),
  submitUnderMoqDecision: vi.fn(),
  fetchConfirmedRequirements: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const buildMarketplacePool = (overrides = {}) => ({
  _id: 'pool-mkt-01',
  title: 'Test Bulk Pool',
  state: 'RECRUITING',
  deliveryArea: 'DELHI_NCR',
  packUnit: 'BOX',
  targetMoq: 100,
  minRetailerQuantity: 20,
  quantityStepMultiple: 1,
  currentUnitPriceMinor: 50000,
  baseUnitPriceMinor: 50000,
  totalEligibleQuantity: 40,
  participantCount: 2,
  publishedAt: new Date(Date.now() - 3600000).toISOString(),
  deadline: new Date(Date.now() + 71 * 3600000).toISOString(),
  productId: 'product-01',
  creatorShopName: null,
  ...overrides,
});

const buildDetailPool = (overrides = {}) => ({
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
  productId: { canonicalName: 'Premium Basmati Rice 25kg' },
  latestPriceSnapshotId: null,
  creatorShopName: null,
  ...overrides,
});

// ──────────────────────────────────────────────────────────────────────────────
// ISSUE 1: Publish Group-Buy button navigation
// ──────────────────────────────────────────────────────────────────────────────
describe('Issue 1: Publish Group-Buy button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to /group-buys/create when Publish Group-Buy header button is clicked', async () => {
    const pool = buildMarketplacePool();
    poolsApi.fetchPools.mockResolvedValue([pool]);
    poolsApi.fetchProductCatalogue.mockResolvedValue({
      productMap: { 'product-01': { canonicalName: 'Test Product', category: 'GROCERY' } },
    });

    render(
      <MemoryRouter initialEntries={['/group-buys']}>
        <GroupBuyMarketplacePage />
      </MemoryRouter>
    );

    const publishBtn = await screen.findByRole('button', { name: /Publish Group-Buy/i });
    await userEvent.click(publishBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/group-buys/create');
  });

  it('navigates to /group-buys/create from empty state button as well', async () => {
    poolsApi.fetchPools.mockResolvedValue([]);
    poolsApi.fetchProductCatalogue.mockResolvedValue({ productMap: {} });

    render(
      <MemoryRouter initialEntries={['/group-buys']}>
        <GroupBuyMarketplacePage />
      </MemoryRouter>
    );

    const createBtn = await screen.findByRole('button', { name: /Create First Pool/i });
    await userEvent.click(createBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/group-buys/create');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ISSUE 2: Pool creator information display
// ──────────────────────────────────────────────────────────────────────────────
describe('Issue 2: Pool creator information', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { _id: 'user-sho-1', role: 'SHOP_OWNER', shopId: 'shop-my-01' };
    mockShop = { _id: 'shop-my-01', name: 'My Apna Kirana' };
  });

  it('displays creator shop name on marketplace pool cards when available', async () => {
    const pool = buildMarketplacePool({ creatorShopName: 'Sharma Wholesale' });
    poolsApi.fetchPools.mockResolvedValue([pool]);
    poolsApi.fetchProductCatalogue.mockResolvedValue({
      productMap: { 'product-01': { canonicalName: 'Test', category: 'GROCERY' } },
    });

    render(
      <MemoryRouter initialEntries={['/group-buys']}>
        <GroupBuyMarketplacePage />
      </MemoryRouter>
    );

    const creatorEl = await screen.findByTestId('pool-creator-shop');
    expect(creatorEl).toHaveTextContent('by Sharma Wholesale');
  });

  it('does not render creator element when creatorShopName is null', async () => {
    const pool = buildMarketplacePool({ creatorShopName: null });
    poolsApi.fetchPools.mockResolvedValue([pool]);
    poolsApi.fetchProductCatalogue.mockResolvedValue({ productMap: { 'product-01': { canonicalName: 'T', category: 'G' } } });

    render(
      <MemoryRouter initialEntries={['/group-buys']}>
        <GroupBuyMarketplacePage />
      </MemoryRouter>
    );

    await screen.findByText('Test Bulk Pool');
    expect(screen.queryByTestId('pool-creator-shop')).not.toBeInTheDocument();
  });

  it('displays creator shop name on pool detail page when available', async () => {
    const pool = buildDetailPool({ creatorShopName: 'Verma Traders' });
    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions: [] });
    poolsApi.fetchConfirmedRequirements.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Published by/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Verma Traders')).toBeInTheDocument();
  });

  it('does not render "Published by" when creatorShopName is null on detail page', async () => {
    const pool = buildDetailPool({ creatorShopName: null });
    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions: [] });
    poolsApi.fetchConfirmedRequirements.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Premium Basmati Rice 25kg Bulk Buy')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Published by/i)).not.toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ISSUE 3: Approval workflow fixes
// ──────────────────────────────────────────────────────────────────────────────
describe('Issue 3: Approval workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { _id: 'user-sho-1', role: 'SHOP_OWNER', shopId: 'shop-my-01' };
    mockShop = { _id: 'shop-my-01', name: 'My Apna Kirana' };
    poolsApi.fetchConfirmedRequirements.mockResolvedValue([]);
  });

  it('matches myContribution correctly when shopId is a raw string (not populated object)', async () => {
    // Simulates unpopulated shopId: plain string instead of { _id, name }
    const pool = buildDetailPool({
      state: 'AWAITING_APPROVALS',
      totalEligibleQuantity: 100,
      latestPriceSnapshotId: 'snapshot-001',
    });
    const contributions = [
      {
        _id: 'contrib-mine',
        poolId: pool._id,
        shopId: 'shop-my-01', // raw string, not { _id: 'shop-my-01', name: '...' }
        quantity: 50,
        totalPaidMinor: 12500000,
        state: 'ACTIVE',
        approvalStatus: 'PENDING_APPROVAL',
      },
    ];

    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions });

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    // If myContribution is matched, "My Contribution" heading should render
    await waitFor(() => {
      expect(screen.getByText('My Contribution')).toBeInTheDocument();
    });
  });

  it('matches myContribution when shopId is a populated object', async () => {
    const pool = buildDetailPool({
      state: 'AWAITING_APPROVALS',
      totalEligibleQuantity: 100,
      latestPriceSnapshotId: 'snapshot-001',
    });
    const contributions = [
      {
        _id: 'contrib-mine',
        poolId: pool._id,
        shopId: { _id: 'shop-my-01', name: 'My Apna Kirana' },
        quantity: 50,
        totalPaidMinor: 12500000,
        state: 'ACTIVE',
        approvalStatus: 'PENDING_APPROVAL',
      },
    ];

    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions });

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('My Contribution')).toBeInTheDocument();
    });
  });

  it('shows "Recruitment Closed" when shop is null (no myContribution match)', async () => {
    mockShop = null;
    mockUser = { _id: 'user-sho-1', role: 'SHOP_OWNER', shopId: null };

    const pool = buildDetailPool({
      state: 'AWAITING_APPROVALS',
      totalEligibleQuantity: 100,
      latestPriceSnapshotId: 'snapshot-001',
    });
    const contributions = [
      {
        _id: 'contrib-other',
        poolId: pool._id,
        shopId: 'shop-other-01',
        quantity: 50,
        totalPaidMinor: 12500000,
        state: 'ACTIVE',
        approvalStatus: 'PENDING_APPROVAL',
      },
    ];

    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions });

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Recruitment Closed')).toBeInTheDocument();
    });
    expect(screen.queryByText('My Contribution')).not.toBeInTheDocument();
  });

  it('shows approval button in AWAITING_APPROVALS when participant has PENDING_APPROVAL', async () => {
    const pool = buildDetailPool({
      state: 'AWAITING_APPROVALS',
      totalEligibleQuantity: 100,
      latestPriceSnapshotId: { _id: 'snapshot-001' },
    });
    const contributions = [
      {
        _id: 'contrib-mine',
        poolId: pool._id,
        shopId: { _id: 'shop-my-01', name: 'My Apna Kirana' },
        quantity: 50,
        totalPaidMinor: 12500000,
        state: 'ACTIVE',
        approvalStatus: 'PENDING_APPROVAL',
      },
    ];

    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions });

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const approveBtn = await screen.findByRole('button', { name: /Approve Cost Breakdown/i });
    expect(approveBtn).toBeInTheDocument();
  });

  it('hides approval button when approvalStatus is already APPROVED', async () => {
    const pool = buildDetailPool({
      state: 'AWAITING_APPROVALS',
      totalEligibleQuantity: 100,
      latestPriceSnapshotId: { _id: 'snapshot-001' },
    });
    const contributions = [
      {
        _id: 'contrib-mine',
        poolId: pool._id,
        shopId: { _id: 'shop-my-01', name: 'My Apna Kirana' },
        quantity: 50,
        totalPaidMinor: 12500000,
        state: 'ACTIVE',
        approvalStatus: 'APPROVED',
      },
    ];

    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions });

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('My Contribution')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Approve Cost Breakdown/i })).not.toBeInTheDocument();
  });

  it('calls approvePriceSnapshot with latestPriceSnapshotId (not activePriceSnapshotId)', async () => {
    const pool = buildDetailPool({
      state: 'AWAITING_APPROVALS',
      totalEligibleQuantity: 100,
      latestPriceSnapshotId: { _id: 'snapshot-abc-123' },
    });
    const contributions = [
      {
        _id: 'contrib-mine',
        poolId: pool._id,
        shopId: { _id: 'shop-my-01', name: 'My Apna Kirana' },
        quantity: 50,
        totalPaidMinor: 12500000,
        state: 'ACTIVE',
        approvalStatus: 'PENDING_APPROVAL',
      },
    ];

    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions });
    poolsApi.approvePriceSnapshot.mockResolvedValue({ approvalStatus: 'APPROVED' });

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const approveBtn = await screen.findByRole('button', { name: /Approve Cost Breakdown/i });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(poolsApi.approvePriceSnapshot).toHaveBeenCalledWith(
        'pool-test-101',
        'snapshot-abc-123'
      );
    });
  });

  it('passes raw string snapshotId when latestPriceSnapshotId is not populated', async () => {
    const pool = buildDetailPool({
      state: 'AWAITING_APPROVALS',
      totalEligibleQuantity: 100,
      latestPriceSnapshotId: 'snapshot-raw-string',
    });
    const contributions = [
      {
        _id: 'contrib-mine',
        poolId: pool._id,
        shopId: 'shop-my-01',
        quantity: 50,
        totalPaidMinor: 12500000,
        state: 'ACTIVE',
        approvalStatus: 'PENDING_APPROVAL',
      },
    ];

    poolsApi.fetchPoolById.mockResolvedValue({ pool, contributions });
    poolsApi.approvePriceSnapshot.mockResolvedValue({ approvalStatus: 'APPROVED' });

    render(
      <MemoryRouter initialEntries={['/group-buys/pool-test-101']}>
        <Routes>
          <Route path="/group-buys/:poolId" element={<GroupBuyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const approveBtn = await screen.findByRole('button', { name: /Approve Cost Breakdown/i });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(poolsApi.approvePriceSnapshot).toHaveBeenCalledWith(
        'pool-test-101',
        'snapshot-raw-string'
      );
    });
  });
});
