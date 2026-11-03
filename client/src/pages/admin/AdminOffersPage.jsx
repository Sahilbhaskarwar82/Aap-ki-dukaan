/**
 * CoBuy AI — Wholesale Catalogue Offer Moderation (SUJ-09 / SRU-10)
 *
 * Route: /admin/offers
 * Access: ADMIN (Full edit), REVIEWER (Read-only)
 *
 * Features:
 *  - Inspect active catalogue wholesale offers with pricing, two-level MOQ engine, and tiers
 *  - Discloses GET /offers/search query scope limitation regarding inactive/expired records
 *  - Enforces field immutability (productId, packUnit, packSize, currency, supplierId cannot be mutated)
 *  - Moderates permitted fields: baseUnitPriceMinor, tiers, minimumOrderQuantity, retailer percentages,
 *    delivery areas, availability, provenance, and verification via PATCH /api/admin/offers/:id
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SlidersHorizontal,
  Plus,
  Edit3,
  RotateCcw,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import { searchOffersForAdmin, updateOffer } from '@/api/admin.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { ProvenanceBadge } from '@/components/common/ProvenanceBadge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';

const AVAILABILITY_STATUSES = ['IN_STOCK', 'MADE_TO_ORDER', 'LOW_STOCK', 'OUT_OF_STOCK'];
const VERIFICATION_STATUSES = ['VERIFIED', 'UNVERIFIED', 'DEMO_SAMPLE'];
const DATA_SOURCE_TYPES = ['SEEDED_DEMO', 'SUPPLIER_SUBMITTED', 'VERIFIED_LIVE', 'EXTERNAL_API'];

const AVAILABLE_DELIVERY_AREAS = [
  'DELHI_NCR',
  'MUMBAI',
  'BANGALORE_URBAN',
  'LUCKNOW',
  'KANPUR',
  'VARANASI',
  'ALL_INDIA',
];

const getDefaultOfferExpiration = () =>
  new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

export function AdminOffersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotifications();

  const isAdmin = user?.role === 'ADMIN';
  const isReviewer = user?.role === 'REVIEWER';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offers, setOffers] = useState([]);
  const [pagination, setPagination] = useState({ totalCount: 0, page: 1, limit: 20, totalPages: 1 });

  // Filters
  const [selectedArea, setSelectedArea] = useState('ALL');
  const [selectedDataSource, setSelectedDataSource] = useState('ALL');
  const [includeExpired, setIncludeExpired] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Edit Offer Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [editForm, setEditForm] = useState({
    baseUnitPriceMajor: '',
    minimumOrderQuantity: '100',
    retailerMoqPercentage: '20',
    retailerStepPercentage: '1',
    availabilityStatus: 'IN_STOCK',
    verificationStatus: 'VERIFIED',
    dataSourceType: 'VERIFIED_LIVE',
    leadTimeDays: '3',
    shippingTerms: 'Standard Shipping',
    flatShippingCostMajor: '0',
    shippingAllocationMethod: 'PER_UNIT',
    taxInclusion: 'GST_EXCLUDED',
    acceptsUnderMoqOrders: false,
    deliveryAreas: ['DELHI_NCR'],
    expiresAt: '',
    quantityTiers: [],
  });
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Fetch Offers
  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: currentPage,
        limit: 20,
        includeExpired,
      };

      if (selectedArea !== 'ALL') params.deliveryArea = selectedArea;
      if (selectedDataSource !== 'ALL') params.dataSourceType = selectedDataSource;

      const data = await searchOffersForAdmin(params);
      setOffers(data.offers || []);
      setPagination(data.pagination || { totalCount: 0, page: 1, limit: 20, totalPages: 1 });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load offers.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedArea, selectedDataSource, includeExpired]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Open Edit Modal
  const handleOpenEdit = (offer) => {
    if (!isAdmin) return;
    setEditingOffer(offer);

    const expDate = offer.expiresAt
      ? new Date(offer.expiresAt).toISOString().split('T')[0]
      : getDefaultOfferExpiration();

    setEditForm({
      baseUnitPriceMajor: (offer.baseUnitPriceMinor / 100).toFixed(2),
      minimumOrderQuantity: String(offer.minimumOrderQuantity || 100),
      retailerMoqPercentage: String(offer.retailerMoqPercentage ?? 20),
      retailerStepPercentage: String(offer.retailerStepPercentage ?? 1),
      availabilityStatus: offer.availabilityStatus || 'IN_STOCK',
      verificationStatus: offer.verificationStatus || 'VERIFIED',
      dataSourceType: offer.dataSourceType || 'VERIFIED_LIVE',
      leadTimeDays: String(offer.leadTimeDays || 3),
      shippingTerms: offer.shippingTerms || 'Standard Shipping',
      flatShippingCostMajor:
        offer.flatShippingCostMinor != null ? (offer.flatShippingCostMinor / 100).toFixed(2) : '0',
      shippingAllocationMethod: offer.shippingAllocationMethod || 'PER_UNIT',
      taxInclusion: offer.taxInclusion || 'GST_EXCLUDED',
      acceptsUnderMoqOrders: Boolean(offer.acceptsUnderMoqOrders),
      deliveryAreas: Array.isArray(offer.deliveryAreas) && offer.deliveryAreas.length > 0 ? offer.deliveryAreas : ['DELHI_NCR'],
      expiresAt: expDate,
      quantityTiers: (offer.quantityTiers || []).map((t) => ({
        minQuantity: String(t.minQuantity),
        maxQuantity: t.maxQuantity != null ? String(t.maxQuantity) : '',
        unitPriceMajor: (t.unitPriceMinor / 100).toFixed(2),
      })),
    });

    setEditModalOpen(true);
  };

  // Add / Remove Tier
  const handleAddTier = () => {
    setEditForm((prev) => {
      const last = prev.quantityTiers[prev.quantityTiers.length - 1];
      const nextMin = last && last.maxQuantity ? parseInt(last.maxQuantity, 10) + 1 : 200;
      return {
        ...prev,
        quantityTiers: [
          ...prev.quantityTiers,
          { minQuantity: String(nextMin), maxQuantity: '', unitPriceMajor: prev.baseUnitPriceMajor || '0' },
        ],
      };
    });
  };

  const handleRemoveTier = (idx) => {
    setEditForm((prev) => ({
      ...prev,
      quantityTiers: prev.quantityTiers.filter((_, i) => i !== idx),
    }));
  };

  const handleTierChange = (idx, field, val) => {
    setEditForm((prev) => {
      const updated = [...prev.quantityTiers];
      updated[idx] = { ...updated[idx], [field]: val };
      return { ...prev, quantityTiers: updated };
    });
  };

  // Save Edit (Permitted fields only; excludes immutable fields)
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingOffer || !isAdmin) return;

    const unitPrice = parseFloat(editForm.baseUnitPriceMajor);
    if (isNaN(unitPrice) || unitPrice <= 0) {
      notify?.('Base unit price must be a positive number.', 'error');
      return;
    }

    const moqW = parseInt(editForm.minimumOrderQuantity, 10);
    if (isNaN(moqW) || moqW < 1) {
      notify?.('Wholesale MOQ must be at least 1.', 'error');
      return;
    }

    const pMin = parseFloat(editForm.retailerMoqPercentage);
    if (isNaN(pMin) || pMin < 1 || pMin > 100) {
      notify?.('Retailer MOQ % must be between 1% and 100%.', 'error');
      return;
    }

    const pStep = parseFloat(editForm.retailerStepPercentage);
    if (isNaN(pStep) || pStep < 0.1 || pStep > 100) {
      notify?.('Retailer Step % must be between 0.1% and 100%.', 'error');
      return;
    }

    const expDate = new Date(editForm.expiresAt);
    if (isNaN(expDate.getTime())) {
      notify?.('Valid expiration date is required.', 'error');
      return;
    }

    const validatedTiers = editForm.quantityTiers
      .map((t) => ({
        minQuantity: parseInt(t.minQuantity, 10),
        maxQuantity: t.maxQuantity ? parseInt(t.maxQuantity, 10) : null,
        unitPriceMinor: Math.round(parseFloat(t.unitPriceMajor || '0') * 100),
      }))
      .filter((t) => !isNaN(t.minQuantity) && !isNaN(t.unitPriceMinor) && t.minQuantity > 0 && t.unitPriceMinor > 0);

    // Permitted fields only!
    const payload = {
      baseUnitPriceMinor: Math.round(unitPrice * 100),
      minimumOrderQuantity: moqW,
      retailerMoqPercentage: pMin,
      retailerStepPercentage: pStep,
      quantityTiers: validatedTiers,
      shippingTerms: editForm.shippingTerms.trim() || 'Standard Shipping',
      flatShippingCostMinor: Math.max(0, Math.round(parseFloat(editForm.flatShippingCostMajor || '0') * 100)),
      shippingAllocationMethod: editForm.shippingAllocationMethod,
      deliveryAreas: editForm.deliveryAreas,
      leadTimeDays: parseInt(editForm.leadTimeDays, 10) || 3,
      taxInclusion: editForm.taxInclusion,
      availabilityStatus: editForm.availabilityStatus,
      acceptsUnderMoqOrders: Boolean(editForm.acceptsUnderMoqOrders),
      verificationStatus: editForm.verificationStatus,
      dataSourceType: editForm.dataSourceType,
      expiresAt: expDate.toISOString(),
    };

    try {
      setSubmittingEdit(true);
      await updateOffer(editingOffer._id, payload);
      notify?.('Wholesale catalogue offer updated successfully.', 'success');
      setEditModalOpen(false);
      setEditingOffer(null);
      await fetchOffers();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to update offer.', 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-6" data-testid="admin-offers-page">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-6 w-6 text-midnight-emerald" />
            <h1 className="text-xl font-bold text-white tracking-tight">Catalogue Offer Moderation</h1>
            <Badge variant="outline">Wholesale Directory</Badge>
            <Badge variant={isAdmin ? 'neutral' : 'warning'}>
              {isAdmin ? 'ADMIN MODERATOR' : 'REVIEWER READ-ONLY'}
            </Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Audit wholesale Minimum Order Quantities ($MOQ_W$), retailer stepping rules, volume tier matrices, and price freezes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchOffers} disabled={loading}>
            <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Sub-navigation Links ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/suppliers')}
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Suppliers
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/offers')}
          className="px-3 py-1.5 rounded-lg bg-midnight-surface border border-midnight-border text-white font-medium"
        >
          Catalogue Offers
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/pools')}
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Pools & Reconciliation
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/audit')}
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Audit Logs
        </button>
      </div>

      {/* ── Endpoint Limitation Disclosure Banner ── */}
      <Alert variant="info" className="py-2.5">
        <Info className="h-4 w-4" />
        <AlertTitle className="text-xs font-semibold">Catalogue Query Scope Notice</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          The underlying catalogue query endpoint (<code>GET /offers/search</code>) is designed for marketplace discovery and filters offers with <code>isActive: true</code> unless expired inclusion is explicitly enabled. It does not provide full tombstone listing for inactive/deleted catalogue offers. Future backend enhancement is scheduled to introduce a dedicated administrative offer query route (<code>GET /admin/offers</code>).
        </AlertDescription>
      </Alert>

      {/* ── Reviewer Read-Only Notice ── */}
      {isReviewer && (
        <Alert variant="info" className="py-2.5">
          <Eye className="h-4 w-4" />
          <AlertTitle className="text-xs font-semibold">Reviewer Mode Active</AlertTitle>
          <AlertDescription className="text-xs">
            Reviewers can inspect wholesale catalogue offers, volume tiers, and supplier specifications, but cannot edit pricing, tiers, or availability status.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Offer Query Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={fetchOffers} className="ml-4">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Search & Filter Controls ── */}
      <div className="bg-midnight-card border border-midnight-border rounded-xl p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Delivery Area:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-1.5 focus:border-teal-400 focus:outline-none"
              value={selectedArea}
              onChange={(e) => {
                setSelectedArea(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Delivery Areas</option>
              {AVAILABLE_DELIVERY_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Data Provenance:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-1.5 focus:border-teal-400 focus:outline-none"
              value={selectedDataSource}
              onChange={(e) => {
                setSelectedDataSource(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Provenance Sources</option>
              {DATA_SOURCE_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <input
              type="checkbox"
              id="includeExpired"
              className="rounded border-midnight-border bg-midnight-surface text-teal-400 focus:ring-teal-400"
              checked={includeExpired}
              onChange={(e) => {
                setIncludeExpired(e.target.checked);
                setCurrentPage(1);
              }}
            />
            <label htmlFor="includeExpired" className="text-slate-300 text-xs cursor-pointer select-none">
              Include Expired Offers
            </label>
          </div>
        </div>
      </div>

      {/* ── Offers Table ── */}
      <div className="bg-midnight-card border border-midnight-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product / Packaging</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Base Price</TableHead>
              <TableHead>Wholesale MOQ</TableHead>
              <TableHead>Retailer Step</TableHead>
              <TableHead>Tiers</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead>Provenance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : offers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-midnight-muted text-xs">
                  No catalogue offers found matching the specified criteria.
                </TableCell>
              </TableRow>
            ) : (
              offers.map((offer) => {
                const moqW = offer.minimumOrderQuantity || 1;
                const moqR =
                  offer.computedRetailerMoq ||
                  Math.ceil((moqW * (offer.retailerMoqPercentage || 20)) / 100);
                const step =
                  offer.computedRetailerStep ||
                  Math.max(1, Math.round((moqW * (offer.retailerStepPercentage || 1)) / 100));

                return (
                  <TableRow key={offer._id} data-testid={`offer-row-${offer._id}`}>
                    {/* Product & Packaging */}
                    <TableCell className="font-medium text-white">
                      <div className="font-semibold text-sm">
                        {offer.productCanonicalName ||
                          offer.productId?.canonicalName ||
                          offer.productId?.name ||
                          'Wholesale Product'}
                      </div>
                      <div className="text-[11px] text-midnight-muted">
                        {offer.packUnit || 'UNIT'} • {offer.packSize || 'Standard'}
                      </div>
                    </TableCell>

                    {/* Supplier */}
                    <TableCell className="text-xs text-midnight-muted">
                      <div className="text-white font-medium">
                        {offer.supplierId?.name || String(offer.supplierId) || 'Verified Wholesaler'}
                      </div>
                      {offer.supplierId?.verificationStatus && (
                        <Badge variant="outline" className="text-[9px] mt-0.5">
                          {offer.supplierId.verificationStatus}
                        </Badge>
                      )}
                    </TableCell>

                    {/* Base Unit Price */}
                    <TableCell>
                      <span className="font-mono font-bold text-teal-300">
                        {formatMinorToMajor(offer.baseUnitPriceMinor || 0, offer.currency)}
                      </span>
                      <span className="text-[10px] text-midnight-muted block">
                        /{offer.packUnit || 'unit'}
                      </span>
                    </TableCell>

                    {/* MOQ */}
                    <TableCell className="font-mono text-xs">
                      <div className="text-white font-semibold">{moqW} {offer.packUnit}</div>
                      <div className="text-[10px] text-teal-300">MOQ_R: {moqR}</div>
                    </TableCell>

                    {/* Step */}
                    <TableCell className="font-mono text-xs text-slate-300">
                      +{step} {offer.packUnit}
                      <span className="text-[10px] text-midnight-muted block">({offer.retailerStepPercentage || 1}%)</span>
                    </TableCell>

                    {/* Tiers */}
                    <TableCell>
                      {offer.quantityTiers?.length > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-midnight-surface border border-midnight-border text-teal-300">
                          {offer.quantityTiers.length} tier{offer.quantityTiers.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-midnight-muted text-xs">Flat</span>
                      )}
                    </TableCell>

                    {/* Availability */}
                    <TableCell>
                      <Badge
                        variant={
                          offer.availabilityStatus === 'IN_STOCK'
                            ? 'success'
                            : offer.availabilityStatus === 'LOW_STOCK'
                            ? 'warning'
                            : 'outline'
                        }
                      >
                        {offer.availabilityStatus || 'IN_STOCK'}
                      </Badge>
                    </TableCell>

                    {/* Provenance */}
                    <TableCell>
                      <ProvenanceBadge type={offer.dataSourceType} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      {isAdmin ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(offer)}
                          className="text-xs h-7 px-2.5"
                          data-testid={`moderate-offer-${offer._id}`}
                        >
                          <Edit3 className="h-3 w-3 mr-1" />
                          Moderate
                        </Button>
                      ) : (
                        <span className="text-[11px] text-midnight-muted">Read-Only</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* ── Pagination Footer ── */}
        <div className="flex items-center justify-between p-3 border-t border-midnight-border text-xs text-midnight-muted">
          <span>
            Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages || 1}</strong> (Total {pagination.totalCount} offers)
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="h-7 px-2"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Modal: Moderate Wholesale Offer (ADMIN ONLY) ── */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-5 w-5 text-midnight-emerald" />
              Moderate Catalogue Offer
            </DialogTitle>
            <DialogDescription className="text-xs text-midnight-muted">
              Update wholesale MOQ parameters, volume discounts, and availability via PATCH /api/admin/offers/:id.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4 py-2 text-xs">
            {/* Immutable Attributes Notice */}
            <div className="p-3 rounded-lg bg-midnight-surface border border-midnight-border space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-2">
                  <span>Immutable Offer Attributes:</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-midnight-bg text-amber-300 border border-amber-500/20 font-semibold">
                    NON-EDITABLE
                  </span>
                </span>
                <span className="text-[10px] text-midnight-muted font-normal">Protected against modification</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-midnight-muted pt-1">
                <div>
                  Product:{' '}
                  <strong className="text-white">
                    {editingOffer?.productCanonicalName ||
                      editingOffer?.productId?.canonicalName ||
                      editingOffer?.productId?.name ||
                      'Product'}
                  </strong>
                </div>
                <div>
                  Pack Unit: <strong className="text-white">{editingOffer?.packUnit}</strong>
                </div>
                <div>
                  Pack Size: <strong className="text-white">{editingOffer?.packSize}</strong>
                </div>
                <div>
                  Currency: <strong className="text-white">{editingOffer?.currency || 'INR'}</strong>
                </div>
              </div>
            </div>

            {/* Section: Price & MOQ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Base Unit Price (₹) *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editForm.baseUnitPriceMajor}
                  onChange={(e) => setEditForm({ ...editForm, baseUnitPriceMajor: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Wholesale MOQ (MOQ_W) *</label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={editForm.minimumOrderQuantity}
                  onChange={(e) => setEditForm({ ...editForm, minimumOrderQuantity: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Availability Status</label>
                <select
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2 focus:border-teal-400 focus:outline-none"
                  value={editForm.availabilityStatus}
                  onChange={(e) => setEditForm({ ...editForm, availabilityStatus: e.target.value })}
                >
                  {AVAILABILITY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stepping Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Retailer MOQ % (p_min, default 20%)</label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={editForm.retailerMoqPercentage}
                  onChange={(e) => setEditForm({ ...editForm, retailerMoqPercentage: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Retailer Step % (p_step, default 1%)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={editForm.retailerStepPercentage}
                  onChange={(e) => setEditForm({ ...editForm, retailerStepPercentage: e.target.value })}
                />
              </div>
            </div>

            {/* Volume Tiers Editor */}
            <div className="space-y-2 p-3 bg-midnight-surface rounded-lg border border-midnight-border">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Quantity-based Price Tiers:</span>
                <Button type="button" variant="outline" size="sm" onClick={handleAddTier} className="h-6 text-xs px-2">
                  <Plus className="h-3 w-3 mr-1" /> Add Tier
                </Button>
              </div>

              {editForm.quantityTiers.length === 0 ? (
                <p className="text-[11px] text-midnight-muted italic">No volume discount tiers configured.</p>
              ) : (
                <div className="space-y-1.5">
                  {editForm.quantityTiers.map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="Min Qty"
                        value={tier.minQuantity}
                        onChange={(e) => handleTierChange(idx, 'minQuantity', e.target.value)}
                        className="w-24"
                      />
                      <Input
                        type="number"
                        placeholder="Max Qty (optional)"
                        value={tier.maxQuantity}
                        onChange={(e) => handleTierChange(idx, 'maxQuantity', e.target.value)}
                        className="w-28"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Price (₹)"
                        value={tier.unitPriceMajor}
                        onChange={(e) => handleTierChange(idx, 'unitPriceMajor', e.target.value)}
                        className="w-28"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTier(idx)}
                        className="text-rose-400 h-8 w-8 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verification, Provenance, and Expiry */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Verification Status</label>
                <select
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2 focus:border-teal-400 focus:outline-none"
                  value={editForm.verificationStatus}
                  onChange={(e) => setEditForm({ ...editForm, verificationStatus: e.target.value })}
                >
                  {VERIFICATION_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Data Provenance</label>
                <select
                  className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2 focus:border-teal-400 focus:outline-none"
                  value={editForm.dataSourceType}
                  onChange={(e) => setEditForm({ ...editForm, dataSourceType: e.target.value })}
                >
                  {DATA_SOURCE_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Expiration Date</label>
                <Input
                  type="date"
                  value={editForm.expiresAt}
                  onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={submittingEdit} type="submit">
                {submittingEdit ? 'Saving...' : 'Save Offer Moderation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminOffersPage;
