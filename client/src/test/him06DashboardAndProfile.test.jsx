/**
 * HIM-06 Unit & Integration Tests
 *
 * Covers:
 *  - BuyerDashboardPage (/dashboard)
 *      1. Loading skeletons while fetching
 *      2. 4 Authoritative KPI cards from mock APIs
 *      3. Active pools rendering with MOQ progress and CountdownTimer
 *      4. Action Required banners for UNDER_MOQ_DECISION_PENDING and AWAITING_APPROVALS
 *      5. Recent requirements, recent orders, and recent notifications rendering
 *      6. Empty states on empty responses
 *      7. API error banners with Retry functionality
 *      8. Quick Actions navigation to registered routes
 *  - ProfilePage (/profile)
 *      1. Loading skeleton for SHOP_OWNER
 *      2. SHOP_OWNER view mode rendering
 *      3. SUPPLIER view mode rendering with wholesaler identity & API notice
 *      4. Role-specific interface isolation
 *      5. Edit form population with existing data
 *      6. Client-side validation & field error messages
 *      7. Successful profile update & save flow
 *      8. Cancel restores original values
 *      9. API failure handling
 *      10. Prevention of duplicate submissions while in-flight
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/context/NotificationContext', () => ({
  useNotifications: vi.fn(),
}));

vi.mock('@/api/pools.api', () => ({
  fetchPools: vi.fn(),
  fetchPoolById: vi.fn(),
}));

vi.mock('@/api/requirements.api', () => ({
  listRequirements: vi.fn(),
}));

vi.mock('@/api/orders.api', () => ({
  listOrders: vi.fn(),
}));

vi.mock('@/api/payments.api', () => ({
  paymentsApi: {
    listRefunds: vi.fn(),
  },
}));

vi.mock('@/api/shop.api', () => ({
  getMyShop: vi.fn(),
  updateMyShop: vi.fn(),
}));

// Imports after mocking
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { fetchPools, fetchPoolById } from '@/api/pools.api';
import { listRequirements } from '@/api/requirements.api';
import { listOrders } from '@/api/orders.api';
import { paymentsApi } from '@/api/payments.api';
import { getMyShop, updateMyShop } from '@/api/shop.api';

import { BuyerDashboardPage } from '@/pages/dashboard/BuyerDashboardPage';
import { ProfilePage } from '@/pages/dashboard/ProfilePage';

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const mockShopOwnerUser = {
  _id: 'user-retailer-1',
  name: 'Ramesh Gupta',
  email: 'ramesh@kirana.in',
  role: 'SHOP_OWNER',
  status: 'ACTIVE',
  shopId: 'shop-kirana-1',
};

const mockSupplierUser = {
  _id: 'user-wholesaler-1',
  name: 'North India EcoPack Wholesalers',
  email: 'sales@ecopack.in',
  role: 'SUPPLIER',
  status: 'ACTIVE',
};

const mockShopData = {
  _id: 'shop-kirana-1',
  ownerUserId: 'user-retailer-1',
  name: 'Gupta Kirana & General Store',
  businessType: 'KIRANA_RETAIL',
  deliveryArea: 'LUCKNOW',
  deliveryAddress: {
    street: 'Shop 4, Aminabad Market',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    postalCode: '226018',
    country: 'IN',
  },
  contactDetails: {
    phone: '9876543210',
    whatsapp: '9876543210',
    gstin: '09AAAAA0000A1Z5',
  },
  preferredCurrency: 'INR',
};

const mockPool1 = {
  _id: 'pool-101',
  title: 'Paper Tea Cups 150ml (Bulk 500-pack)',
  state: 'RECRUITING',
  deliveryArea: 'LUCKNOW',
  targetMoq: 100,
  totalEligibleQuantity: 75,
  baseUnitPriceMinor: 200,
  currentUnitPriceMinor: 180,
  currency: 'INR',
  packUnit: 'boxes',
  deadline: new Date(Date.now() + 86400000 * 2).toISOString(), // 48h remaining
  pricingTiers: [{ minQuantity: 50, unitPriceMinor: 180 }],
};

const mockPool2UnderMoq = {
  _id: 'pool-102',
  title: 'Organic Basmati Rice 25kg Bags',
  state: 'UNDER_MOQ_DECISION_PENDING',
  deliveryArea: 'LUCKNOW',
  targetMoq: 200,
  totalEligibleQuantity: 120,
  baseUnitPriceMinor: 250000,
  currentUnitPriceMinor: 250000,
  currency: 'INR',
  packUnit: 'bags',
  deadline: new Date(Date.now() - 3600000).toISOString(),
  decisionDeadline: new Date(Date.now() + 43200000).toISOString(), // 12h remaining
};

const mockPool3Approval = {
  _id: 'pool-103',
  title: 'Biodegradable Meal Trays 50-pack',
  state: 'AWAITING_APPROVALS',
  deliveryArea: 'LUCKNOW',
  targetMoq: 80,
  totalEligibleQuantity: 85,
  baseUnitPriceMinor: 60000,
  currentUnitPriceMinor: 52000,
  currency: 'INR',
  packUnit: 'cartons',
  deadline: new Date(Date.now() + 7200000).toISOString(),
};

const mockContributionUser1 = {
  _id: 'contrib-1',
  poolId: 'pool-101',
  shopId: 'shop-kirana-1',
  createdByUserId: 'user-retailer-1',
  quantity: 25,
  unit: 'boxes',
  state: 'ACTIVE',
  approvalStatus: 'NOT_REQUIRED_YET',
  underMoqDecision: 'NOT_APPLICABLE',
  verifiedSavingsMinor: 150000, // ₹1,500
};

const mockContributionUser2UnderMoq = {
  _id: 'contrib-2',
  poolId: 'pool-102',
  shopId: 'shop-kirana-1',
  createdByUserId: 'user-retailer-1',
  quantity: 20,
  unit: 'bags',
  state: 'ACTIVE',
  approvalStatus: 'NOT_REQUIRED_YET',
  underMoqDecision: 'PENDING',
  verifiedSavingsMinor: 0,
};

const mockContributionUser3Approval = {
  _id: 'contrib-3',
  poolId: 'pool-103',
  shopId: 'shop-kirana-1',
  createdByUserId: 'user-retailer-1',
  quantity: 15,
  unit: 'cartons',
  state: 'ACTIVE',
  approvalStatus: 'PENDING_APPROVAL',
  underMoqDecision: 'NOT_APPLICABLE',
  verifiedSavingsMinor: 120000, // ₹1,200
};

const mockRequirements = [
  {
    _id: 'req-01',
    title: 'Paper Hot Cups 150ml',
    status: 'CONFIRMED',
    createdAt: new Date().toISOString(),
    lineItems: [{ rawItemText: 'Paper Cups 150ml', quantity: 30, unit: 'boxes' }],
  },
  {
    _id: 'req-02',
    title: 'Brown Paper Bags 1kg',
    status: 'NEEDS_REVIEW',
    createdAt: new Date().toISOString(),
    lineItems: [{ rawItemText: 'Brown Bags', quantity: 50, unit: 'packs' }],
  },
];

const mockOrders = [
  {
    _id: 'ord-01',
    orderNumber: 'PO-2026-001',
    grandTotalMinor: 450000,
    currency: 'INR',
    supplierConfirmationStatus: 'CONFIRMED',
    createdAt: new Date().toISOString(),
  },
];

const mockNotifications = [
  {
    _id: 'notif-01',
    title: 'Group Buy Tier Unlocked!',
    message: 'Paper Cups 150ml reached 50-box threshold. Unit price dropped to ₹1.80.',
    isRead: false,
    createdAt: new Date().toISOString(),
  },
];

// ── Test Suites ───────────────────────────────────────────────────────────────

describe('HIM-06: Retailer Dashboard & Profile Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();

    useAuth.mockReturnValue({
      user: mockShopOwnerUser,
      shop: mockShopData,
      setShop: vi.fn(),
      refreshUser: vi.fn(),
      isAuthenticated: true,
      isShopOwner: true,
      isSupplier: false,
    });

    useNotifications.mockReturnValue({
      notifications: mockNotifications,
      unreadCount: 1,
      notify: vi.fn(),
    });

    fetchPools.mockResolvedValue([mockPool1, mockPool2UnderMoq, mockPool3Approval]);
    fetchPoolById.mockImplementation(async (poolId) => {
      if (poolId === 'pool-101') {
        return { pool: mockPool1, contributions: [mockContributionUser1] };
      }
      if (poolId === 'pool-102') {
        return { pool: mockPool2UnderMoq, contributions: [mockContributionUser2UnderMoq] };
      }
      if (poolId === 'pool-103') {
        return { pool: mockPool3Approval, contributions: [mockContributionUser3Approval] };
      }
      return { pool: null, contributions: [] };
    });

    listRequirements.mockResolvedValue({
      data: { requirements: mockRequirements },
    });

    listOrders.mockResolvedValue(mockOrders);

    paymentsApi.listRefunds.mockResolvedValue({
      refunds: [
        {
          _id: 'ref-01',
          reason: 'TIER_PRICE_DROP_SAVINGS',
          amountMinor: 50000, // ₹500
          status: 'COMPLETED',
        },
      ],
    });

    getMyShop.mockResolvedValue(mockShopData);
    updateMyShop.mockResolvedValue(mockShopData);
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. BUYER DASHBOARD PAGE TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('BuyerDashboardPage (/dashboard)', () => {
    it('1. renders loading skeleton while dashboard data is pending', async () => {
      // Delay response to check skeleton presence
      fetchPools.mockReturnValue(new Promise(() => {}));

      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Retailer Dashboard & Analytics')).toBeInTheDocument();
      expect(screen.getByText('Wave 3 (HIM-06)')).toBeInTheDocument();
      // Skeletons rendered in KPI row
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('2. KPI cards display authoritative values from mocked responses', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('kpi-active-pools')).toBeInTheDocument();
      });

      // Active Pools Joined = 3 (user participates in pool-101, pool-102, pool-103)
      expect(screen.getByTestId('kpi-active-pools')).toHaveTextContent('3');

      // Pending Snapshot Approvals = 1 (pool-103 is AWAITING_APPROVALS and user is PENDING_APPROVAL)
      expect(screen.getByTestId('kpi-pending-approvals')).toHaveTextContent('1');

      // 24h Under-MOQ Decisions Required = 1 (pool-102 is UNDER_MOQ_DECISION_PENDING)
      expect(screen.getByTestId('kpi-under-moq-decisions')).toHaveTextContent('1');

      // Total Verified Savings:
      // contrib-1 (₹1,500) + contrib-3 (₹1,200) + refund (₹500) = ₹3,200 (not hardcoded ₹4,800!)
      const savingsKpi = screen.getByTestId('kpi-verified-savings');
      expect(savingsKpi).toHaveTextContent(/₹\s*3,200/);
    });

    it('3. renders active pools with title, status, area, and participation', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Paper Tea Cups 150ml (Bulk 500-pack)')).toBeInTheDocument();
      });

      // Status badges
      expect(screen.getAllByText('RECRUITING')[0]).toBeInTheDocument();
      // Commitment badge
      expect(screen.getByText('Joined: 25 boxes')).toBeInTheDocument();
      // Area
      expect(screen.getAllByText('LUCKNOW')[0]).toBeInTheDocument();
    });

    it('4. calculates and displays MOQ progress with TierProgressBar correctly', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Paper Tea Cups 150ml (Bulk 500-pack)')).toBeInTheDocument();
      });

      // Target MOQ: 100 boxes, Current pooled: 75 boxes -> 25 needed
      expect(screen.getByText(/25 boxes needed/i)).toBeInTheDocument();
      const progressBar = screen.getAllByRole('progressbar')[0];
      expect(progressBar).toHaveAttribute('aria-valuenow', '75');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('5. passes authoritative backend deadline to CountdownTimer', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Paper Tea Cups 150ml (Bulk 500-pack)')).toBeInTheDocument();
      });

      // CountdownTimer renders with time units
      const poolSection = screen.getByTestId('active-pools-section');
      expect(within(poolSection).getByText(/Paper Tea Cups 150ml/i)).toBeInTheDocument();
      // Should have countdown clock element rendered
      expect(poolSection.querySelectorAll('svg.lucide-clock').length).toBeGreaterThan(0);
    });

    it('6. produces prominent Action Required alert for UNDER_MOQ_DECISION_PENDING', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/1 Group Pool\(s\) in 24h Under-MOQ Decision Window/i)).toBeInTheDocument();
      });

      const reviewBtn = screen.getByRole('button', { name: /Review Decision/i });
      expect(reviewBtn).toBeInTheDocument();

      await userEvent.click(reviewBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/group-buys/pool-102');
    });

    it('7. produces prominent Action Required alert for AWAITING_APPROVALS', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/1 Pool\(s\) Awaiting Final Cost Snapshot Approval/i)).toBeInTheDocument();
      });

      const approveBtn = screen.getByRole('button', { name: /Approve Snapshot/i });
      expect(approveBtn).toBeInTheDocument();

      await userEvent.click(approveBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/group-buys/pool-103');
    });

    it('8. renders recent requirements correctly', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Paper Hot Cups 150ml')).toBeInTheDocument();
      });

      const reqSection = screen.getByTestId('recent-requirements-section');
      expect(within(reqSection).getByText('Brown Paper Bags 1kg')).toBeInTheDocument();
      expect(within(reqSection).getByText('CONFIRMED')).toBeInTheDocument();
      expect(within(reqSection).getByText('NEEDS_REVIEW')).toBeInTheDocument();
    });

    it('9. renders recent orders correctly', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('PO-2026-001')).toBeInTheDocument();
      });

      expect(screen.getByText(/₹\s*4,500/)).toBeInTheDocument();
    });

    it('10. renders recent notifications from context', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Group Buy Tier Unlocked!')).toBeInTheDocument();
      });

      expect(screen.getByText(/Paper Cups 150ml reached 50-box threshold/i)).toBeInTheDocument();
    });

    it('11. renders empty states when collections return empty arrays', async () => {
      fetchPools.mockResolvedValue([]);
      listRequirements.mockResolvedValue({ data: { requirements: [] } });
      listOrders.mockResolvedValue([]);
      paymentsApi.listRefunds.mockResolvedValue({ refunds: [] });

      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/You have not joined any active pools yet/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/No purchasing requirements recorded yet/i)).toBeInTheDocument();
      expect(screen.getByText(/No finalized purchase orders recorded yet/i)).toBeInTheDocument();
      // Zero verified savings cleanly formatted, not fabricated
      expect(screen.getByTestId('kpi-verified-savings')).toHaveTextContent(/₹\s*0/);
    });

    it('12. displays error banner on API failure and retries on button click', async () => {
      fetchPools.mockRejectedValueOnce(new Error('Network connectivity issue.'));

      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Dashboard Data Fetch Error/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Network connectivity issue/i)).toBeInTheDocument();

      // Click retry
      fetchPools.mockResolvedValueOnce([mockPool1]);
      const retryBtn = screen.getByRole('button', { name: /Retry/i });
      await userEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.queryByText(/Network connectivity issue/i)).not.toBeInTheDocument();
      });
    });

    it('13. Quick Actions navigate to registered routes', async () => {
      render(
        <MemoryRouter>
          <BuyerDashboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Create Requirement')).toBeInTheDocument();
      });

      const createReqCard = screen.getByText('Create Requirement').closest('button');
      await userEvent.click(createReqCard);
      expect(mockNavigate).toHaveBeenCalledWith('/requirements/new');

      const browseSuppliersCard = screen.getByText('Browse Suppliers').closest('button');
      await userEvent.click(browseSuppliersCard);
      expect(mockNavigate).toHaveBeenCalledWith('/suppliers');

      const explorePoolsCard = screen.getByText('Explore Group Buys').closest('button');
      await userEvent.click(explorePoolsCard);
      expect(mockNavigate).toHaveBeenCalledWith('/group-buys');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. PROFILE PAGE TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('ProfilePage (/profile)', () => {
    it('1. displays loading skeleton for SHOP_OWNER while profile fetches', async () => {
      getMyShop.mockReturnValue(new Promise(() => {}));

      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      expect(screen.getByText('Business Profile & Settings')).toBeInTheDocument();
      expect(screen.getByTestId('profile-loading-skeleton')).toBeInTheDocument();
    });

    it('2. renders SHOP_OWNER view mode with complete business details', async () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('shop-profile-view')).toBeInTheDocument();
      });

      expect(screen.getByTestId('profile-shop-name')).toHaveTextContent('Gupta Kirana & General Store');
      expect(screen.getByText(/Shop 4, Aminabad Market/i)).toBeInTheDocument();
      expect(screen.getByText(/Lucknow, Uttar Pradesh - 226018/i)).toBeInTheDocument();
      expect(screen.getAllByText(/\+91 9876543210/i).length).toBeGreaterThan(0);
      expect(screen.getByText('09AAAAA0000A1Z5')).toBeInTheDocument();
      expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
    });

    it('3. renders SUPPLIER view mode with wholesaler identity and platform notice', async () => {
      useAuth.mockReturnValue({
        user: mockSupplierUser,
        shop: null,
        setShop: vi.fn(),
        refreshUser: vi.fn(),
        isAuthenticated: true,
        isShopOwner: false,
        isSupplier: true,
      });

      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      expect(screen.getByTestId('supplier-profile-view')).toBeInTheDocument();
      expect(screen.getByText('North India EcoPack Wholesalers')).toBeInTheDocument();
      expect(screen.getByText('sales@ecopack.in')).toBeInTheDocument();
      expect(screen.getByText(/Catalogue & Business Profile Administration/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Go to Supplier Portal/i })).toBeInTheDocument();

      // Does NOT show Kirana/retail edit controls or drop location
      expect(screen.queryByTestId('edit-profile-button')).not.toBeInTheDocument();
      expect(screen.queryByText(/Delivery Drop Location & Regional Zone/i)).not.toBeInTheDocument();
    });

    it('4. populates edit form with existing data when entering Edit mode', async () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('edit-profile-button'));

      expect(screen.getByTestId('shop-profile-edit-form')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Gupta Kirana & General Store')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Shop 4, Aminabad Market')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Lucknow')).toBeInTheDocument();
      expect(screen.getByDisplayValue('226018')).toBeInTheDocument();
      expect(screen.getAllByDisplayValue('9876543210').length).toBeGreaterThan(0);
    });

    it('5. displays client-side validation errors for required fields', async () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('edit-profile-button'));

      // Clear shop name
      const nameInput = screen.getByDisplayValue('Gupta Kirana & General Store');
      await userEvent.clear(nameInput);

      // Enter invalid PIN
      const pinInput = screen.getByDisplayValue('226018');
      await userEvent.clear(pinInput);
      await userEvent.type(pinInput, '123'); // Invalid length

      const saveBtn = screen.getByTestId('save-profile-button');
      await userEvent.click(saveBtn);

      expect(screen.getByText('Shop / Business name is required.')).toBeInTheDocument();
      expect(screen.getByText('Please enter a valid 6-digit postal PIN code.')).toBeInTheDocument();
      expect(updateMyShop).not.toHaveBeenCalled();
    });

    it('6. saves valid edits and refreshes view with success feedback', async () => {
      const updatedShop = {
        ...mockShopData,
        name: 'Gupta Super Mart & Kirana',
        deliveryAddress: {
          ...mockShopData.deliveryAddress,
          street: 'Shop 10-12, Aminabad High Street',
        },
      };
      updateMyShop.mockResolvedValue(updatedShop);

      const mockRefresh = vi.fn();
      useAuth.mockReturnValue({
        user: mockShopOwnerUser,
        shop: mockShopData,
        setShop: vi.fn(),
        refreshUser: mockRefresh,
        isAuthenticated: true,
        isShopOwner: true,
        isSupplier: false,
      });

      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('edit-profile-button'));

      const nameInput = screen.getByDisplayValue('Gupta Kirana & General Store');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Gupta Super Mart & Kirana');

      const saveBtn = screen.getByTestId('save-profile-button');
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(updateMyShop).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Gupta Super Mart & Kirana',
            deliveryArea: 'LUCKNOW',
            businessType: 'KIRANA_RETAIL',
          })
        );
      });

      expect(screen.getByTestId('profile-success-alert')).toBeInTheDocument();
      expect(screen.getByText('Business profile updated successfully.')).toBeInTheDocument();
      expect(mockRefresh).toHaveBeenCalled();
    });

    it('7. Cancel button restores original form values and exits edit mode', async () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('edit-profile-button'));

      const nameInput = screen.getByDisplayValue('Gupta Kirana & General Store');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Temporary Unsaved Name');

      const cancelBtn = screen.getByTestId('cancel-edit-button');
      await userEvent.click(cancelBtn);

      // Returned to view mode with original name
      expect(screen.getByTestId('shop-profile-view')).toBeInTheDocument();
      expect(screen.getByTestId('profile-shop-name')).toHaveTextContent('Gupta Kirana & General Store');
    });

    it('8. displays error alert when profile save API call fails', async () => {
      updateMyShop.mockRejectedValue(new Error('GSTIN already registered with another business.'));

      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('edit-profile-button'));

      const saveBtn = screen.getByTestId('save-profile-button');
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId('profile-error-alert')).toBeInTheDocument();
      });

      expect(screen.getByText(/GSTIN already registered with another business/i)).toBeInTheDocument();
    });

    it('9. prevents repeated save submissions while save is in-flight', async () => {
      let resolvePromise;
      updateMyShop.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );

      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('edit-profile-button'));

      const saveBtn = screen.getByTestId('save-profile-button');
      await userEvent.click(saveBtn);

      // Save button is disabled and shows spinner text
      expect(saveBtn).toBeDisabled();
      expect(screen.getByText(/Saving Changes.../i)).toBeInTheDocument();

      // Second click should not call updateMyShop again
      await userEvent.click(saveBtn);
      expect(updateMyShop).toHaveBeenCalledTimes(1);

      // Clean up in-flight promise
      await act(async () => {
        resolvePromise(mockShopData);
      });
    });
  });
});
