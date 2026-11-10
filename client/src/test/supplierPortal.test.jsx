/**
 * CoCobuy AI — Supplier Portal Workspace Tests (SUJ-08 / Wave 4)
 *
 * Verifies:
 *  1. SupplierPortalPage renders tabs: My Offers, Incoming Quotes, Sub-MOQ Feasibility, Purchase Orders
 *  2. Loads and renders published catalogue offers with MOQ_W and tier matrices
 *  3. Computes retailer MOQ and Step preview accurately: Math.max(1, Math.round(moqW * pStep / 100))
 *  4. Creates a new offer via POST /api/admin/offers without guessing supplier identity
 *  5. Edits an existing offer via PATCH /api/admin/offers/:id without sending immutable fields
 *  6. Responds to an incoming quote with binding terms via PATCH /api/quotes/:id/respond
 *  7. Submits under-MOQ feasibility resolution via submitSupplierFeasibility API
 *  8. Updates order fulfillment status with valid backend payload fields
 *  9. Enforces explicit confirmation check before order rejection
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { SupplierPortalPage } from '@/pages/supplierPortal/SupplierPortalPage';
import * as ordersApi from '@/api/orders.api';
import * as poolsApi from '@/api/pools.api';
import axiosClient from '@/api/axiosClient';

// ── Mock Contexts ─────────────────────────────────────────────────────────────
const mockNotify = vi.fn();
vi.mock('@/context/NotificationContext', () => ({
  useNotifications: () => ({ notify: mockNotify }),
}));

let mockUser = {
  _id: 'user-supplier-01',
  role: 'SUPPLIER',
  supplierId: 'supplier-doc-01',
  name: 'North India EcoPack Wholesalers',
};

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
  }),
}));

// ── Mock APIs ─────────────────────────────────────────────────────────────────
vi.mock('@/api/orders.api', () => ({
  listOrders: vi.fn(),
  updateSupplierStatus: vi.fn(),
}));

vi.mock('@/api/pools.api', () => ({
  searchSupplierOffers: vi.fn(),
  submitSupplierFeasibility: vi.fn(),
  fetchProductCatalogue: vi.fn(),
}));

vi.mock('@/api/axiosClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockOffer = {
  _id: 'offer-01',
  supplierId: 'supplier-doc-01',
  productId: {
    _id: 'prod-01',
    canonicalName: 'Bio-Degradable Coffee Cups 250ml',
  },
  productCanonicalName: 'Bio-Degradable Coffee Cups 250ml',
  packUnit: 'BOX',
  packSize: '100 units/box',
  baseUnitPriceMinor: 8000,
  minimumOrderQuantity: 60,
  retailerMoqPercentage: 20,
  retailerStepPercentage: 1,
  availabilityStatus: 'IN_STOCK',
  deliveryAreas: ['LUCKNOW', 'KANPUR'],
  quantityTiers: [
    { minQuantity: 1, maxQuantity: 29, unitPriceMinor: 10000 },
    { minQuantity: 30, maxQuantity: 59, unitPriceMinor: 9000 },
    { minQuantity: 60, maxQuantity: null, unitPriceMinor: 8000 },
  ],
  acceptsUnderMoqOrders: true,
  leadTimeDays: 3,
  expiresAt: new Date(Date.now() + 10 * 86400000).toISOString(),
};

const mockQuote = {
  _id: 'quote-01',
  quoteNumber: 'QT-2026-0001',
  status: 'PENDING_SUPPLIER_RESPONSE',
  requestedQuantity: 50,
  unit: 'BOX',
  deliveryArea: 'LUCKNOW',
  productName: 'Bio-Degradable Coffee Cups 250ml',
  productId: { canonicalName: 'Bio-Degradable Coffee Cups 250ml' },
  createdAt: new Date().toISOString(),
};

const mockPool = {
  _id: 'pool-under-moq-01',
  title: 'Bio-Degradable Cups Pool (Under MOQ)',
  state: 'UNDER_MOQ_DECISION_PENDING',
  totalEligibleQuantity: 45,
  targetMoq: 60,
  packUnit: 'BOX',
};

const mockOrder = {
  _id: 'order-01',
  orderNumber: 'AKD-2026-0001',
  orderState: 'AWAITING_SUPPLIER_CONFIRMATION',
  supplierConfirmationStatus: 'CONFIRMED',
  totalQuantity: 60,
  unit: 'BOX',
  grandTotalMinor: 480000,
  currency: 'INR',
  createdAt: new Date().toISOString(),
};

const mockProduct = {
  _id: 'prod-01',
  canonicalName: 'Bio-Degradable Coffee Cups 250ml',
  category: 'PACKAGING',
  baseUnit: 'BOX',
};

describe('SUJ-08: Wholesaler Supplier Portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      _id: 'user-supplier-01',
      role: 'SUPPLIER',
      supplierId: 'supplier-doc-01',
      name: 'North India EcoPack Wholesalers',
    };

    poolsApi.searchSupplierOffers.mockResolvedValue([mockOffer]);
    poolsApi.fetchProductCatalogue.mockResolvedValue({ productList: [mockProduct] });
    ordersApi.listOrders.mockResolvedValue([mockOrder]);

    axiosClient.get.mockImplementation((url) => {
      if (url.includes('/quotes')) return Promise.resolve({ data: { data: [mockQuote] } });
      if (url.includes('/pools')) return Promise.resolve({ data: { data: [mockPool] } });
      return Promise.resolve({ data: [] });
    });
  });

  // ── 1. Render all workspace tabs ────────────────────────────────────────────
  it('1. renders supplier portal header and all 4 navigation tabs', async () => {
    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Wholesaler Supplier Workspace')).toBeInTheDocument();
    });

    expect(screen.getByText(/My Offers \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Incoming Quotes \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Sub-MOQ Feasibility \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Purchase Orders \(1\)/i)).toBeInTheDocument();
  });

  // ── 2. Render published catalogue offer ──────────────────────────────────────
  it('2. displays published catalogue offers with MOQ_W, MOQ_R, Step, and pricing', async () => {
    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Bio-Degradable Coffee Cups 250ml')).toBeInTheDocument();
    });

    expect(screen.getByText('IN_STOCK')).toBeInTheDocument();
    expect(screen.getByText('Sub-MOQ Accepted')).toBeInTheDocument();
    expect(screen.getByText('Wholesale MOQ:')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('Retailer MOQ (MOQ_R):')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // 20% of 60 = 12
    expect(screen.getByText('Order Step Multiple:')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument(); // 1% of 60 = 0.6 -> Math.round -> 1
  });

  // ── 3. Accurately calculates MOQ_R and Step preview ──────────────────────────
  it('3. calculates computed retailer MOQ and Step preview using Math.max(1, Math.round(...))', async () => {
    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create Offer/i })).toBeInTheDocument();
    });

    const createBtn = screen.getByRole('button', { name: /Create Offer/i });
    await userEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Create New Wholesale Offer')).toBeInTheDocument();
    });

    // Default form values: MOQ_W = 100, p_min = 20%, p_step = 1%
    // Computed MOQ_R: Math.ceil(100 * 20 / 100) = 20
    // Computed Step: Math.max(1, Math.round(100 * 1 / 100)) = 1
    expect(screen.getByText(/Retailer MOQ % \(p_min\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Retailer Step % \(p_step\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Individual buyer minimum floor: 20 BOX/i)).toBeInTheDocument();
    expect(screen.getByText(/Order increment step: \+1 BOX/i)).toBeInTheDocument();
  });

  // ── 4. Create Offer uses direct supplierId from session ──────────────────────
  it('4. creates an offer via POST /admin/offers with session supplierId', async () => {
    axiosClient.post.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create Offer/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Create Offer/i }));

    await waitFor(() => {
      expect(screen.getByText('Create New Wholesale Offer')).toBeInTheDocument();
    });

    // Enter base unit price
    const priceInput = screen.getByPlaceholderText('e.g. 120.00');
    await userEvent.type(priceInput, '75.50');

    // Submit offer
    const saveBtn = screen.getByRole('button', { name: /Publish Wholesale Offer/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(axiosClient.post).toHaveBeenCalledWith(
        '/admin/offers',
        expect.objectContaining({
          supplierId: 'supplier-doc-01',
          baseUnitPriceMinor: 7550,
          minimumOrderQuantity: 100,
          packUnit: 'BOX',
          currency: 'INR',
        })
      );
    });
  });

  // ── 5. Edit Offer sends only mutable fields ─────────────────────────────────
  it('5. edits an offer via PATCH /admin/offers/:id without sending immutable fields', async () => {
    axiosClient.patch.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Edit Offer/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Edit Offer/i }));

    await waitFor(() => {
      expect(screen.getByText('Edit Catalogue Offer')).toBeInTheDocument();
    });

    const updateBtn = screen.getByRole('button', { name: /Update Catalogue Offer/i });
    await userEvent.click(updateBtn);

    await waitFor(() => {
      expect(axiosClient.patch).toHaveBeenCalledWith(
        `/admin/offers/${mockOffer._id}`,
        expect.not.objectContaining({
          productId: expect.anything(),
          packUnit: expect.anything(),
          packSize: expect.anything(),
          currency: expect.anything(),
          supplierId: expect.anything(),
        })
      );
    });
  });

  // ── 6. Respond to incoming quote ────────────────────────────────────────────
  it('6. responds to incoming buyer quote via PATCH /quotes/:id/respond', async () => {
    axiosClient.patch.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    // Switch to QUOTES tab
    const quotesTab = screen.getByRole('button', { name: /Incoming Quotes/i });
    await userEvent.click(quotesTab);

    await waitFor(() => {
      expect(screen.getByText(/Requested Quantity:/i)).toBeInTheDocument();
    });

    const respondBtn = screen.getByRole('button', { name: /Respond to Quote/i });
    await userEvent.click(respondBtn);

    await waitFor(() => {
      expect(screen.getByText(/Respond to Buyer Quote Request/i)).toBeInTheDocument();
    });

    const unitPriceInput = screen.getByPlaceholderText('e.g. 80.00');
    await userEvent.type(unitPriceInput, '70.00');

    const submitBtn = screen.getByRole('button', { name: /Submit Binding Quote/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(axiosClient.patch).toHaveBeenCalledWith(
        `/quotes/${mockQuote._id}/respond`,
        expect.objectContaining({
          action: 'PROVIDE',
          unitPriceMinor: 7000,
        })
      );
    });
  });

  // ── 7. Submit Under-MOQ Feasibility ─────────────────────────────────────────
  it('7. submits under-MOQ feasibility resolution via submitSupplierFeasibility', async () => {
    poolsApi.submitSupplierFeasibility.mockResolvedValue({ success: true });

    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    // Switch to UNDER_MOQ tab
    const underMoqTab = screen.getByRole('button', { name: /Sub-MOQ Feasibility/i });
    await userEvent.click(underMoqTab);

    await waitFor(() => {
      expect(screen.getByText('Bio-Degradable Cups Pool (Under MOQ)')).toBeInTheDocument();
    });

    const resolveBtn = screen.getByRole('button', { name: /Resolve Feasibility/i });
    await userEvent.click(resolveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Under-MOQ Feasibility Resolution/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Submit Feasibility/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(poolsApi.submitSupplierFeasibility).toHaveBeenCalledWith(
        mockPool._id,
        { action: 'ACCEPT_UNDER_MOQ' }
      );
    });
  });

  // ── 8. Update Order Fulfillment Status ──────────────────────────────────────
  it('8. updates order fulfillment status with valid backend payload fields', async () => {
    ordersApi.updateSupplierStatus.mockResolvedValue({ success: true });

    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    // Switch to ORDERS tab
    const ordersTab = screen.getByRole('button', { name: /Purchase Orders/i });
    await userEvent.click(ordersTab);

    await waitFor(() => {
      expect(screen.getByText('AKD-2026-0001')).toBeInTheDocument();
    });

    const updateStatusBtn = screen.getByRole('button', { name: /Update Fulfillment/i });
    await userEvent.click(updateStatusBtn);

    await waitFor(() => {
      expect(screen.getByText(/Update Order Status & Fulfillment/i)).toBeInTheDocument();
    });

    const saveOrderBtn = screen.getByRole('button', { name: /Save Logistics Update/i });
    await userEvent.click(saveOrderBtn);

    await waitFor(() => {
      expect(ordersApi.updateSupplierStatus).toHaveBeenCalledWith(
        mockOrder._id,
        expect.objectContaining({
          deliveryStatus: 'DISPATCHED',
          orderState: 'SHIPPED',
        })
      );
    });
  });

  // ── 9. Requires explicit confirmation check before rejection ────────────────
  it('9. blocks order rejection if explicit confirmation checkbox is not checked', async () => {
    render(
      <MemoryRouter>
        <SupplierPortalPage />
      </MemoryRouter>
    );

    const ordersTab = screen.getByRole('button', { name: /Purchase Orders/i });
    await userEvent.click(ordersTab);

    await waitFor(() => {
      expect(screen.getByText('AKD-2026-0001')).toBeInTheDocument();
    });

    const updateStatusBtn = screen.getByRole('button', { name: /Update Fulfillment/i });
    await userEvent.click(updateStatusBtn);

    await waitFor(() => {
      expect(screen.getByText(/Update Order Status & Fulfillment/i)).toBeInTheDocument();
    });

    // Switch action type to REJECT
    const rejectTab = screen.getByRole('button', { name: 'Reject' });
    await userEvent.click(rejectTab);

    // Enter a rejection reason
    const reasonInput = screen.getByPlaceholderText('e.g. Out of stock, inventory committed elsewhere');
    await userEvent.type(reasonInput, 'Temporary plant maintenance');

    // Button should be disabled because rejectConfirmed is false
    const confirmRejectBtn = screen.getByRole('button', { name: /Reject Order & Initiate Refunds/i });
    expect(confirmRejectBtn).toBeDisabled();

    // Check the acknowledgment checkbox
    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);

    // Now button should be enabled
    expect(confirmRejectBtn).not.toBeDisabled();
    expect(ordersApi.updateSupplierStatus).not.toHaveBeenCalled();
  });
});
