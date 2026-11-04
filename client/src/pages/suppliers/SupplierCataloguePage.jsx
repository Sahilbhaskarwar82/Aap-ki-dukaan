import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  SlidersHorizontal,
  Store,
  Layers,
  Truck,
  Clock,
  ShieldCheck,
  Building2,
  Database,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  ArrowUpDown,
  Check,
  X,
  Package,
  Calendar,
  IndianRupee,
  ChevronRight,
  TrendingDown,
  Info,
} from 'lucide-react';

import {
  searchOffers,
  compareOffers,
  CATEGORY_OPTIONS,
  DELIVERY_AREAS,
  SORT_OPTIONS,
  SORT_LABELS,
  MOQ_FILTER_OPTIONS,
  PROVENANCE_DISPLAY,
  getApiErrorMessage,
  isOfferExpired,
  resolveOfferProvenance,
  calculateOfferLandedCost,
} from '@/api/suppliers.api';

import { formatMinorToMajor } from '@/utils/money';
import { calcRetailerMoq, calcStepMultiple } from '@/utils/moqMath';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';

// ─── Offer Card Component ─────────────────────────────────────────────────────
function OfferCard({
  offer,
  isSelected,
  onToggleSelect,
  isSelectionDisabled,
}) {
  const provenance = resolveOfferProvenance(offer);
  const expired = isOfferExpired(offer);
  const landed = calculateOfferLandedCost(offer, 1);

  const wholesaleMoq = Number(offer.minimumOrderQuantity || 1);
  const retailerMoq =
    offer.computedRetailerMoq ??
    calcRetailerMoq(wholesaleMoq, offer.retailerMoqPercentage || 20);
  const stepMultiple =
    offer.computedRetailerStep ??
    calcStepMultiple(wholesaleMoq, offer.retailerStepPercentage || 1);

  const productName =
    offer.productId?.canonicalName ||
    offer.supplierProductDescription ||
    'Wholesale Product';
  const supplierName = offer.supplierId?.name || 'Verified Wholesaler';
  const category = offer.productId?.category || 'GENERAL';

  const expiresDateStr = offer.expiresAt
    ? new Date(offer.expiresAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div
      data-testid={`offer-card-${offer._id || offer.id}`}
      className={`group relative flex flex-col rounded-xl border transition-all duration-200 bg-midnight-card ${
        isSelected
          ? 'border-midnight-red ring-2 ring-midnight-red/40 shadow-lg shadow-midnight-red/10'
          : 'border-midnight-border hover:border-slate-500 hover:shadow-md'
      } ${expired ? 'opacity-85 border-amber-900/50' : ''}`}
    >
      {/* ── Card Header: Selection Control & Provenance Badges ── */}
      <div className="flex items-center justify-between p-4 border-b border-midnight-border/60 gap-2 bg-midnight-surface/40 rounded-t-xl">
        <label
          className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-midnight-text"
          htmlFor={`select-checkbox-${offer._id || offer.id}`}
        >
          <input
            id={`select-checkbox-${offer._id || offer.id}`}
            type="checkbox"
            data-testid={`select-offer-${offer._id || offer.id}`}
            checked={isSelected}
            disabled={!isSelected && isSelectionDisabled}
            onChange={() => onToggleSelect(offer._id || offer.id)}
            className="h-4 w-4 rounded border-midnight-border bg-midnight-surface text-midnight-red focus:ring-midnight-red focus:ring-offset-midnight-bg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <span className={isSelected ? 'text-midnight-red font-semibold' : 'text-midnight-muted'}>
            {isSelected ? 'Selected' : 'Compare'}
          </span>
        </label>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Provenance Badge */}
          <Badge
            variant={provenance.variant}
            data-testid={`provenance-badge-${offer._id || offer.id}`}
            className="text-[11px] font-semibold tracking-wide"
            title={provenance.description}
          >
            {provenance.label === 'VERIFIED LIVE' && <ShieldCheck className="h-3 w-3 mr-1" />}
            {provenance.label === 'SUPPLIER SUBMITTED' && <Building2 className="h-3 w-3 mr-1" />}
            {provenance.label === 'DEMO SAMPLE DATA' && <Database className="h-3 w-3 mr-1" />}
            {provenance.label}
          </Badge>

          {/* Expired Quote Warning Badge */}
          {expired && (
            <Badge
              variant="destructive"
              data-testid={`expired-badge-${offer._id || offer.id}`}
              className="text-[10px] uppercase font-bold tracking-wider bg-rose-950/80 text-rose-300 border-rose-500/40"
            >
              <Clock className="h-3 w-3 mr-1" /> Expired Quote
            </Badge>
          )}
        </div>
      </div>

      {/* ── Card Body: Product, Supplier & Core Pricing ── */}
      <div className="p-5 flex-1 space-y-4">
        {/* Title & Supplier */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3
              className="font-display font-semibold text-base sm:text-lg text-white group-hover:text-midnight-red-hover transition-colors line-clamp-1"
              data-testid="offer-product-name"
            >
              {productName}
            </h3>
            <Badge variant="outline" className="text-[10px] shrink-0 text-slate-400 border-slate-700">
              {category}
            </Badge>
          </div>

          <p className="text-xs text-midnight-muted mt-1 flex items-center gap-1.5" data-testid="offer-supplier-name">
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            {offer.supplierId?._id || typeof offer.supplierId === 'string' ? (
              <Link
                to={`/suppliers/${offer.supplierId?._id || offer.supplierId}`}
                className="font-medium text-slate-300 hover:text-midnight-red hover:underline truncate transition-colors"
                data-testid={`supplier-link-${offer._id || offer.id}`}
              >
                {supplierName}
              </Link>
            ) : (
              <span className="font-medium text-slate-300 truncate">{supplierName}</span>
            )}
          </p>

          {offer.supplierProductDescription && offer.supplierProductDescription !== productName && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 italic">
              {offer.supplierProductDescription}
            </p>
          )}
        </div>

        {/* Pricing Headline */}
        <div className="p-3 rounded-lg bg-midnight-surface/80 border border-midnight-border space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <span className="text-xs text-midnight-muted">Base Unit Price</span>
              <div className="text-xl sm:text-2xl font-bold text-white tracking-tight" data-testid="offer-unit-price">
                {formatMinorToMajor(offer.baseUnitPriceMinor || 0, offer.currency || 'INR')}
                <span className="text-xs font-normal text-midnight-muted ml-1">
                  / {offer.packUnit || 'UNIT'}
                </span>
              </div>
            </div>

            {offer.packSize && (
              <div className="text-right">
                <span className="text-[11px] text-midnight-muted block">Pack Spec</span>
                <span className="text-xs font-semibold text-slate-200">{offer.packSize}</span>
              </div>
            )}
          </div>

          {/* Landed Cost & Shipping Information */}
          <div className="pt-2 border-t border-midnight-border/60 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-slate-300">
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3 text-slate-400" />
              {landed.isShippingKnown ? (
                <span>
                  Flat Shipping: <strong className="text-white">{formatMinorToMajor(landed.shippingCostMinor, offer.currency || 'INR')}</strong>
                </span>
              ) : (
                <span className="text-amber-400 italic" data-testid="shipping-pending-label">Shipping Quote Pending</span>
              )}
            </span>

            <span className="text-[11px]">
              {landed.isCompleteLandedCost ? (
                <span className="text-emerald-400 font-medium" data-testid="landed-cost-complete">
                  Landed: {formatMinorToMajor(landed.landedCostMinor, offer.currency || 'INR')}
                </span>
              ) : (
                <span className="text-slate-400 italic" data-testid="landed-cost-partial">
                  Merch. only: {formatMinorToMajor(landed.merchandiseTotalMinor, offer.currency || 'INR')}
                </span>
              )}
            </span>

            <span className="text-[11px]">
              {offer.taxInclusion === 'GST_INCLUDED' ? (
                <span className="text-emerald-400 font-medium">GST Included</span>
              ) : (
                <span className="text-slate-400">GST Excluded</span>
              )}
            </span>
          </div>
        </div>

        {/* Two-Level MOQ & Step Multiples Grid (SRS FR-SUP-005) */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded bg-midnight-surface/50 border border-midnight-border/70">
            <span className="text-[10px] text-midnight-muted block uppercase tracking-wider font-mono">MOQ_W</span>
            <strong className="text-white font-semibold text-sm" data-testid="moq-wholesale">
              {wholesaleMoq.toLocaleString('en-IN')}
            </strong>
            <span className="text-[9px] text-midnight-muted block">Wholesale</span>
          </div>

          <div className="p-2 rounded bg-midnight-surface/50 border border-midnight-border/70">
            <span className="text-[10px] text-midnight-muted block uppercase tracking-wider font-mono">MOQ_R</span>
            <strong className="text-emerald-400 font-semibold text-sm" data-testid="moq-retailer">
              {retailerMoq.toLocaleString('en-IN')}
            </strong>
            <span className="text-[9px] text-midnight-muted block">Retailer (20%)</span>
          </div>

          <div className="p-2 rounded bg-midnight-surface/50 border border-midnight-border/70">
            <span className="text-[10px] text-midnight-muted block uppercase tracking-wider font-mono">STEP</span>
            <strong className="text-cyan-400 font-semibold text-sm" data-testid="step-multiple">
              {stepMultiple.toLocaleString('en-IN')}
            </strong>
            <span className="text-[9px] text-midnight-muted block">Step (1%)</span>
          </div>
        </div>

        {/* Quantity Price Tiers */}
        {Array.isArray(offer.quantityTiers) && offer.quantityTiers.length > 0 && (
          <div className="space-y-1.5 pt-1" data-testid="offer-price-tiers">
            <div className="text-[11px] font-semibold text-midnight-muted uppercase tracking-wider flex items-center justify-between">
              <span>Bulk Quantity Price Breaks</span>
              <span className="text-[10px] text-emerald-400 lowercase font-normal">save more</span>
            </div>
            <div className="space-y-1 text-xs">
              {offer.quantityTiers.map((tier, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-2.5 py-1 rounded bg-midnight-surface/40 border border-midnight-border/50 text-slate-300"
                >
                  <span>
                    {tier.minQuantity.toLocaleString('en-IN')}
                    {tier.maxQuantity ? ` – ${tier.maxQuantity.toLocaleString('en-IN')}` : '+'} units
                  </span>
                  <strong className="text-emerald-400 font-mono">
                    {formatMinorToMajor(tier.unitPriceMinor, offer.currency || 'INR')}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lead Time & Service Delivery Zones */}
        <div className="pt-2 border-t border-midnight-border/60 space-y-1 text-xs text-midnight-muted">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              Lead time:
            </span>
            <strong className="text-slate-200">{offer.leadTimeDays || 3} days</strong>
          </div>

          {Array.isArray(offer.deliveryAreas) && offer.deliveryAreas.length > 0 && (
            <div className="flex items-center justify-between">
              <span>Delivery zones:</span>
              <span className="text-slate-200 text-right truncate max-w-[160px]" title={offer.deliveryAreas.join(', ')}>
                {offer.deliveryAreas.join(', ')}
              </span>
            </div>
          )}

          {expiresDateStr && (
            <div className="flex items-center justify-between pt-1 text-[11px]">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                Quote expiry:
              </span>
              <span className={expired ? 'text-rose-400 font-semibold' : 'text-slate-300'}>
                {expiresDateStr}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Side-by-Side Comparison Modal ────────────────────────────────────────────
function OfferComparisonModal({
  isOpen,
  onClose,
  selectedOffers,
  onRemoveOffer,
  deliveryArea,
}) {
  const [evalQty, setEvalQty] = useState(100);
  const [compareArea, setCompareArea] = useState(deliveryArea || 'DELHI_NCR');
  const [comparisonData, setComparisonData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchComparison = useCallback(async () => {
    if (!selectedOffers || selectedOffers.length < 2) return;
    setLoading(true);
    setError(null);

    try {
      const offerIds = selectedOffers.map((o) => o._id || o.id);
      const res = await compareOffers({
        offerIds,
        requestedQuantity: Number(evalQty) || 100,
        deliveryArea: compareArea !== 'ALL' ? compareArea : 'DELHI_NCR',
      });

      const payload = res?.data?.data !== undefined ? res.data.data : res?.data;
      if (payload) {
        setComparisonData(payload.comparison || null);
        setSummaryData(payload.summary || null);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to compare selected offers.'));
    } finally {
      setLoading(false);
    }
  }, [selectedOffers, evalQty, compareArea]);

  useEffect(() => {
    if (isOpen && selectedOffers.length >= 2) {
      fetchComparison();
    }
  }, [isOpen, selectedOffers.length, fetchComparison]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" data-testid="comparison-modal">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-midnight-border/70 pb-3">
            <div>
              <DialogTitle className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-midnight-red" />
                Side-by-Side Wholesale Offer Comparison
              </DialogTitle>
              <DialogDescription className="text-xs text-midnight-muted mt-0.5">
                Authoritative deterministic landed-cost calculations and AI trade-off advisory
              </DialogDescription>
            </div>

            {/* Evaluation Quantity Controller */}
            <div className="flex items-center gap-3 bg-midnight-surface/80 border border-midnight-border px-3 py-1.5 rounded-lg shrink-0">
              <label className="text-xs text-midnight-muted whitespace-nowrap" htmlFor="eval-quantity-input">
                Evaluation Qty:
              </label>
              <input
                id="eval-quantity-input"
                type="number"
                min="1"
                data-testid="compare-quantity-input"
                value={evalQty}
                onChange={(e) => setEvalQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 rounded border border-midnight-border bg-midnight-card px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-midnight-red"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={fetchComparison}
                disabled={loading}
                className="h-7 text-xs px-2"
                data-testid="recalculate-comparison-button"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Content ── */}
        {loading ? (
          <div className="space-y-4 py-8" data-testid="comparison-loading">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : error ? (
          <Alert variant="error" data-testid="comparison-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could Not Complete Comparison</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={fetchComparison}>
                Retry Comparison
              </Button>
            </div>
          </Alert>
        ) : comparisonData ? (
          <div className="space-y-6 pt-2">
            {/* ── AI Trade-off Summary (Task SAH-07 / SAH-08) ── */}
            {summaryData && (
              <div
                className="rounded-xl border border-midnight-red/30 bg-midnight-surface/90 p-4 sm:p-5 space-y-3 shadow-lg"
                data-testid="ai-tradeoff-summary"
              >
                <div className="flex items-center gap-2 text-midnight-red font-semibold text-sm">
                  <Sparkles className="h-4 w-4" />
                  <span>AI Commercial Trade-off Analysis</span>
                </div>

                {summaryData.headline && (
                  <h4 className="text-base font-bold text-white tracking-tight" data-testid="summary-headline">
                    {summaryData.headline}
                  </h4>
                )}

                {summaryData.tradeOffExplanation && (
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed" data-testid="summary-explanation">
                    {summaryData.tradeOffExplanation}
                  </p>
                )}

                {/* Key Differentiators */}
                {Array.isArray(summaryData.keyDifferentiators) && summaryData.keyDifferentiators.length > 0 && (
                  <div className="pt-2 border-t border-midnight-border/60">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Key Evaluation Highlights:
                    </span>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-300">
                      {summaryData.keyDifferentiators.map((diff, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{diff}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ── Side-by-Side Comparison Matrix ── */}
            <div className="overflow-x-auto rounded-xl border border-midnight-border" data-testid="comparison-table">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-midnight-surface border-b border-midnight-border">
                    <th className="p-3 font-semibold text-midnight-muted uppercase tracking-wider w-40 min-w-[140px]">
                      Offer Attributes
                    </th>
                    {comparisonData.comparisons?.map((comp) => {
                      const isBest = comp.offerId === comparisonData.bestOfferId;
                      return (
                        <th
                          key={comp.offerId}
                          className={`p-3 font-semibold min-w-[200px] align-top ${
                            isBest ? 'bg-midnight-red/10 border-x border-midnight-red/40' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              {isBest && (
                                <Badge variant="success" className="mb-1 text-[10px] px-2 py-0.5">
                                  ★ Best Landed Cost
                                </Badge>
                              )}
                              <h4 className="font-bold text-white text-sm line-clamp-1">{comp.productName}</h4>
                              <p className="text-midnight-muted text-[11px] font-normal">{comp.supplierName}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemoveOffer(comp.offerId)}
                              className="text-midnight-muted hover:text-white p-1 rounded transition-colors"
                              title="Remove from comparison"
                              aria-label={`Remove ${comp.supplierName} offer from comparison`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-midnight-border/60 bg-midnight-card text-slate-300">
                  {/* Row: Provenance */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Provenance</td>
                    {comparisonData.comparisons?.map((c) => {
                      const src = (c.dataSourceType || '').toUpperCase();
                      const ver = (c.verificationStatus || '').toUpperCase();
                      let label = 'UNVERIFIED';
                      let badgeVariant = 'outline';
                      // Must be VERIFIED_LIVE source AND VERIFIED status to show as verified
                      if (src === 'VERIFIED_LIVE' && ver === 'VERIFIED') {
                        label = 'VERIFIED LIVE';
                        badgeVariant = 'success';
                      } else if (src === 'SUPPLIER_SUBMITTED') {
                        label = 'SUPPLIER SUBMITTED';
                        badgeVariant = 'pool';
                      } else if (src === 'SEEDED_DEMO' || ver === 'DEMO_SAMPLE') {
                        label = 'DEMO SAMPLE DATA';
                        badgeVariant = 'provenance';
                      } else if (src === 'EXTERNAL_API') {
                        label = 'EXTERNAL SOURCE';
                        badgeVariant = 'outline';
                      }
                      return (
                        <td key={c.offerId} className="p-3">
                          <Badge variant={badgeVariant} className="text-[10px]">{label}</Badge>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Unit Price at Tier */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Applied Unit Price</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3 font-mono font-semibold text-white">
                        {formatMinorToMajor(c.appliedUnitPriceMinor, c.currency)}
                        <span className="text-[10px] text-midnight-muted ml-1">/ {c.packUnit || 'unit'}</span>
                      </td>
                    ))}
                  </tr>

                  {/* Row: Merchandise Total */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Merchandise Subtotal</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3 font-mono text-slate-200">
                        {formatMinorToMajor(c.merchandiseTotalMinor, c.currency)}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Shipping Cost & Terms */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Shipping Terms</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3">
                        {c.isShippingKnown ? (
                          <span className="font-mono text-emerald-400">
                            {formatMinorToMajor(c.shippingCostMinor, c.currency)} ({c.shippingTerms})
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Pending ({c.shippingTerms})</span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Known Landed Cost */}
                  <tr className="bg-midnight-surface/60 font-semibold">
                    <td className="p-3 text-white">Known Landed Cost</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3 font-mono text-base text-white">
                        {formatMinorToMajor(c.knownLandedCostMinor, c.currency)}
                        {c.savingsVsHighestMinor > 0 && (
                          <span className="text-[10px] text-emerald-400 block font-normal">
                            save {formatMinorToMajor(c.savingsVsHighestMinor, c.currency)} vs highest
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Tax Treatment */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Tax Inclusion</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3">
                        {c.costFlags?.includes('GST_INCLUDED') ? (
                          <span className="text-emerald-400 font-medium">GST Included</span>
                        ) : (
                          <span className="text-slate-400">GST Excluded (+18%)</span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Wholesale MOQ */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Wholesale MOQ (MOQ_W)</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3 font-mono">
                        {c.moqFeasibility?.wholesaleMoq?.toLocaleString('en-IN')} units
                      </td>
                    ))}
                  </tr>

                  {/* Row: Retailer Floor MOQ */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Retailer MOQ (MOQ_R)</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3 font-mono text-emerald-400">
                        {c.moqFeasibility?.retailerMoq?.toLocaleString('en-IN')} units
                      </td>
                    ))}
                  </tr>

                  {/* Row: Step Multiple */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Order Step Multiple</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3 font-mono text-cyan-400">
                        {c.moqFeasibility?.retailerStep?.toLocaleString('en-IN')} units
                      </td>
                    ))}
                  </tr>

                  {/* Row: Two-Level MOQ Feasibility Check */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">MOQ Feasibility</td>
                    {comparisonData.comparisons?.map((c) => {
                      const f = c.moqFeasibility;
                      return (
                        <td key={c.offerId} className="p-3 space-y-1">
                          {f?.meetsWholesaleMoq ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Meets Wholesale MOQ
                            </span>
                          ) : f?.meetsRetailerMoq ? (
                            <span className="text-cyan-400 flex items-center gap-1">
                              <Info className="h-3.5 w-3.5" /> Meets Retailer Floor (Pool Needed)
                            </span>
                          ) : (
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" /> Below Retailer Floor
                            </span>
                          )}
                          {!f?.stepCompliant && (
                            <span className="text-amber-300 block text-[10px]">
                              Not multiple of Step ({f?.retailerStep})
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Lead Time */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Lead Time</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3">
                        {c.leadTimeDays} days
                      </td>
                    ))}
                  </tr>

                  {/* Row: Quote Status & Freshness */}
                  <tr>
                    <td className="p-3 font-medium text-midnight-muted bg-midnight-surface/30">Quote Freshness</td>
                    {comparisonData.comparisons?.map((c) => (
                      <td key={c.offerId} className="p-3">
                        {c.quoteFreshness?.isExpired ? (
                          <span className="text-rose-400 font-semibold flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Expired
                          </span>
                        ) : (
                          <span className="text-slate-300">
                            {c.quoteFreshness?.daysUntilExpiry} days remaining
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <DialogFooter className="mt-6 border-t border-midnight-border/70 pt-4">
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close Comparison
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────
export default function SupplierCataloguePage() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [deliveryAreaFilter, setDeliveryAreaFilter] = useState('ALL');
  const [maxMoqFilter, setMaxMoqFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState(SORT_OPTIONS.LOWEST_LANDED_COST);
  const [includeExpired, setIncludeExpired] = useState(false);

  // Selection for Side-by-Side Comparison (Max 4)
  const [selectedOfferIds, setSelectedOfferIds] = useState([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [selectionWarning, setSelectionWarning] = useState(null);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch offers from backend
  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchOffers({
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        deliveryArea: deliveryAreaFilter !== 'ALL' ? deliveryAreaFilter : undefined,
        maxMoq: maxMoqFilter !== 'ALL' ? maxMoqFilter : undefined,
        includeExpired,
      });

      const payload = res?.data?.data !== undefined ? res.data.data : res?.data;
      const rawOffers = Array.isArray(payload?.offers)
        ? payload.offers
        : Array.isArray(payload)
        ? payload
        : [];

      setOffers(rawOffers);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to retrieve supplier catalogue offers.'));
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, deliveryAreaFilter, maxMoqFilter, includeExpired]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Client-side search & sort over fetched offers
  const processedOffers = useMemo(() => {
    let result = [...offers];

    // Client-side text search (product name, supplier name, description)
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter((offer) => {
        const prod = (offer.productId?.canonicalName || '').toLowerCase();
        const supp = (offer.supplierId?.name || '').toLowerCase();
        const desc = (offer.supplierProductDescription || '').toLowerCase();
        return prod.includes(lower) || supp.includes(lower) || desc.includes(lower);
      });
    }

    // Sort offers
    result.sort((a, b) => {
      if (sortBy === SORT_OPTIONS.LOWEST_LANDED_COST) {
        // Only rank offers with complete landed costs (shipping known) against each other.
        // Offers with unknown shipping are moved to the end.
        const landedA = calculateOfferLandedCost(a, 1);
        const landedB = calculateOfferLandedCost(b, 1);
        const costA = landedA.isCompleteLandedCost ? landedA.landedCostMinor : Infinity;
        const costB = landedB.isCompleteLandedCost ? landedB.landedCostMinor : Infinity;
        return costA - costB;
      }
      if (sortBy === SORT_OPTIONS.LOWEST_MOQ) {
        return (a.minimumOrderQuantity || 0) - (b.minimumOrderQuantity || 0);
      }
      if (sortBy === SORT_OPTIONS.FRESHEST_QUOTE) {
        // Use quoteTimestamp (the authoritative creation date of the quote),
        // NOT expiresAt (which represents expiry, not freshness).
        // Fall back to createdAt if quoteTimestamp is absent.
        const tsA = a.quoteTimestamp || a.createdAt;
        const tsB = b.quoteTimestamp || b.createdAt;
        const dateA = tsA ? new Date(tsA).getTime() : 0;
        const dateB = tsB ? new Date(tsB).getTime() : 0;
        return dateB - dateA; // Newest first
      }
      return 0;
    });

    return result;
  }, [offers, debouncedSearch, sortBy]);

  // Selected offers records
  const selectedOffersList = useMemo(() => {
    return offers.filter((o) => selectedOfferIds.includes(o._id || o.id));
  }, [offers, selectedOfferIds]);

  // Toggle offer selection (Max 4)
  const handleToggleSelect = (offerId) => {
    setSelectionWarning(null);
    if (selectedOfferIds.includes(offerId)) {
      setSelectedOfferIds((prev) => prev.filter((id) => id !== offerId));
    } else {
      if (selectedOfferIds.length >= 4) {
        setSelectionWarning('Maximum 4 offers can be compared side by side.');
        return;
      }
      setSelectedOfferIds((prev) => [...prev, offerId]);
    }
  };

  const handleClearSelection = () => {
    setSelectedOfferIds([]);
    setSelectionWarning(null);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setCategoryFilter('ALL');
    setDeliveryAreaFilter('ALL');
    setMaxMoqFilter('ALL');
    setSortBy(SORT_OPTIONS.LOWEST_LANDED_COST);
    setIncludeExpired(false);
  };

  const hasActiveFilters =
    debouncedSearch ||
    categoryFilter !== 'ALL' ||
    deliveryAreaFilter !== 'ALL' ||
    maxMoqFilter !== 'ALL' ||
    includeExpired;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24" data-testid="supplier-catalogue-page">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-midnight-border/70 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Store className="h-7 w-7 text-midnight-red" />
            Wholesale Supplier Catalogue
          </h1>
          <p className="text-xs sm:text-sm text-midnight-muted mt-1">
            Browse verified regional wholesalers, MOQ tiers, live pricing, and evaluate quotes side by side.
          </p>
        </div>

        {/* Selected count button in header */}
        <div className="flex items-center gap-3">
          {selectedOfferIds.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCompareOpen(true)}
              disabled={selectedOfferIds.length < 2}
              className="text-xs font-semibold"
              data-testid="header-compare-button"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              Compare ({selectedOfferIds.length}/4)
            </Button>
          )}

          <Badge variant="outline" className="text-xs text-midnight-muted border-midnight-border px-3 py-1">
            {processedOffers.length} {processedOffers.length === 1 ? 'Offer' : 'Offers'} Found
          </Badge>
        </div>
      </div>

      {/* ── Selection Warning Notification ── */}
      {selectionWarning && (
        <Alert variant="warning" data-testid="selection-warning-banner">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{selectionWarning}</AlertDescription>
        </Alert>
      )}

      {/* ── Search & Filter Controls ── */}
      <div className="rounded-xl border border-midnight-border bg-midnight-card p-4 sm:p-5 space-y-4 shadow-sm" data-testid="catalogue-filters">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-2 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-midnight-muted pointer-events-none" />
            <Input
              type="search"
              placeholder="Search by product name, supplier, or description..."
              data-testid="catalogue-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs sm:text-sm"
            />
          </div>

          {/* Category Filter */}
          <div>
            <Select
              data-testid="filter-category-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={CATEGORY_OPTIONS}
              className="text-xs sm:text-sm"
            />
          </div>

          {/* Delivery Area Filter */}
          <div>
            <Select
              data-testid="filter-delivery-area-select"
              value={deliveryAreaFilter}
              onChange={(e) => setDeliveryAreaFilter(e.target.value)}
              options={DELIVERY_AREAS}
              className="text-xs sm:text-sm"
            />
          </div>
        </div>

        {/* Secondary Row: MOQ filter, Sorting & Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-midnight-border/60 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* MOQ Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-midnight-muted whitespace-nowrap">Max MOQ:</span>
              <Select
                data-testid="filter-moq-select"
                value={maxMoqFilter}
                onChange={(e) => setMaxMoqFilter(e.target.value)}
                options={MOQ_FILTER_OPTIONS}
                className="w-36 text-xs h-8"
              />
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-1.5">
              <span className="text-midnight-muted whitespace-nowrap flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" /> Sort by:
              </span>
              <Select
                data-testid="sort-by-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                options={SORT_LABELS}
                className="w-40 text-xs h-8"
              />
            </div>

            {/* Include Expired Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-midnight-muted hover:text-midnight-text transition-colors">
              <input
                type="checkbox"
                data-testid="include-expired-toggle"
                checked={includeExpired}
                onChange={(e) => setIncludeExpired(e.target.checked)}
                className="rounded border-midnight-border bg-midnight-surface text-midnight-red focus:ring-midnight-red"
              />
              <span>Include Expired Quotes</span>
            </label>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              data-testid="clear-filters-button"
              className="h-8 text-xs text-slate-300"
            >
              <X className="h-3 w-3 mr-1" />
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* ── Offers Grid / Loading / Error / Empty States ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="offers-loading">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="rounded-xl border border-midnight-border bg-midnight-card p-5 space-y-4" data-testid="offer-skeleton">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-12 rounded" />
                <Skeleton className="h-12 rounded" />
                <Skeleton className="h-12 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <Alert variant="error" data-testid="catalogue-error">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Could Not Load Supplier Offers</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={fetchOffers} data-testid="retry-catalogue-button">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry Loading Catalogue
            </Button>
          </div>
        </Alert>
      ) : processedOffers.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-midnight-border bg-midnight-card/60 p-12 text-center space-y-4"
          data-testid="catalogue-empty"
        >
          <div className="inline-flex p-3 rounded-full bg-midnight-surface text-midnight-muted">
            <Package className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">No Matching Supplier Offers Found</h3>
            <p className="text-xs sm:text-sm text-midnight-muted max-w-md mx-auto mt-1">
              We couldn't find any supplier catalogue offers matching your active filters. Try clearing your search keyword, adjusting the delivery area, or widening the MOQ threshold.
            </p>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={handleResetFilters} data-testid="empty-reset-button">
              Clear All Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="offers-grid">
          {processedOffers.map((offer) => {
            const offerId = offer._id || offer.id;
            const isSelected = selectedOfferIds.includes(offerId);
            return (
              <OfferCard
                key={offerId}
                offer={offer}
                isSelected={isSelected}
                onToggleSelect={handleToggleSelect}
                isSelectionDisabled={selectedOfferIds.length >= 4}
              />
            );
          })}
        </div>
      )}

      {/* ── Sticky Comparison Bottom Floating Dock ── */}
      {selectedOfferIds.length > 0 && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-4xl rounded-2xl border border-midnight-border bg-midnight-surface/95 backdrop-blur-md p-3 sm:p-4 shadow-2xl shadow-black/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          data-testid="floating-comparison-dock"
        >
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Badge variant="pool" data-testid="selected-count-badge" className="text-xs px-2.5 py-1 font-semibold">
              {selectedOfferIds.length} of 4 Selected
            </Badge>

            {/* Quick chips of selected offers */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-md py-1">
              {selectedOffersList.map((off) => (
                <span
                  key={off._id || off.id}
                  className="inline-flex items-center gap-1 rounded bg-midnight-card border border-midnight-border px-2 py-0.5 text-slate-200 text-[11px] truncate max-w-[130px]"
                >
                  <span className="truncate">{off.productId?.canonicalName || off.supplierId?.name || 'Offer'}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleSelect(off._id || off.id)}
                    className="text-slate-400 hover:text-white"
                    aria-label={`Remove ${off.supplierId?.name} from selection`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSelection}
              data-testid="clear-selection-button"
              className="h-8 text-xs text-slate-400"
            >
              Clear
            </Button>

            <Button
              variant="primary"
              size="sm"
              disabled={selectedOfferIds.length < 2}
              onClick={() => setIsCompareOpen(true)}
              data-testid="open-comparison-button"
              className="h-8 text-xs font-semibold"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              Compare Offers ({selectedOfferIds.length})
            </Button>
          </div>
        </div>
      )}

      {/* ── Side-by-Side Comparison Dialog ── */}
      <OfferComparisonModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        selectedOffers={selectedOffersList}
        onRemoveOffer={handleToggleSelect}
        deliveryArea={deliveryAreaFilter !== 'ALL' ? deliveryAreaFilter : 'DELHI_NCR'}
      />
    </div>
  );
}
