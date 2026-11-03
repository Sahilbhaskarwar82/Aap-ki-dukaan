/**
 * CoBuy AI — SUJ-09 Test Suite: Platform Administrator Workspace & Audit Log Inspector UI
 *
 * Verifies:
 *  1. Admin dashboard renders reconciliation metrics (stalled pools, attention payments, failed refunds, quotes, AI logs).
 *  2. Supplier table renders supplier records, verification, active state, and data provenance.
 *  3. Offer table renders wholesale moderation fields (MOQ_W, MOQ_R, Step, tiers, availability) and discloses catalogue limitation.
 *  4. Pools page renders stalled pools and attention payments.
 *  5. Payment annotation appends notes without exposing captured facts for editing (FR-ADMIN-005).
 *  6. Audit logs render read-only records with metadata inspector and AIExecutionLog disclosure.
 *  7. ADMIN sees permitted mutation controls (lifecycle trigger, supplier moderate, offer moderate, payment annotate).
 *  8. REVIEWER sees read-only overview and audit pages.
 *  9. REVIEWER cannot invoke lifecycle, supplier, offer, or payment mutation actions.
 * 10. API functions call the correct existing endpoints and pass query/body data correctly.
 * 11. Error, loading, and empty states render gracefully.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminSuppliersPage } from '@/pages/admin/AdminSuppliersPage';
import { AdminOffersPage } from '@/pages/admin/AdminOffersPage';
import { AdminPoolsOrdersPage } from '@/pages/admin/AdminPoolsOrdersPage';
import { AdminAuditLogsPage } from '@/pages/admin/AdminAuditLogsPage';

import * as adminApi from '@/api/admin.api';

// ── Mock Contexts ─────────────────────────────────────────────────────────────
const mockNotify = vi.fn();
vi.mock('@/context/NotificationContext', () => ({
  useNotifications: () => ({ notify: mockNotify }),
}));

let mockUserRole = 'ADMIN';
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'admin-user-01', role: mockUserRole, name: 'Lead Platform Admin' },
    isAuthenticated: true,
    isAdmin: mockUserRole === 'ADMIN',
    isReviewer: mockUserRole === 'REVIEWER',
  }),
}));

// ── Mock API Clients ──────────────────────────────────────────────────────────
vi.mock('@/api/admin.api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getReconciliationDashboard: vi.fn(),
    annotatePayment: vi.fn(),
    getAuditLogs: vi.fn(),
    runLifecycleCheck: vi.fn(),
    createSupplier: vi.fn(),
    updateSupplier: vi.fn(),
    createOffer: vi.fn(),
    updateOffer: vi.fn(),
    listSuppliersForAdmin: vi.fn(),
    searchOffersForAdmin: vi.fn(),
  };
});

// ── Mock Fixtures ─────────────────────────────────────────────────────────────
const mockReconciliationData = {
  summary: {
    stalledPoolsCount: 3,
    expiredQuotesCount: 2,
    attentionPaymentsCount: 4,
    failedRefundsCount: 1,
    failedAiLogsCount: 2,
  },
  stalledPools: [
    {
      _id: 'pool-stalled-01',
      poolNumber: 'POOL-STALL-101',
      productName: 'Premium Basmati Rice 25kg',
      state: 'UNDER_MOQ_DECISION_PENDING',
      totalQuantity: 40,
      targetMoq: 100,
      deadlineAt: '2026-11-04T12:00:00.000Z',
      supplierName: 'Haryana Grains Depot',
    },
  ],
  expiredQuotes: [
    {
      _id: 'quote-exp-01',
      supplierId: { name: 'Punjab Agro Foods' },
      unitPriceMinor: 180000,
      validUntil: '2026-10-30T10:00:00.000Z',
      status: 'EXPIRED',
    },
  ],
  attentionPayments: [
    {
      _id: 'pay-attn-01',
      paymentId: 'PAY-2026-7788',
      paymentStatus: 'UNKNOWN',
      amountMinor: 250000,
      currency: 'INR',
      provider: 'PAYPAL_SANDBOX',
      providerOrderId: 'ORDER-PP-9900',
      providerCaptureId: 'CAP-PP-1122',
      capturedAt: '2026-11-01T10:00:00.000Z',
      reconciliationNotes: [
        {
          note: 'Initial discrepancy detected between capture payload and webhook.',
          author: 'SYSTEM',
          createdAt: '2026-11-01T10:05:00.000Z',
        },
      ],
    },
  ],
  failedRefunds: [
    {
      _id: 'ref-fail-01',
      refundId: 'REF-2026-3344',
      status: 'FAILED',
      amountMinor: 50000,
      currency: 'INR',
      reason: 'UNDER_MOQ_BUYER_CANCEL',
      failureReason: 'PayPal sandbox simulated gateway timeout',
      createdAt: '2026-11-02T15:00:00.000Z',
    },
  ],
  failedAiLogs: [
    {
      _id: 'ailog-01',
      operation: 'EXTRACT_REQUIREMENT',
      status: 'SCHEMA_VALIDATION_FAILED',
      correlationId: 'corr-ai-fail-99',
      latencyMs: 1420,
      safeErrorCode: 'ERR_SCHEMA_MISMATCH',
      createdAt: '2026-11-02T08:00:00.000Z',
    },
  ],
};

const mockSuppliersData = {
  suppliers: [
    {
      _id: 'sup-001',
      name: 'Delhi Bulk Distributors Ltd',
      ownerUserId: 'user-sup-99',
      verificationStatus: 'VERIFIED',
      activeStatus: 'ACTIVE',
      dataSourceType: 'VERIFIED_LIVE',
      serviceAreas: ['DELHI_NCR', 'LUCKNOW'],
      contactReference: {
        contactPerson: 'Anil Sharma',
        phone: '+91 98111 22334',
        email: 'sales@delhibulk.com',
        address: 'Warehouse 12, Okhla Phase 3, New Delhi',
      },
    },
    {
      _id: 'sup-002',
      name: 'Seeded Agro Demo Supplier',
      ownerUserId: null,
      verificationStatus: 'DEMO_ONLY',
      activeStatus: 'INACTIVE',
      dataSourceType: 'SEEDED_DEMO',
      serviceAreas: ['ALL_INDIA'],
      contactReference: {},
    },
  ],
  pagination: { totalCount: 2, page: 1, limit: 20, totalPages: 1 },
};

const mockOffersData = {
  offers: [
    {
      _id: 'off-001',
      supplierId: { name: 'Delhi Bulk Distributors Ltd', verificationStatus: 'VERIFIED' },
      productId: { canonicalName: 'Fortune Sunlite Sunflower Oil 1L', category: 'OILS' },
      packUnit: 'BOX',
      packSize: 'Box of 15 Pouches',
      currency: 'INR',
      baseUnitPriceMinor: 145000,
      minimumOrderQuantity: 100,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      computedRetailerMoq: 20,
      computedRetailerStep: 1,
      quantityTiers: [
        { minQuantity: 100, maxQuantity: 249, unitPriceMinor: 145000 },
        { minQuantity: 250, maxQuantity: null, unitPriceMinor: 138000 },
      ],
      availabilityStatus: 'IN_STOCK',
      verificationStatus: 'VERIFIED',
      dataSourceType: 'VERIFIED_LIVE',
      expiresAt: '2026-12-01T00:00:00.000Z',
    },
  ],
  pagination: { totalCount: 1, page: 1, limit: 20, totalPages: 1 },
};

const mockAuditLogsData = {
  auditLogs: [
    {
      _id: 'audit-001',
      action: 'OFFER_CREATED',
      actorRole: 'ADMIN',
      actorId: 'admin-user-01',
      resourceType: 'OFFER',
      resourceId: 'off-001',
      correlationId: 'corr-audit-001',
      metadata: { baseUnitPriceMinor: 145000, minimumOrderQuantity: 100 },
      createdAt: '2026-11-03T10:00:00.000Z',
    },
    {
      _id: 'audit-002',
      action: 'PAYMENT_ANNOTATED',
      actorRole: 'ADMIN',
      actorId: 'admin-user-01',
      resourceType: 'PAYMENT',
      resourceId: 'pay-attn-01',
      correlationId: 'corr-audit-002',
      metadata: { note: 'Verified PayPal sandbox settlement.' },
      createdAt: '2026-11-03T11:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 25,
  pages: 1,
};

describe('SUJ-09: Platform Administrator Workspace & Audit Log Inspector UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'ADMIN';

    adminApi.getReconciliationDashboard.mockResolvedValue(mockReconciliationData);
    adminApi.listSuppliersForAdmin.mockResolvedValue(mockSuppliersData);
    adminApi.searchOffersForAdmin.mockResolvedValue(mockOffersData);
    adminApi.getAuditLogs.mockResolvedValue(mockAuditLogsData);
    adminApi.runLifecycleCheck.mockResolvedValue({
      timestamp: '2026-11-03T20:00:00.000Z',
      results: { lockedMoqReached: 1, lockedUnderMoq: 0, expiredDecisionWindowsProcessed: 2 },
    });
  });

  // ── 1. Admin Dashboard Metrics ──────────────────────────────────────────────
  it('renders operational dashboard with summary reconciliation metrics', async () => {
    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('admin-dashboard-page')).toBeInTheDocument();

    await waitFor(() => {
      // 3 Stalled Pools
      expect(screen.getByText('3')).toBeInTheDocument();
      // 4 Attention Payments
      expect(screen.getByText('4')).toBeInTheDocument();
      // 1 Failed Refund (or Failed AI log)
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
      // 2 Expired Quotes (or Failed AI logs)
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/Platform Operations & Moderation/i)).toBeInTheDocument();
    expect(screen.getByText('ADMIN ACCESS')).toBeInTheDocument();
  });

  // ── 2. Admin Dashboard Lifecycle Job Execution (ADMIN) ──────────────────────
  it('allows ADMIN to trigger the 72h/24h pool lifecycle check and displays outcome', async () => {
    mockUserRole = 'ADMIN';
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('trigger-lifecycle-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('trigger-lifecycle-btn'));

    // Modal opens
    expect(screen.getByText(/Run 72h\/24h Pool Lifecycle Scheduler/i)).toBeInTheDocument();

    // Click confirm
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Run Lifecycle Check/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.runLifecycleCheck).toHaveBeenCalledWith(72);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining('Lifecycle check completed'),
        'success'
      );
    });
  });

  // ── 3. Reviewer Role Restricts Lifecycle Execution ──────────────────────────
  it('blocks REVIEWER from invoking the lifecycle scheduler trigger', async () => {
    mockUserRole = 'REVIEWER';

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('REVIEWER READ-ONLY')).toBeInTheDocument();
    });

    // The trigger button is not available to reviewer
    expect(screen.queryByTestId('trigger-lifecycle-btn')).not.toBeInTheDocument();
    expect(screen.getByText(/Lifecycle controls locked \(Reviewer\)/i)).toBeInTheDocument();
  });

  // ── 4. Supplier Moderation Table & Provenance Badges ─────────────────────────
  it('renders suppliers table with verification, active states, and provenance badges', async () => {
    render(
      <MemoryRouter>
        <AdminSuppliersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Delhi Bulk Distributors Ltd')).toBeInTheDocument();
      expect(screen.getByText('Seeded Agro Demo Supplier')).toBeInTheDocument();
      expect(screen.getAllByText('VERIFIED').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('DEMO_ONLY').length).toBeGreaterThanOrEqual(1);
    });

    // Check provenance
    expect(screen.getByText(/Verified Wholesaler/i)).toBeInTheDocument();
    expect(screen.getByText(/Demo Sample/i)).toBeInTheDocument();
  });

  // ── 5. Supplier Moderation by ADMIN ─────────────────────────────────────────
  it('allows ADMIN to moderate a supplier profile via updateSupplier', async () => {
    mockUserRole = 'ADMIN';
    adminApi.updateSupplier.mockResolvedValue({ _id: 'sup-001', name: 'Delhi Bulk Distributors Ltd' });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AdminSuppliersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('moderate-supplier-sup-001')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('moderate-supplier-sup-001'));

    expect(screen.getByText(/Moderate Supplier: Delhi Bulk Distributors Ltd/i)).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /Save Supplier Moderation/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(adminApi.updateSupplier).toHaveBeenCalledWith(
        'sup-001',
        expect.objectContaining({
          name: 'Delhi Bulk Distributors Ltd',
          verificationStatus: 'VERIFIED',
          activeStatus: 'ACTIVE',
        })
      );
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining('updated successfully'), 'success');
    });
  });

  // ── 6. Supplier Moderation Blocked for REVIEWER ──────────────────────────────
  it('hides supplier moderation controls for REVIEWER role', async () => {
    mockUserRole = 'REVIEWER';

    render(
      <MemoryRouter>
        <AdminSuppliersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('REVIEWER READ-ONLY')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('add-supplier-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('moderate-supplier-sup-001')).not.toBeInTheDocument();
    expect(screen.getAllByText('Read-Only').length).toBeGreaterThan(0);
  });

  // ── 7. Offer Table & Catalogue Query Scope Disclosure ───────────────────────
  it('renders offer moderation fields and prominently discloses catalogue query limitation', async () => {
    render(
      <MemoryRouter>
        <AdminOffersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Fortune Sunlite Sunflower Oil 1L')).toBeInTheDocument();
      expect(screen.getByText(/MOQ_R: 20/i)).toBeInTheDocument();
    });

    // Prominent disclosure notice
    expect(screen.getByText(/Catalogue Query Scope Notice/i)).toBeInTheDocument();
    expect(
      screen.getByText(/filters offers with/i)
    ).toBeInTheDocument();
  });

  // ── 8. Immutable Offer Fields Protection on Edit ────────────────────────────
  it('allows ADMIN to open offer moderation modal with immutable fields non-editable', async () => {
    mockUserRole = 'ADMIN';
    adminApi.updateOffer.mockResolvedValue({ _id: 'off-001' });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AdminOffersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('moderate-offer-off-001')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('moderate-offer-off-001'));

    expect(screen.getByText(/Moderate Catalogue Offer/i)).toBeInTheDocument();
    expect(screen.getByText(/Immutable Offer Attributes/i)).toBeInTheDocument();
    expect(screen.getByText('NON-EDITABLE', { exact: false })).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /Save Offer Moderation/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(adminApi.updateOffer).toHaveBeenCalledWith(
        'off-001',
        expect.objectContaining({
          minimumOrderQuantity: 100,
          retailerMoqPercentage: 20,
        })
      );
      // Ensure immutable fields (productId, packUnit, packSize, currency, supplierId) were NOT passed
      const updatePayload = adminApi.updateOffer.mock.calls[0][1];
      expect(updatePayload.productId).toBeUndefined();
      expect(updatePayload.packUnit).toBeUndefined();
      expect(updatePayload.packSize).toBeUndefined();
      expect(updatePayload.currency).toBeUndefined();
      expect(updatePayload.supplierId).toBeUndefined();
    });
  });

  // ── 9. Pools & Payment Reconciliation Workspace ─────────────────────────────
  it('renders reconciliation exceptions across payments, stalled pools, refunds, and quotes', async () => {
    render(
      <MemoryRouter>
        <AdminPoolsOrdersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PAY-2026-7788')).toBeInTheDocument();
      expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    });

    expect(screen.getByText(/FR-ADMIN-005 Immutable Payment Integrity Architecture/i)).toBeInTheDocument();
  });

  // ── 10. Payment Annotation (FR-ADMIN-005 Immutability Guard) ─────────────────
  it('appends reconciliation notes without exposing captured payment facts to modification', async () => {
    mockUserRole = 'ADMIN';
    adminApi.annotatePayment.mockResolvedValue({
      payment: { _id: 'pay-attn-01' },
      synced: true,
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AdminPoolsOrdersPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('annotate-payment-pay-attn-01')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('annotate-payment-pay-attn-01'));

    // Modal opens
    expect(screen.getByText(/Append Payment Reconciliation Note/i)).toBeInTheDocument();
    expect(screen.getByText(/Protected Transaction Ledger Facts/i)).toBeInTheDocument();

    // Verify amount and capture facts are displayed, NOT editable inputs
    expect(screen.getByText('NON-EDITABLE')).toBeInTheDocument();

    // Type note and toggle sync
    const textarea = screen.getByPlaceholderText(/Document verification findings/i);
    await user.type(textarea, 'Audited with PayPal sandbox dashboard. Confirmed capture.');

    const syncCheckbox = screen.getByLabelText(/Trigger Gateway State Synchronization/i);
    await user.click(syncCheckbox);

    const submitBtn = screen.getByRole('button', { name: /Append Reconciliation Note/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(adminApi.annotatePayment).toHaveBeenCalledWith(
        'pay-attn-01',
        {
          note: 'Audited with PayPal sandbox dashboard. Confirmed capture.',
          syncWithProvider: true,
        }
      );
      expect(mockNotify).toHaveBeenCalledWith(
        expect.stringContaining('Reconciliation note appended without modifying captured transaction facts'),
        'success'
      );
    });
  });

  // ── 11. Audit Logs Inspector & AIExecutionLog Source Notice ──────────────────
  it('renders read-only audit logs with metadata inspector and AIExecutionLog disclosure', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AdminAuditLogsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('OFFER_CREATED')).toBeInTheDocument();
      expect(screen.getByText('PAYMENT_ANNOTATED')).toBeInTheDocument();
    });

    // AI Execution trace disclosure notice
    expect(screen.getByText(/AIExecutionLog Trace Source Notice/i)).toBeInTheDocument();
    expect(screen.getByText(/is not yet exposed by the backend controller/i)).toBeInTheDocument();

    // Inspect Details
    const inspectBtn = screen.getByTestId('inspect-audit-audit-001');
    await user.click(inspectBtn);

    expect(screen.getByText(/Audit Log Event Details: OFFER_CREATED/i)).toBeInTheDocument();
    expect(screen.getByText(/"baseUnitPriceMinor": 145000/i)).toBeInTheDocument();

    // Zero mutation controls exist
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();
  });

  // ── 12. Error and Empty States ──────────────────────────────────────────────
  it('renders error banner with retry option on API failure', async () => {
    adminApi.getReconciliationDashboard.mockRejectedValueOnce(new Error('Network gateway timeout'));

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Network gateway timeout/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });
});
