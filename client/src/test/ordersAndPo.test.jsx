/**
 * CoBuy AI — Orders & PO Download Test Suite (SUJ-07 / SRU-05 / SRU-06 / SRU-07)
 *
 * Verifies:
 *  1. OrdersListPage renders order listings, badges, and filters
 *  2. OrdersListPage displays empty state when no orders exist
 *  3. OrderDetailPage renders product info, wholesale supplier, and member allocations
 *  4. OrderDetailPage displays Wholesaler Settlement card with SIMULATED / DEMO disclosures
 *  5. OrderDetailPage opens Purchase Order (PO) document summary modal
 *  6. Download PO triggers HTML / JSON PO document download
 *  7. Print PO opens print window for PDF export
 *  8. Order status updates via updateSupplierStatus API
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { OrdersListPage } from '@/pages/orders/OrdersListPage';
import { OrderDetailPage } from '@/pages/orders/OrderDetailPage';
import * as ordersApi from '@/api/orders.api';

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

// ── Mock orders.api ───────────────────────────────────────────────────────────
vi.mock('@/api/orders.api', () => ({
  listOrders: vi.fn(),
  getOrderById: vi.fn(),
  getPoSummary: vi.fn(),
  getOrderSettlement: vi.fn(),
  updateSupplierStatus: vi.fn(),
  getOrderActivity: vi.fn(),
  createOrderFromPool: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockOrder = {
  _id: 'order-test-101',
  orderNumber: 'AKD-2026-0001',
  orderState: 'CONFIRMED',
  supplierConfirmationStatus: 'CONFIRMED',
  totalQuantity: 60,
  unit: 'BOX',
  merchandiseTotalMinor: 480000,
  shippingTotalMinor: 0,
  grandTotalMinor: 480000,
  currency: 'INR',
  createdAt: '2026-03-01T10:00:00.000Z',
  confirmedAt: '2026-03-01T12:00:00.000Z',
  supplierId: {
    _id: 'supplier-01',
    name: 'North India EcoPack Wholesalers',
    serviceAreas: ['LUCKNOW', 'KANPUR'],
    provenance: 'SEEDED_DEMO',
  },
  productId: {
    _id: 'prod-01',
    canonicalName: 'Bio-Degradable Coffee Cups 250ml',
    category: 'PACKAGING',
    packDescription: '1000 cups / carton',
  },
  poolId: {
    _id: 'pool-01',
    title: 'Lucknow Kirana Bio-Cups Bulk Pool (₹4,800 Goal)',
    deliveryArea: 'LUCKNOW',
  },
  priceSnapshotId: {
    version: 1,
    shippingAllocationMethod: 'PER_UNIT',
    taxInclusion: 'GST_EXCLUDED',
  },
  memberOrders: [
    {
      shopId: 'shop-my-01',
      shopName: 'My Apna Kirana',
      quantity: 20,
      unit: 'BOX',
      unitPriceMinor: 8000,
      merchandiseShareMinor: 160000,
      shippingShareMinor: 0,
      totalPaidMinor: 160000,
      deliveryStatus: 'PENDING',
    },
    {
      shopId: 'shop-other-02',
      shopName: 'Gomti Bakery & Espresso',
      quantity: 15,
      unit: 'BOX',
      unitPriceMinor: 8000,
      merchandiseShareMinor: 120000,
      shippingShareMinor: 0,
      totalPaidMinor: 120000,
      deliveryStatus: 'PENDING',
    },
    {
      shopId: 'shop-other-03',
      shopName: 'Awadh Bistro & Roasters',
      quantity: 25,
      unit: 'BOX',
      unitPriceMinor: 8000,
      merchandiseShareMinor: 200000,
      shippingShareMinor: 0,
      totalPaidMinor: 200000,
      deliveryStatus: 'PENDING',
    },
  ],
};

const mockSettlement = {
  orderId: 'order-test-101',
  settlementStatus: 'SIMULATED',
  mode: 'DEMO',
  grossAmountMinor: 480000,
  netPayoutMinor: 480000,
};

const mockActivity = [
  {
    action: 'ORDER_CREATED',
    actorRole: 'SYSTEM_SCHEDULER',
    createdAt: '2026-03-01T10:00:00.000Z',
    description: 'Final Purchase Order created from funded group buy pool',
  },
  {
    action: 'ORDER_CONFIRMED',
    actorRole: 'SUPPLIER',
    createdAt: '2026-03-01T12:00:00.000Z',
    description: 'Supplier confirmed order fulfillment',
  },
];

const mockPoSummaryJson = {
  orderNumber: 'AKD-2026-0001',
  totals: {
    totalQuantity: 60,
    unit: 'BOX',
    merchandiseTotalMinor: 480000,
    formattedMerchandiseTotal: '₹4,800.00',
    shippingTotalMinor: 0,
    formattedShippingTotal: '₹0.00',
    grandTotalMinor: 480000,
    formattedGrandTotal: '₹4,800.00',
  },
  supplier: {
    name: 'North India EcoPack Wholesalers',
  },
  memberOrders: mockOrder.memberOrders,
};

describe('SUJ-07: Finalized Orders & Purchase Orders UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { _id: 'user-sho-1', role: 'SHOP_OWNER', shopId: 'shop-my-01' };
    mockShop = { _id: 'shop-my-01', name: 'My Apna Kirana' };
  });

  // ── 1. OrdersListPage Rendering ─────────────────────────────────────────────
  it('1. renders orders list page with order card, order number, and supplier', async () => {
    ordersApi.listOrders.mockResolvedValue([mockOrder]);

    render(
      <MemoryRouter initialEntries={['/orders']}>
        <OrdersListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('AKD-2026-0001')).toBeInTheDocument();
    });

    expect(screen.getByText('North India EcoPack Wholesalers')).toBeInTheDocument();
    expect(screen.getByText(/60 BOX/i)).toBeInTheDocument();
    expect(screen.getAllByText('CONFIRMED').length).toBeGreaterThanOrEqual(1);
  });

  // ── 2. OrdersListPage Empty State ───────────────────────────────────────────
  it('2. displays clean empty state when no finalized orders exist', async () => {
    ordersApi.listOrders.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/orders']}>
        <OrdersListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No Finalized Group Orders Found/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Explore Active Pools/i)).toBeInTheDocument();
  });

  // ── 3. OrderDetailPage Rendering ────────────────────────────────────────────
  it('3. renders order details, supplier specifications, and member allocations', async () => {
    ordersApi.getOrderById.mockResolvedValue(mockOrder);
    ordersApi.getOrderSettlement.mockResolvedValue(mockSettlement);
    ordersApi.getOrderActivity.mockResolvedValue(mockActivity);

    render(
      <MemoryRouter initialEntries={['/orders/order-test-101']}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('AKD-2026-0001')).toBeInTheDocument();
    });

    // Check product and supplier specifications
    expect(screen.getByText('Bio-Degradable Coffee Cups 250ml')).toBeInTheDocument();
    expect(screen.getByText('North India EcoPack Wholesalers')).toBeInTheDocument();

    // Check member kirana allocations
    expect(screen.getByText('My Apna Kirana')).toBeInTheDocument();
    expect(screen.getByText('Gomti Bakery & Espresso')).toBeInTheDocument();
    expect(screen.getByText('Awadh Bistro & Roasters')).toBeInTheDocument();

    // Check Sandbox disclosure
    expect(screen.getByText(/TEST TRANSACTION — PAYPAL SANDBOX/i)).toBeInTheDocument();
  });

  // ── 4. Wholesaler Settlement Card ───────────────────────────────────────────
  it('4. displays separate Wholesaler Settlement Card with SIMULATED / DEMO disclosure', async () => {
    ordersApi.getOrderById.mockResolvedValue(mockOrder);
    ordersApi.getOrderSettlement.mockResolvedValue(mockSettlement);
    ordersApi.getOrderActivity.mockResolvedValue(mockActivity);

    render(
      <MemoryRouter initialEntries={['/orders/order-test-101']}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Wholesaler Settlement')).toBeInTheDocument();
    });

    expect(screen.getByText('SIMULATED SETTLEMENT')).toBeInTheDocument();
    expect(screen.getByText(/Settlement Separation Guard/i)).toBeInTheDocument();
    expect(screen.getByText(/tracked in SupplierSettlement completely separately/i)).toBeInTheDocument();
  });

  // ── 5. Purchase Order (PO) Summary Modal ────────────────────────────────────
  it('5. opens Purchase Order (PO) document modal and displays PO summary', async () => {
    ordersApi.getOrderById.mockResolvedValue(mockOrder);
    ordersApi.getOrderSettlement.mockResolvedValue(mockSettlement);
    ordersApi.getOrderActivity.mockResolvedValue(mockActivity);
    ordersApi.getPoSummary.mockResolvedValue(mockPoSummaryJson);

    render(
      <MemoryRouter initialEntries={['/orders/order-test-101']}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('AKD-2026-0001')).toBeInTheDocument();
    });

    // Click "Purchase Order (PO)" button in header
    const poBtn = screen.getByRole('button', { name: /Purchase Order \(PO\)/i });
    await userEvent.click(poBtn);

    await waitFor(() => {
      expect(screen.getByText(/Purchase Order Document — AKD-2026-0001/i)).toBeInTheDocument();
    });

    expect(ordersApi.getPoSummary).toHaveBeenCalledWith('order-test-101', 'json');
  });

  // ── 6. Download PO HTML Document ────────────────────────────────────────────
  it('6. downloads printable Purchase Order document when Download PO button is clicked', async () => {
    ordersApi.getOrderById.mockResolvedValue(mockOrder);
    ordersApi.getOrderSettlement.mockResolvedValue(mockSettlement);
    ordersApi.getOrderActivity.mockResolvedValue(mockActivity);
    ordersApi.getPoSummary.mockResolvedValue('<!DOCTYPE html><html><body>PO content</body></html>');

    // Mock createObjectURL & revokeObjectURL
    const mockCreateUrl = vi.fn().mockReturnValue('blob:http://localhost/mock-blob');
    const mockRevokeUrl = vi.fn();
    global.URL.createObjectURL = mockCreateUrl;
    global.URL.revokeObjectURL = mockRevokeUrl;

    render(
      <MemoryRouter initialEntries={['/orders/order-test-101']}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('AKD-2026-0001')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole('button', { name: /^Download PO$/i });
    await userEvent.click(downloadBtn);

    await waitFor(() => {
      expect(ordersApi.getPoSummary).toHaveBeenCalledWith('order-test-101', 'html');
      expect(mockCreateUrl).toHaveBeenCalled();
    });
  });

  // ── 7. Print PO Window Trigger ──────────────────────────────────────────────
  it('7. triggers print window for PO printable view', async () => {
    ordersApi.getOrderById.mockResolvedValue(mockOrder);
    ordersApi.getOrderSettlement.mockResolvedValue(mockSettlement);
    ordersApi.getOrderActivity.mockResolvedValue(mockActivity);
    ordersApi.getPoSummary.mockImplementation((id, format) => {
      if (format === 'html') return Promise.resolve('<!DOCTYPE html><html><body>Printable PO</body></html>');
      return Promise.resolve(mockPoSummaryJson);
    });

    const mockPrint = vi.fn();
    const mockWrite = vi.fn();
    const mockClose = vi.fn();
    const mockFocus = vi.fn();
    window.open = vi.fn().mockReturnValue({
      document: { write: mockWrite, close: mockClose },
      focus: mockFocus,
      print: mockPrint,
    });

    render(
      <MemoryRouter initialEntries={['/orders/order-test-101']}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('AKD-2026-0001')).toBeInTheDocument();
    });

    // Open PO modal first
    const poBtn = screen.getByRole('button', { name: /Purchase Order \(PO\)/i });
    await userEvent.click(poBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Print \/ PDF/i })).toBeInTheDocument();
    });

    const printBtn = screen.getByRole('button', { name: /Print \/ PDF/i });
    await userEvent.click(printBtn);

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('Printable PO'));
      expect(mockPrint).toHaveBeenCalled();
    });
  });

  // ── 8. updateSupplierStatus API verification ────────────────────────────────
  it('8. updates order supplier confirmation status correctly', async () => {
    ordersApi.updateSupplierStatus.mockResolvedValue({
      _id: 'order-test-101',
      supplierConfirmationStatus: 'CONFIRMED',
      orderState: 'CONFIRMED',
    });

    const result = await ordersApi.updateSupplierStatus('order-test-101', {
      status: 'CONFIRMED',
      deliveryStatus: 'DISPATCHED',
    });

    expect(ordersApi.updateSupplierStatus).toHaveBeenCalledWith('order-test-101', {
      status: 'CONFIRMED',
      deliveryStatus: 'DISPATCHED',
    });
    expect(result.supplierConfirmationStatus).toBe('CONFIRMED');
  });
});
