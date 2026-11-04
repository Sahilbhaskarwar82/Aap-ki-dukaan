/**
 * CoBuy AI — Wholesaler Supplier Workspace (SUJ-08)
 *
 * Route: /supplier-portal
 *
 * Dedicated workspace for regional distributors and manufacturers:
 *  1. My Catalogue Offers:
 *     - Full Create & Edit Offer workflows
 *     - Product selection, pack unit/size, wholesale MOQ (MOQ_W), base unit price (paise conversion)
 *     - Retailer MOQ percentage (p_min) and step percentage (p_step) with computed MOQ_R & Step
 *     - Quantity price tiers matrix, flat shipping, delivery areas, tax inclusion, availability
 *  2. Incoming Buyer Quote Requests (Binding responses & rejections via PATCH /api/quotes/:id/respond)
 *  3. Under-MOQ Feasibility Requests (Accept at tier / submit revised quote / reject sub-MOQ)
 *  4. Group Purchase Orders & Fulfillment Tracking (Confirm / reject / dispatch via PATCH /api/orders/:id/supplier-status)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  Package,
  Plus,
  Send,
  Truck,
  SlidersHorizontal,
  Edit3,
  Trash2,
  Calendar,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import { listOrders, updateSupplierStatus } from '@/api/orders.api';
import { searchSupplierOffers, submitSupplierFeasibility, fetchProductCatalogue } from '@/api/pools.api';
import axiosClient from '@/api/axiosClient';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { SandboxDisclosureBanner } from '@/components/common/SandboxDisclosureBanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';

const COMMON_DELIVERY_AREAS = [
  'DELHI_NCR',
  'LUCKNOW',
  'KANPUR',
  'VARANASI',
  'MUMBAI',
  'ALL_INDIA',
];

const PACK_UNITS = [
  'UNIT',
  'BOX',
  'CARTON',
  'BAG',
  'KG',
  'PIECE',
  'PACKET',
  'TIN',
  'DRUM',
];

const getDefaultExpirationDate = () =>
  new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

const initialOfferForm = {
  productId: '',
  packUnit: 'BOX',
  packSize: 'Box of 12 Units',
  currency: 'INR',
  baseUnitPriceMajor: '',
  minimumOrderQuantity: '100',
  retailerMoqPercentage: '20',
  retailerStepPercentage: '1',
  acceptsUnderMoqOrders: false,
  quantityTiers: [],
  shippingTerms: 'Standard Shipping',
  flatShippingCostMajor: '0',
  shippingAllocationMethod: 'PER_UNIT',
  deliveryAreas: ['DELHI_NCR'],
  leadTimeDays: '3',
  taxInclusion: 'GST_EXCLUDED',
  availabilityStatus: 'IN_STOCK',
  expiresAt: '',
};

export function SupplierPortalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotifications();

  const [activeTab, setActiveTab] = useState('OFFERS'); // OFFERS | QUOTES | UNDER_MOQ | ORDERS
  const [loading, setLoading] = useState(true);

  // Data states
  const [offers, setOffers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [underMoqPools, setUnderMoqPools] = useState([]);
  const [orders, setOrders] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);

  // Offer Create / Edit Modal State
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [offerForm, setOfferForm] = useState(initialOfferForm);
  const [submittingOffer, setSubmittingOffer] = useState(false);

  // Respond to Quote Modal State
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [quoteResponseModalOpen, setQuoteResponseModalOpen] = useState(false);
  const [quoteAction, setQuoteAction] = useState('PROVIDE'); // PROVIDE | REJECT
  const [quoteUnitPriceMajor, setQuoteUnitPriceMajor] = useState('');
  const [quoteShippingMajor, setQuoteShippingMajor] = useState('0');
  const [quoteValidityDays, setQuoteValidityDays] = useState('7');
  const [quoteRejectionReason, setQuoteRejectionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Sub-MOQ Feasibility Modal State
  const [selectedPool, setSelectedPool] = useState(null);
  const [feasibilityModalOpen, setFeasibilityModalOpen] = useState(false);
  const [feasibilityDecision, setFeasibilityDecision] = useState('ACCEPTED_SUB_MOQ');
  const [revisedPriceMajor, setRevisedPriceMajor] = useState('');

  // Order Fulfillment Modal State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [fulfillmentModalOpen, setFulfillmentModalOpen] = useState(false);
  const [orderActionType, setOrderActionType] = useState('DISPATCH'); // CONFIRM | REJECT | DISPATCH
  const [deliveryStatus, setDeliveryStatus] = useState('DISPATCHED');
  const [supplierReference, setSupplierReference] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [orderRejectionReason, setOrderRejectionReason] = useState('');
  const [rejectConfirmed, setRejectConfirmed] = useState(false);

  // ── Load All Workspace Data ────────────────────────────────────────────────
  const loadSupplierWorkspaceData = useCallback(async () => {
    try {
      setLoading(true);
      const [offersRes, quotesRes, poolsRes, ordersRes, productsRes] =
        await Promise.allSettled([
          searchSupplierOffers({ limit: 50 }),
          axiosClient.get('/quotes').then((r) => r.data?.data || r.data || []),
          axiosClient
            .get('/pools?state=UNDER_MOQ_DECISION_PENDING')
            .then((r) => r.data?.data || r.data || []),
          listOrders({ limit: 50 }),
          fetchProductCatalogue().then((r) => r.productList || []),
        ]);

      if (offersRes.status === 'fulfilled' && Array.isArray(offersRes.value)) {
        setOffers(offersRes.value);
      }
      if (quotesRes.status === 'fulfilled' && Array.isArray(quotesRes.value)) {
        setQuotes(quotesRes.value);
      }
      if (poolsRes.status === 'fulfilled' && Array.isArray(poolsRes.value)) {
        setUnderMoqPools(poolsRes.value);
      }
      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
        setOrders(ordersRes.value);
      }
      if (productsRes.status === 'fulfilled' && Array.isArray(productsRes.value)) {
        setAvailableProducts(productsRes.value);
      }
    } catch {
      // fallback handled gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSupplierWorkspaceData();
  }, [loadSupplierWorkspaceData]);

  // ── Offer Form Handlers (Create / Edit) ─────────────────────────────────────
  const handleOpenCreateOffer = () => {
    setEditingOffer(null);
    setOfferForm({
      ...initialOfferForm,
      productId: availableProducts[0]?._id || '',
      expiresAt: getDefaultExpirationDate(),
    });
    setOfferModalOpen(true);
  };

  const handleOpenEditOffer = (offer) => {
    setEditingOffer(offer);
    const expDate = offer.expiresAt
      ? new Date(offer.expiresAt).toISOString().split('T')[0]
      : getDefaultExpirationDate();

    setOfferForm({
      productId: offer.productId?._id || offer.productId || '',
      packUnit: offer.packUnit || 'BOX',
      packSize: offer.packSize || 'Box of 12 Units',
      currency: offer.currency || 'INR',
      baseUnitPriceMajor: (offer.baseUnitPriceMinor / 100).toFixed(2),
      minimumOrderQuantity: String(offer.minimumOrderQuantity || 100),
      retailerMoqPercentage: String(offer.retailerMoqPercentage ?? 20),
      retailerStepPercentage: String(offer.retailerStepPercentage ?? 1),
      acceptsUnderMoqOrders: Boolean(offer.acceptsUnderMoqOrders),
      quantityTiers: (offer.quantityTiers || []).map((t) => ({
        minQuantity: String(t.minQuantity),
        maxQuantity: t.maxQuantity != null ? String(t.maxQuantity) : '',
        unitPriceMajor: (t.unitPriceMinor / 100).toFixed(2),
      })),
      shippingTerms: offer.shippingTerms || 'Standard Shipping',
      flatShippingCostMajor:
        offer.flatShippingCostMinor != null
          ? (offer.flatShippingCostMinor / 100).toFixed(2)
          : '0',
      shippingAllocationMethod: offer.shippingAllocationMethod || 'PER_UNIT',
      deliveryAreas: Array.isArray(offer.deliveryAreas) && offer.deliveryAreas.length > 0
        ? offer.deliveryAreas
        : ['DELHI_NCR'],
      leadTimeDays: String(offer.leadTimeDays || 3),
      taxInclusion: offer.taxInclusion || 'GST_EXCLUDED',
      availabilityStatus: offer.availabilityStatus || 'IN_STOCK',
      expiresAt: expDate,
    });
    setOfferModalOpen(true);
  };

  const handleAddTier = () => {
    setOfferForm((prev) => {
      const lastTier = prev.quantityTiers[prev.quantityTiers.length - 1];
      const nextMin = lastTier && lastTier.maxQuantity ? parseInt(lastTier.maxQuantity, 10) + 1 : 200;
      return {
        ...prev,
        quantityTiers: [
          ...prev.quantityTiers,
          { minQuantity: String(nextMin), maxQuantity: '', unitPriceMajor: prev.baseUnitPriceMajor || '0' },
        ],
      };
    });
  };

  const handleRemoveTier = (index) => {
    setOfferForm((prev) => ({
      ...prev,
      quantityTiers: prev.quantityTiers.filter((_, i) => i !== index),
    }));
  };

  const handleTierChange = (index, field, value) => {
    setOfferForm((prev) => {
      const updated = [...prev.quantityTiers];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, quantityTiers: updated };
    });
  };

  const toggleDeliveryArea = (area) => {
    setOfferForm((prev) => {
      const current = prev.deliveryAreas || [];
      if (current.includes(area)) {
        if (current.length === 1) return prev; // Keep at least one
        return { ...prev, deliveryAreas: current.filter((a) => a !== area) };
      }
      return { ...prev, deliveryAreas: [...current, area] };
    });
  };

  // Save (Create or Update) Offer
  const handleSaveOffer = async (e) => {
    e.preventDefault();

    // 1. Validation
    if (!offerForm.productId) {
      notify?.('Please select a product for this offer.', 'error');
      return;
    }
    if (!offerForm.packUnit?.trim() || !offerForm.packSize?.trim()) {
      notify?.('Pack unit and pack size are required.', 'error');
      return;
    }

    const unitPrice = parseFloat(offerForm.baseUnitPriceMajor);
    if (isNaN(unitPrice) || unitPrice <= 0) {
      notify?.('Base unit price must be a positive number.', 'error');
      return;
    }

    const moqW = parseInt(offerForm.minimumOrderQuantity, 10);
    if (isNaN(moqW) || moqW < 1) {
      notify?.('Wholesale MOQ (MOQ_W) must be an integer >= 1.', 'error');
      return;
    }

    const pMin = parseFloat(offerForm.retailerMoqPercentage);
    if (isNaN(pMin) || pMin < 1 || pMin > 100) {
      notify?.('Retailer MOQ percentage must be between 1% and 100%.', 'error');
      return;
    }

    const pStep = parseFloat(offerForm.retailerStepPercentage);
    if (isNaN(pStep) || pStep < 0.1 || pStep > 100) {
      notify?.('Retailer step percentage must be between 0.1% and 100%.', 'error');
      return;
    }

    if (!offerForm.deliveryAreas || offerForm.deliveryAreas.length === 0) {
      notify?.('Please select at least one delivery area.', 'error');
      return;
    }

    const expDate = new Date(offerForm.expiresAt);
    if (isNaN(expDate.getTime()) || expDate <= new Date()) {
      notify?.('Quote expiration date must be in the future.', 'error');
      return;
    }

    // 2. Build payload with minor currency arithmetic
    const baseUnitPriceMinor = Math.round(unitPrice * 100);
    const flatShippingCostMinor =
      offerForm.flatShippingCostMajor !== ''
        ? Math.max(0, Math.round(parseFloat(offerForm.flatShippingCostMajor || '0') * 100))
        : 0;

    const validatedTiers = offerForm.quantityTiers
      .map((t) => ({
        minQuantity: parseInt(t.minQuantity, 10),
        maxQuantity: t.maxQuantity ? parseInt(t.maxQuantity, 10) : null,
        unitPriceMinor: Math.round(parseFloat(t.unitPriceMajor || '0') * 100),
      }))
      .filter(
        (t) =>
          !isNaN(t.minQuantity) &&
          !isNaN(t.unitPriceMinor) &&
          t.minQuantity > 0 &&
          t.unitPriceMinor > 0
      );

    // 2. Build mutable payload with minor currency arithmetic (SRU-10 permitted fields)
    const mutablePayload = {
      baseUnitPriceMinor,
      minimumOrderQuantity: moqW,
      retailerMoqPercentage: pMin,
      retailerStepPercentage: pStep,
      quantityTiers: validatedTiers,
      shippingTerms: offerForm.shippingTerms || 'Standard Shipping',
      flatShippingCostMinor,
      shippingAllocationMethod: offerForm.shippingAllocationMethod || 'PER_UNIT',
      deliveryAreas: offerForm.deliveryAreas,
      leadTimeDays: parseInt(offerForm.leadTimeDays, 10) || 3,
      taxInclusion: offerForm.taxInclusion || 'GST_EXCLUDED',
      availabilityStatus: offerForm.availabilityStatus || 'IN_STOCK',
      acceptsUnderMoqOrders: Boolean(offerForm.acceptsUnderMoqOrders),
      expiresAt: expDate.toISOString(),
    };

    try {
      setSubmittingOffer(true);
      if (editingOffer) {
        // Do not send immutable fields (productId, packUnit, packSize, currency, supplierId) on edit
        await axiosClient.patch(`/admin/offers/${editingOffer._id}`, mutablePayload);
        notify?.('Catalogue offer updated successfully.', 'success');
      } else {
        // Resolve authenticated supplier profile directly without guessing from other offers
        const resolvedSupplierId = user?.supplierId || user?._id;
        if (!resolvedSupplierId) {
          notify?.('Unable to resolve supplier identity for the active user session.', 'error');
          setSubmittingOffer(false);
          return;
        }

        const createPayload = {
          ...mutablePayload,
          supplierId: resolvedSupplierId,
          productId: offerForm.productId,
          packUnit: offerForm.packUnit.trim().toUpperCase(),
          packSize: offerForm.packSize.trim(),
          currency: offerForm.currency || 'INR',
        };

        await axiosClient.post('/admin/offers', createPayload);
        notify?.('New wholesale offer published successfully.', 'success');
      }

      setOfferModalOpen(false);
      setEditingOffer(null);
      await loadSupplierWorkspaceData();
    } catch (err) {
      notify?.(
        err?.response?.data?.message || err?.message || 'Failed to save catalogue offer.',
        'error'
      );
    } finally {
      setSubmittingOffer(false);
    }
  };

  // ── Handle Submit Quote Response (SAH-09) ──────────────────────────────────
  const handleSubmitQuoteResponse = async () => {
    if (!selectedQuote) return;
    try {
      setSubmittingAction(true);
      if (quoteAction === 'REJECT') {
        await axiosClient.patch(`/quotes/${selectedQuote._id}/respond`, {
          action: 'REJECT',
          rejectionReason: quoteRejectionReason || 'Supplier unable to fulfill requested terms.',
        });
        notify?.('Buyer quote request has been rejected.', 'info');
      } else {
        const unitPriceMinor = Math.round(parseFloat(quoteUnitPriceMajor) * 100);
        const shippingMinor = Math.round(parseFloat(quoteShippingMajor || '0') * 100);
        const validUntil = new Date(
          Date.now() + parseInt(quoteValidityDays, 10) * 86400000
        ).toISOString();

        // SAH-09: Provide binding quote; do not send ignored status or shippingTotalMinor fields
        await axiosClient.patch(`/quotes/${selectedQuote._id}/respond`, {
          action: 'PROVIDE',
          unitPriceMinor,
          shippingCostMinor: shippingMinor,
          validUntil,
        });
        notify?.('Binding quote response submitted to retailer.', 'success');
      }

      setQuoteResponseModalOpen(false);
      await loadSupplierWorkspaceData();
    } catch (err) {
      notify?.(
        err?.response?.data?.message || err?.message || 'Failed to respond to quote.',
        'error'
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  // ── Handle Submit Sub-MOQ Feasibility (PRK-10) ──────────────────────────────
  const handleSubmitFeasibility = async () => {
    if (!selectedPool) return;
    try {
      setSubmittingAction(true);
      let action = 'ACCEPT_UNDER_MOQ';
      if (feasibilityDecision === 'REVISED_QUOTE_PROVIDED') action = 'SUBMIT_REVISED_QUOTE';
      if (feasibilityDecision === 'REJECTED_SUB_MOQ') action = 'REJECT';

      // Keep action mapping but remove unnecessary unsupported top-level fields
      const payload = { action };
      if (action === 'SUBMIT_REVISED_QUOTE' && revisedPriceMajor) {
        payload.revisedQuoteData = {
          unitPriceMinor: Math.round(parseFloat(revisedPriceMajor) * 100),
        };
      }

      await submitSupplierFeasibility(selectedPool._id, payload);
      notify?.('Under-MOQ feasibility resolution recorded.', 'success');
      setFeasibilityModalOpen(false);
      await loadSupplierWorkspaceData();
    } catch (err) {
      notify?.(
        err?.response?.data?.message || err?.message || 'Failed to submit feasibility.',
        'error'
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  // ── Handle Order Status Update (SRU-05) ─────────────────────────────────────
  const handleUpdateOrderStatus = async () => {
    if (!selectedOrder) return;
    try {
      setSubmittingAction(true);
      const payload = {};

      if (orderActionType === 'CONFIRM') {
        payload.status = 'CONFIRMED';
        payload.orderState = 'CONFIRMED';
        if (supplierReference.trim()) {
          payload.supplierReference = supplierReference.trim();
        }
        if (expectedDeliveryDate) {
          payload.expectedDeliveryDate = new Date(expectedDeliveryDate).toISOString();
        }
      } else if (orderActionType === 'REJECT') {
        // Explicit confirmation check before rejection (cancels pool and refunds buyers)
        if (!rejectConfirmed) {
          notify?.('Please confirm acknowledgment that rejecting this order cancels the pool and initiates buyer refunds.', 'error');
          setSubmittingAction(false);
          return;
        }
        if (!orderRejectionReason.trim()) {
          notify?.('Order rejection reason is required.', 'error');
          setSubmittingAction(false);
          return;
        }
        payload.status = 'REJECTED';
        payload.rejectionReason = orderRejectionReason.trim();
      } else {
        // Logistics & Fulfillment update
        // Backend expects deliveryStatus, orderState, supplierReference, and expectedDeliveryDate
        payload.deliveryStatus = deliveryStatus;
        payload.orderState =
          deliveryStatus === 'DELIVERED'
            ? 'DELIVERED'
            : deliveryStatus === 'DISPATCHED'
            ? 'SHIPPED'
            : 'PROCESSING';
        if (supplierReference.trim()) {
          payload.supplierReference = supplierReference.trim();
        }
        if (expectedDeliveryDate) {
          payload.expectedDeliveryDate = new Date(expectedDeliveryDate).toISOString();
        }
      }

      await updateSupplierStatus(selectedOrder._id, payload);
      notify?.('Order fulfillment status updated successfully.', 'success');
      setFulfillmentModalOpen(false);
      await loadSupplierWorkspaceData();
    } catch (err) {
      notify?.(
        err?.response?.data?.message || err?.message || 'Failed to update order status.',
        'error'
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  // Computed live retailer values for form preview
  const computedMoqR = useMemo(() => {
    const moqW = parseInt(offerForm.minimumOrderQuantity, 10);
    const pMin = parseFloat(offerForm.retailerMoqPercentage);
    if (isNaN(moqW) || isNaN(pMin) || moqW <= 0) return 0;
    return Math.ceil((moqW * pMin) / 100);
  }, [offerForm.minimumOrderQuantity, offerForm.retailerMoqPercentage]);

  const computedStep = useMemo(() => {
    const moqW = parseInt(offerForm.minimumOrderQuantity, 10);
    const pStep = parseFloat(offerForm.retailerStepPercentage);
    if (isNaN(moqW) || isNaN(pStep) || moqW <= 0) return 1;
    return Math.max(1, Math.round((moqW * pStep) / 100));
  }, [offerForm.minimumOrderQuantity, offerForm.retailerStepPercentage]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="supplier-portal-page">
      {/* ── Page Header with Required Test Identifiers ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Wholesaler Supplier Workspace</h1>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Dedicated workspace for regional distributors and manufacturers. Publish wholesale offers with MOQ_W and tier
            matrices, respond to incoming buyer quotes, and process finalized group purchase orders.
          </p>
        </div>

        <Badge variant="pool" className="self-start sm:self-auto font-mono text-xs">
          Role: {user?.role || 'SUPPLIER'}
        </Badge>
      </div>

      <SandboxDisclosureBanner />

      {/* ── Tabs Navigation ── */}
      <div className="flex items-center gap-2 border-b border-midnight-border/70 pb-2 overflow-x-auto">
        {[
          { id: 'OFFERS', label: `My Offers (${offers.length})`, icon: SlidersHorizontal },
          { id: 'QUOTES', label: `Incoming Quotes (${quotes.length})`, icon: FileText },
          { id: 'UNDER_MOQ', label: `Sub-MOQ Feasibility (${underMoqPools.length})`, icon: Clock },
          { id: 'ORDERS', label: `Purchase Orders (${orders.length})`, icon: Package },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === t.id
                  ? 'bg-midnight-emerald text-midnight-bg font-bold shadow-md'
                  : 'bg-midnight-surface border border-midnight-border text-slate-300 hover:border-slate-500'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab 1: Catalogue Offers ── */}
      {activeTab === 'OFFERS' && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-midnight-border/70 pb-3">
            <div>
              <h2 className="text-base font-bold text-white">Active Wholesale Catalogue Offers</h2>
              <p className="text-xs text-midnight-muted mt-0.5">
                Manage wholesale listings with tiered discount matrices and retailer MOQ parameters.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={handleOpenCreateOffer}>
                <Plus className="h-4 w-4 mr-1.5" /> Create Offer
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <SlidersHorizontal className="h-8 w-8 text-midnight-muted mx-auto" />
              <p className="text-sm font-semibold text-white">No active wholesale offers published yet.</p>
              <p className="text-xs text-midnight-muted max-w-sm mx-auto">
                Create your first catalogue offer to let kirana store owners discover your wholesale inventory.
              </p>
              <Button variant="primary" size="sm" onClick={handleOpenCreateOffer}>
                <Plus className="h-4 w-4 mr-1.5" /> Create First Offer
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-xs">
              {offers.map((offer) => {
                const moqR = offer.computedRetailerMoq || Math.ceil((offer.minimumOrderQuantity || 1) * ((offer.retailerMoqPercentage || 20) / 100));
                const step = offer.computedRetailerStep || Math.max(1, Math.round((offer.minimumOrderQuantity || 1) * ((offer.retailerStepPercentage || 1) / 100)));
                const unit = offer.packUnit || 'UNIT';

                return (
                  <div key={offer._id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-midnight-surface/30 p-2 rounded-lg transition-colors">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">
                          {offer.productCanonicalName || offer.productId?.canonicalName || offer.productId?.name || 'Wholesale Product'}
                        </span>
                        <Badge variant={offer.availabilityStatus === 'IN_STOCK' ? 'success' : 'warning'}>
                          {offer.availabilityStatus || 'IN_STOCK'}
                        </Badge>
                        {offer.acceptsUnderMoqOrders && (
                          <Badge variant="pool">Sub-MOQ Accepted</Badge>
                        )}
                        <Badge variant="outline">{offer.dataSourceType || 'LIVE'}</Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-midnight-muted pt-1">
                        <div>
                          <span>Wholesale MOQ:</span>{' '}
                          <strong className="text-white font-mono">{offer.minimumOrderQuantity}</strong> {unit}
                        </div>
                        <div>
                          <span>Retailer MOQ (MOQ_R):</span>{' '}
                          <strong className="text-teal-300 font-mono">{moqR}</strong> {unit} ({offer.retailerMoqPercentage || 20}%)
                        </div>
                        <div>
                          <span>Order Step Multiple:</span>{' '}
                          <strong className="text-slate-200 font-mono">+{step}</strong> {unit} ({offer.retailerStepPercentage || 1}%)
                        </div>
                        <div>
                          <span>Base Unit Price:</span>{' '}
                          <strong className="text-teal-300 font-mono">
                            {formatMinorToMajor(offer.baseUnitPriceMinor || 0, offer.currency)}
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-midnight-muted pt-0.5">
                        <span>Pack: <strong className="text-slate-300">{offer.packSize || 'Standard'}</strong></span>
                        <span>Delivery: <strong className="text-slate-300">{(offer.deliveryAreas || []).join(', ') || 'Regional'}</strong></span>
                        <span>Tiers: <strong className="text-slate-300">{offer.quantityTiers?.length || 0} tier(s)</strong></span>
                        {offer.expiresAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-midnight-muted" />
                            Expires {new Date(offer.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditOffer(offer)}
                      >
                        <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit Offer
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Incoming Quotes ── */}
      {activeTab === 'QUOTES' && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="border-b border-midnight-border/70 pb-3">
            <h2 className="text-base font-bold text-white">Custom & Revised Buyer Quote Requests</h2>
            <p className="text-xs text-midnight-muted mt-0.5">
              Review custom procurement requests and submit binding wholesale pricing terms.
            </p>
          </div>

          {quotes.length === 0 ? (
            <p className="text-xs text-midnight-muted py-6 text-center">No pending quote requests.</p>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-xs">
              {quotes.map((q) => (
                <div key={q._id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        {q.productId?.canonicalName || 'Custom Item'}
                      </span>
                      <Badge variant="outline">{q.status}</Badge>
                    </div>
                    <p className="text-midnight-muted">
                      Requested Quantity: <strong className="text-slate-200">{q.requestedQuantity}</strong> units •
                      Delivery Area: <strong className="text-slate-200">{q.deliveryArea || 'Regional'}</strong>
                    </p>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setSelectedQuote(q);
                      setQuoteAction('PROVIDE');
                      setQuoteUnitPriceMajor('');
                      setQuoteShippingMajor('0');
                      setQuoteValidityDays('7');
                      setQuoteRejectionReason('');
                      setQuoteResponseModalOpen(true);
                    }}
                  >
                    Respond to Quote <Send className="h-3 w-3 ml-1.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Sub-MOQ Feasibility ── */}
      {activeTab === 'UNDER_MOQ' && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="border-b border-midnight-border/70 pb-3">
            <h2 className="text-base font-bold text-white">Under-MOQ Feasibility Requests</h2>
            <p className="text-xs text-midnight-muted mt-0.5">
              Pools that reached 72h below MOQ. Decide whether to accept at current tier, provide a revised quote, or reject.
            </p>
          </div>

          {underMoqPools.length === 0 ? (
            <p className="text-xs text-midnight-muted py-6 text-center">No pools currently awaiting feasibility review.</p>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-xs">
              {underMoqPools.map((pool) => (
                <div key={pool._id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-bold text-white text-sm">{pool.title}</p>
                    <p className="text-midnight-muted">
                      Achieved: <strong className="text-teal-300">{pool.totalEligibleQuantity || 0}</strong> /{' '}
                      <strong className="text-slate-300">{pool.targetMoq}</strong> {pool.packUnit} • Shortfall:{' '}
                      <strong className="text-rose-400">
                        {Math.max(0, (pool.targetMoq || 0) - (pool.totalEligibleQuantity || 0))}
                      </strong>
                    </p>
                  </div>

                  <Button
                    variant="warning"
                    size="sm"
                    onClick={() => {
                      setSelectedPool(pool);
                      setFeasibilityDecision('ACCEPTED_SUB_MOQ');
                      setRevisedPriceMajor('');
                      setFeasibilityModalOpen(true);
                    }}
                  >
                    Resolve Feasibility
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 4: Purchase Orders ── */}
      {activeTab === 'ORDERS' && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="border-b border-midnight-border/70 pb-3">
            <h2 className="text-base font-bold text-white">Finalized Group Purchase Orders</h2>
            <p className="text-xs text-midnight-muted mt-0.5">
              Confirm incoming group orders and dispatch fulfillment tracking milestones.
            </p>
          </div>

          {orders.length === 0 ? (
            <p className="text-xs text-midnight-muted py-6 text-center">No assigned purchase orders.</p>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-xs">
              {orders.map((order) => (
                <div key={order._id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{order.orderNumber}</span>
                      <Badge variant="success">{order.supplierConfirmationStatus || 'CONFIRMED'}</Badge>
                      <Badge variant="pool">{order.orderState || 'PROCESSING'}</Badge>
                    </div>
                    <p className="text-midnight-muted">
                      Grand Total:{' '}
                      <strong className="text-teal-300">
                        {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
                      </strong>{' '}
                      • {order.memberOrders?.length || 0} drop-off locations
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/orders/${order._id}`)}
                    >
                      View PO
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedOrder(order);
                        setOrderActionType('DISPATCH');
                        setDeliveryStatus(
                          order.memberOrders?.[0]?.deliveryStatus || 'DISPATCHED'
                        );
                        setSupplierReference(order.supplierReference || '');
                        setExpectedDeliveryDate(
                          order.expectedDeliveryDate
                            ? new Date(order.expectedDeliveryDate).toISOString().split('T')[0]
                            : ''
                        );
                        setOrderRejectionReason('');
                        setRejectConfirmed(false);
                        setFulfillmentModalOpen(true);
                      }}
                    >
                      Update Fulfillment <Truck className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Create / Edit Offer (SUJ-08) ── */}
      <Dialog open={offerModalOpen} onOpenChange={setOfferModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-midnight-emerald" />
              {editingOffer ? 'Edit Catalogue Offer' : 'Create New Wholesale Offer'}
            </DialogTitle>
            <DialogDescription className="text-xs text-midnight-muted">
              Configure wholesale Minimum Order Quantity (MOQ_W), retailer step multiples, and bulk tiered pricing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveOffer} className="space-y-5 py-2 text-xs">
            {/* Section 1: Product & Packaging */}
            <div className="space-y-3 p-3.5 bg-midnight-surface/70 rounded-xl border border-midnight-border">
              <div className="font-bold text-white flex items-center justify-between text-sm border-b border-midnight-border/60 pb-2">
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-teal-400" />
                  Product & Packaging
                </span>
                {editingOffer && (
                  <span className="text-[10px] text-midnight-muted">
                    Core product specifications are immutable
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Select Catalogue Product *</label>
                <select
                  disabled={Boolean(editingOffer)}
                  className="w-full rounded-lg bg-midnight-card border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none disabled:opacity-60"
                  value={offerForm.productId}
                  onChange={(e) => setOfferForm({ ...offerForm, productId: e.target.value })}
                >
                  <option value="">-- Select Product from Catalogue --</option>
                  {availableProducts.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.canonicalName || p.name} ({p.category || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Pack Unit *</label>
                  <select
                    disabled={Boolean(editingOffer)}
                    className="w-full rounded-lg bg-midnight-card border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none disabled:opacity-60"
                    value={offerForm.packUnit}
                    onChange={(e) => setOfferForm({ ...offerForm, packUnit: e.target.value })}
                  >
                    {PACK_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Pack Size Description *</label>
                  <Input
                    disabled={Boolean(editingOffer)}
                    className="disabled:opacity-60"
                    value={offerForm.packSize}
                    onChange={(e) => setOfferForm({ ...offerForm, packSize: e.target.value })}
                    placeholder="e.g. Box of 12 Units, 25 kg Bag"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Pricing & Two-Level MOQ Engine */}
            <div className="space-y-3 p-3.5 bg-midnight-surface/70 rounded-xl border border-midnight-border">
              <div className="font-bold text-white flex items-center justify-between text-sm border-b border-midnight-border/60 pb-2">
                <span>Wholesale MOQ & Retailer Parameters</span>
                <span className="text-[11px] text-teal-300 font-normal">
                  MOQ_R: <strong>{computedMoqR}</strong> {offerForm.packUnit} • Step: <strong>+{computedStep}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Wholesale MOQ (MOQ_W) *</label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={offerForm.minimumOrderQuantity}
                    onChange={(e) => setOfferForm({ ...offerForm, minimumOrderQuantity: e.target.value })}
                    placeholder="e.g. 100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Base Unit Price (₹) *</label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={offerForm.baseUnitPriceMajor}
                    onChange={(e) => setOfferForm({ ...offerForm, baseUnitPriceMajor: e.target.value })}
                    placeholder="e.g. 120.00"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Currency</label>
                  <select
                    disabled={Boolean(editingOffer)}
                    className="w-full rounded-lg bg-midnight-card border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none disabled:opacity-60"
                    value={offerForm.currency}
                    onChange={(e) => setOfferForm({ ...offerForm, currency: e.target.value })}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-slate-300 font-semibold">Retailer MOQ % (p_min)</label>
                    <span className="text-midnight-muted">{offerForm.retailerMoqPercentage}%</span>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={offerForm.retailerMoqPercentage}
                    onChange={(e) => setOfferForm({ ...offerForm, retailerMoqPercentage: e.target.value })}
                    placeholder="20"
                  />
                  <p className="text-[10px] text-midnight-muted">
                    Individual buyer minimum floor: {computedMoqR} {offerForm.packUnit}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-slate-300 font-semibold">Retailer Step % (p_step)</label>
                    <span className="text-midnight-muted">{offerForm.retailerStepPercentage}%</span>
                  </div>
                  <Input
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={offerForm.retailerStepPercentage}
                    onChange={(e) => setOfferForm({ ...offerForm, retailerStepPercentage: e.target.value })}
                    placeholder="1"
                  />
                  <p className="text-[10px] text-midnight-muted">
                    Order increment step: +{computedStep} {offerForm.packUnit}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-midnight-border/50">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-midnight-border bg-midnight-card text-midnight-emerald focus:ring-0"
                    checked={offerForm.acceptsUnderMoqOrders}
                    onChange={(e) => setOfferForm({ ...offerForm, acceptsUnderMoqOrders: e.target.checked })}
                  />
                  <span className="text-slate-200 font-medium">
                    Accept Sub-MOQ Orders (Allow buyers to request fulfillment if pool closes below MOQ_W)
                  </span>
                </label>
              </div>
            </div>

            {/* Section 3: Quantity Pricing Tiers */}
            <div className="space-y-3 p-3.5 bg-midnight-surface/70 rounded-xl border border-midnight-border">
              <div className="flex items-center justify-between border-b border-midnight-border/60 pb-2">
                <div>
                  <span className="font-bold text-white text-sm">Bulk Quantity Pricing Tiers</span>
                  <p className="text-[10px] text-midnight-muted">
                    Optional volume discounts applied automatically as pooled volume reaches higher thresholds.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddTier}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Tier
                </Button>
              </div>

              {offerForm.quantityTiers.length === 0 ? (
                <p className="text-[11px] text-midnight-muted py-2 text-center italic">
                  No volume discount tiers added. Base unit price applies to all quantities.
                </p>
              ) : (
                <div className="space-y-2">
                  {offerForm.quantityTiers.map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-midnight-card p-2 rounded-lg border border-midnight-border">
                      <div className="w-10 text-[10px] text-midnight-muted font-bold font-mono">
                        #{idx + 1}
                      </div>
                      <div className="flex-1">
                        <Input
                          type="number"
                          placeholder="Min Qty"
                          value={tier.minQuantity}
                          onChange={(e) => handleTierChange(idx, 'minQuantity', e.target.value)}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="number"
                          placeholder="Max Qty (blank = open)"
                          value={tier.maxQuantity}
                          onChange={(e) => handleTierChange(idx, 'maxQuantity', e.target.value)}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Tier Price (₹)"
                          value={tier.unitPriceMajor}
                          onChange={(e) => handleTierChange(idx, 'unitPriceMajor', e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-rose-400 hover:text-rose-300"
                        onClick={() => handleRemoveTier(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 4: Shipping, Regional Delivery & Tax */}
            <div className="space-y-3 p-3.5 bg-midnight-surface/70 rounded-xl border border-midnight-border">
              <div className="font-bold text-white text-sm border-b border-midnight-border/60 pb-2">
                Shipping, Logistics & Delivery Terms
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Shipping Terms</label>
                  <select
                    className="w-full rounded-lg bg-midnight-card border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none"
                    value={offerForm.shippingTerms}
                    onChange={(e) => setOfferForm({ ...offerForm, shippingTerms: e.target.value })}
                  >
                    <option value="Standard Shipping">Standard Shipping</option>
                    <option value="EX_WORKS">Ex-Works (EXW)</option>
                    <option value="FOB">Free On Board (FOB)</option>
                    <option value="DOORSTEP_DELIVERY">Doorstep Hub Delivery</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Flat Shipping Cost (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={offerForm.flatShippingCostMajor}
                    onChange={(e) => setOfferForm({ ...offerForm, flatShippingCostMajor: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Shipping Allocation</label>
                  <select
                    className="w-full rounded-lg bg-midnight-card border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none"
                    value={offerForm.shippingAllocationMethod}
                    onChange={(e) => setOfferForm({ ...offerForm, shippingAllocationMethod: e.target.value })}
                  >
                    <option value="PER_UNIT">Per Unit Volume</option>
                    <option value="EQUAL_SHARE">Equal Share per Buyer</option>
                    <option value="PER_WEIGHT">Per Weight Ratio</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Lead Time (Days)</label>
                  <Input
                    type="number"
                    min="1"
                    value={offerForm.leadTimeDays}
                    onChange={(e) => setOfferForm({ ...offerForm, leadTimeDays: e.target.value })}
                    placeholder="3"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Tax Treatment</label>
                  <select
                    className="w-full rounded-lg bg-midnight-card border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none"
                    value={offerForm.taxInclusion}
                    onChange={(e) => setOfferForm({ ...offerForm, taxInclusion: e.target.value })}
                  >
                    <option value="GST_EXCLUDED">GST Excluded</option>
                    <option value="GST_INCLUDED">GST Included</option>
                    <option value="TAX_PENDING">Tax Pending</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Stock Availability</label>
                  <select
                    className="w-full rounded-lg bg-midnight-card border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none"
                    value={offerForm.availabilityStatus}
                    onChange={(e) => setOfferForm({ ...offerForm, availabilityStatus: e.target.value })}
                  >
                    <option value="IN_STOCK">IN STOCK</option>
                    <option value="LOW_STOCK">LOW STOCK</option>
                    <option value="MADE_TO_ORDER">MADE TO ORDER</option>
                    <option value="OUT_OF_STOCK">OUT OF STOCK</option>
                  </select>
                </div>
              </div>

              {/* Delivery Areas Selection */}
              <div className="space-y-1.5 pt-2">
                <label className="text-slate-300 font-semibold">Service Delivery Areas *</label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_DELIVERY_AREAS.map((area) => {
                    const isSelected = (offerForm.deliveryAreas || []).includes(area);
                    return (
                      <button
                        type="button"
                        key={area}
                        onClick={() => toggleDeliveryArea(area)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          isSelected
                            ? 'bg-midnight-emerald text-midnight-bg font-bold'
                            : 'bg-midnight-card border border-midnight-border text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Expiry Date */}
              <div className="space-y-1 pt-2">
                <label className="text-slate-300 font-semibold">Offer Expiry Date *</label>
                <Input
                  type="date"
                  value={offerForm.expiresAt}
                  onChange={(e) => setOfferForm({ ...offerForm, expiresAt: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOfferModalOpen(false)}
                disabled={submittingOffer}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={submittingOffer}>
                {submittingOffer
                  ? 'Saving Offer...'
                  : editingOffer
                  ? 'Update Catalogue Offer'
                  : 'Publish Wholesale Offer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Respond to Quote (SAH-09) ── */}
      <Dialog open={quoteResponseModalOpen} onOpenChange={setQuoteResponseModalOpen}>
        <DialogContent className="max-w-md bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle>Respond to Buyer Quote Request</DialogTitle>
            <DialogDescription>
              Submit binding wholesale pricing or reject request for {selectedQuote?.requestedQuantity} units of{' '}
              {selectedQuote?.productId?.canonicalName || 'Product'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <div className="flex items-center gap-2 p-1 bg-midnight-surface rounded-lg border border-midnight-border">
              <button
                type="button"
                onClick={() => setQuoteAction('PROVIDE')}
                className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition-colors ${
                  quoteAction === 'PROVIDE'
                    ? 'bg-midnight-emerald text-midnight-bg font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Provide Binding Terms
              </button>
              <button
                type="button"
                onClick={() => setQuoteAction('REJECT')}
                className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition-colors ${
                  quoteAction === 'REJECT'
                    ? 'bg-rose-500 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Reject Request
              </button>
            </div>

            {quoteAction === 'PROVIDE' ? (
              <>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Unit Price (₹) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={quoteUnitPriceMajor}
                    onChange={(e) => setQuoteUnitPriceMajor(e.target.value)}
                    placeholder="e.g. 80.00"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Total Shipping Share (₹)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quoteShippingMajor}
                    onChange={(e) => setQuoteShippingMajor(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Quote Validity (Days)</label>
                  <select
                    className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none"
                    value={quoteValidityDays}
                    onChange={(e) => setQuoteValidityDays(e.target.value)}
                  >
                    <option value="3">3 Days</option>
                    <option value="7">7 Days</option>
                    <option value="14">14 Days</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Rejection Reason</label>
                <Input
                  value={quoteRejectionReason}
                  onChange={(e) => setQuoteRejectionReason(e.target.value)}
                  placeholder="e.g. Capacity full, cannot meet delivery schedule"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setQuoteResponseModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={quoteAction === 'PROVIDE' ? 'primary' : 'destructive'}
              size="sm"
              disabled={submittingAction || (quoteAction === 'PROVIDE' && !quoteUnitPriceMajor)}
              onClick={handleSubmitQuoteResponse}
            >
              {submittingAction
                ? 'Submitting...'
                : quoteAction === 'PROVIDE'
                ? 'Submit Binding Quote'
                : 'Reject Quote Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Sub-MOQ Feasibility (PRK-10) ── */}
      <Dialog open={feasibilityModalOpen} onOpenChange={setFeasibilityModalOpen}>
        <DialogContent className="max-w-md bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle>Under-MOQ Feasibility Resolution</DialogTitle>
            <DialogDescription>
              Pool reached {selectedPool?.totalEligibleQuantity} / {selectedPool?.targetMoq} units. Choose resolution:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-midnight-surface border border-midnight-border/70">
                <input
                  type="radio"
                  name="feasibility"
                  value="ACCEPTED_SUB_MOQ"
                  checked={feasibilityDecision === 'ACCEPTED_SUB_MOQ'}
                  onChange={(e) => setFeasibilityDecision(e.target.value)}
                />
                <span className="text-white font-medium">Accept Sub-MOQ Order at Current Tier Price</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-midnight-surface border border-midnight-border/70">
                <input
                  type="radio"
                  name="feasibility"
                  value="REVISED_QUOTE_PROVIDED"
                  checked={feasibilityDecision === 'REVISED_QUOTE_PROVIDED'}
                  onChange={(e) => setFeasibilityDecision(e.target.value)}
                />
                <span className="text-white font-medium">Provide Revised Unit Price for Achieved Qty</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-midnight-surface border border-midnight-border/70">
                <input
                  type="radio"
                  name="feasibility"
                  value="REJECTED_SUB_MOQ"
                  checked={feasibilityDecision === 'REJECTED_SUB_MOQ'}
                  onChange={(e) => setFeasibilityDecision(e.target.value)}
                />
                <span className="text-rose-400 font-medium">Reject Sub-MOQ Order (Triggers Full Buyer Refunds)</span>
              </label>
            </div>

            {feasibilityDecision === 'REVISED_QUOTE_PROVIDED' && (
              <div className="space-y-1 pt-2">
                <label className="text-slate-300 font-semibold">Revised Unit Price (₹):</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={revisedPriceMajor}
                  onChange={(e) => setRevisedPriceMajor(e.target.value)}
                  placeholder="e.g. 95.00"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFeasibilityModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={submittingAction || (feasibilityDecision === 'REVISED_QUOTE_PROVIDED' && !revisedPriceMajor)}
              onClick={handleSubmitFeasibility}
            >
              {submittingAction ? 'Recording...' : 'Submit Feasibility'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Order Fulfillment & Dispatch Tracking (SRU-05) ── */}
      <Dialog open={fulfillmentModalOpen} onOpenChange={setFulfillmentModalOpen}>
        <DialogContent className="max-w-md bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle>Update Order Status & Fulfillment</DialogTitle>
            <DialogDescription>
              Manage confirmation, logistics, and dispatch reference for {selectedOrder?.orderNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <div className="flex items-center gap-1.5 p-1 bg-midnight-surface rounded-lg border border-midnight-border">
              <button
                type="button"
                onClick={() => setOrderActionType('DISPATCH')}
                className={`flex-1 py-1 rounded text-xs font-semibold ${
                  orderActionType === 'DISPATCH' ? 'bg-midnight-emerald text-midnight-bg font-bold' : 'text-slate-400'
                }`}
              >
                Dispatch
              </button>
              <button
                type="button"
                onClick={() => setOrderActionType('CONFIRM')}
                className={`flex-1 py-1 rounded text-xs font-semibold ${
                  orderActionType === 'CONFIRM' ? 'bg-teal-500 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setOrderActionType('REJECT')}
                className={`flex-1 py-1 rounded text-xs font-semibold ${
                  orderActionType === 'REJECT' ? 'bg-rose-500 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Reject
              </button>
            </div>

            {orderActionType === 'DISPATCH' && (
              <>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Delivery Status:</label>
                  <select
                    className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none"
                    value={deliveryStatus}
                    onChange={(e) => setDeliveryStatus(e.target.value)}
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="DISPATCHED">DISPATCHED</option>
                    <option value="DELIVERED">DELIVERED</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Supplier Reference / AWB / Tracking:</label>
                  <Input
                    value={supplierReference}
                    onChange={(e) => setSupplierReference(e.target.value)}
                    placeholder="e.g. REF-SUP-2026-98765"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Expected Delivery Date:</label>
                  <Input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  />
                </div>
              </>
            )}

            {orderActionType === 'CONFIRM' && (
              <div className="space-y-3">
                <p className="text-slate-300">
                  Confirm order fulfillment for {selectedOrder?.orderNumber}. Wholesaler commits to order processing.
                </p>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Supplier Reference (Optional):</label>
                  <Input
                    value={supplierReference}
                    onChange={(e) => setSupplierReference(e.target.value)}
                    placeholder="e.g. REF-SUP-2026-98765"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Expected Delivery Date (Optional):</label>
                  <Input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {orderActionType === 'REJECT' && (
              <div className="space-y-3">
                <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-200">
                  <p className="font-semibold text-xs text-rose-300">
                    Critical Warning: Irreversible Cancellation & Refund Rollback
                  </p>
                  <p className="text-[11px] text-rose-300/90 mt-1">
                    Rejecting this order permanently cancels the group-buy pool and initiates refund processing for participating retail buyers. Individual refund attempts may fail and require further attention.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-rose-300 font-semibold">Order Rejection Reason *</label>
                  <Input
                    value={orderRejectionReason}
                    onChange={(e) => setOrderRejectionReason(e.target.value)}
                    placeholder="e.g. Out of stock, inventory committed elsewhere"
                  />
                </div>

                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-rose-600 bg-midnight-surface text-rose-500 focus:ring-rose-500 mt-0.5"
                    checked={rejectConfirmed}
                    onChange={(e) => setRejectConfirmed(e.target.checked)}
                  />
                  <span className="text-[11px] text-rose-200 leading-tight">
                    I explicitly confirm that rejecting this order will cancel the group-buy pool and initiate refund processing for all buyers.
                  </span>
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFulfillmentModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={orderActionType === 'REJECT' ? 'destructive' : 'primary'}
              size="sm"
              disabled={
                submittingAction ||
                (orderActionType === 'REJECT' && (!orderRejectionReason.trim() || !rejectConfirmed))
              }
              onClick={handleUpdateOrderStatus}
            >
              {submittingAction
                ? 'Processing...'
                : orderActionType === 'CONFIRM'
                ? 'Confirm Order'
                : orderActionType === 'REJECT'
                ? 'Reject Order & Initiate Refunds'
                : 'Save Logistics Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SupplierPortalPage;
