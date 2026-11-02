/**
 * CoBuy AI — Pool Approval Page (SUJ-04)
 *
 * Route: /group-buys/:poolId/approve
 *
 * Dedicated page for participating buyers to:
 *  - Review the exact frozen PriceSnapshot applicable to their contribution
 *  - Reconcile final frozen payable against amount already paid
 *  - Understand tier-savings refund or additional balance
 *  - See invalidated approval warning if terms changed (INVALIDATED_BY_CHANGE)
 *  - Explicitly review and approve the versioned snapshot
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Coins,
  Receipt,
  Info,
  Layers,
  FileCheck2,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import { fetchPoolById, approvePriceSnapshot } from '@/api/pools.api';

import { PriceBreakdownLedger } from '@/components/common/PriceBreakdownLedger';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';

export function PoolApprovalPage() {
  const { poolId } = useParams();
  const navigate = useNavigate();
  const { user, shop } = useAuth();
  const { notify } = useNotifications();

  // Primary Data State
  const [pool, setPool] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Load pool & snapshot details
  const loadData = useCallback(async () => {
    if (!poolId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPoolById(poolId);
      setPool(data.pool);
      setContributions(data.contributions || []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load price snapshot data.');
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Defensive resolution of frozen snapshot document
  const snapshot = useMemo(() => {
    if (!pool) return null;
    if (pool.latestPriceSnapshotId && typeof pool.latestPriceSnapshotId === 'object' && pool.latestPriceSnapshotId._id) {
      return pool.latestPriceSnapshotId;
    }
    if (pool.activePriceSnapshotId && typeof pool.activePriceSnapshotId === 'object' && pool.activePriceSnapshotId._id) {
      return pool.activePriceSnapshotId;
    }
    if (pool.latestPriceSnapshot && typeof pool.latestPriceSnapshot === 'object' && pool.latestPriceSnapshot._id) {
      return pool.latestPriceSnapshot;
    }
    if (pool.priceSnapshot && typeof pool.priceSnapshot === 'object' && pool.priceSnapshot._id) {
      return pool.priceSnapshot;
    }
    return null;
  }, [pool]);

  const snapshotId = snapshot?._id || (typeof pool?.latestPriceSnapshotId === 'string' ? pool.latestPriceSnapshotId : null);
  const snapshotVersion = snapshot?.version ?? pool?.priceBreakdownVersion ?? 1;

  // Resolve current user's contribution
  const myContribution = useMemo(() => {
    if (!contributions || (!shop && !user)) return null;
    const targetShopId = String(shop?._id || user?.shopId || '');
    return (
      contributions.find(
        (c) =>
          String(c.shopId?._id || c.shopId || '') === targetShopId &&
          c.state !== 'WITHDRAWN' &&
          c.state !== 'CANCELLED'
      ) || null
    );
  }, [contributions, shop, user]);

  // Resolve matching member share from frozen snapshot
  const matchingMemberShare = useMemo(() => {
    if (!snapshot || !Array.isArray(snapshot.memberShares) || !myContribution) return null;
    // Match by contributionId first
    const byContrib = snapshot.memberShares.find(
      (s) => String(s.contributionId?._id || s.contributionId || '') === String(myContribution._id)
    );
    if (byContrib) return byContrib;

    // Match by shopId fallback
    const targetShopId = String(shop?._id || user?.shopId || '');
    return (
      snapshot.memberShares.find(
        (s) => String(s.shopId?._id || s.shopId || '') === targetShopId
      ) || null
    );
  }, [snapshot, myContribution, shop, user]);

  // Currency
  const currency = snapshot?.currency || pool?.currency || 'INR';

  // Payment reconciliation
  const reconciliation = useMemo(() => {
    if (!matchingMemberShare || !myContribution) return null;

    const snapshotTotalPayableMinor = Number(matchingMemberShare.totalPayableMinor);
    const totalPaidMinor = Number(myContribution.totalPaidMinor ?? 0);

    if (!Number.isFinite(snapshotTotalPayableMinor) || !Number.isFinite(totalPaidMinor)) {
      return { isInvalid: true };
    }

    const differenceMinor = snapshotTotalPayableMinor - totalPaidMinor;
    return {
      isInvalid: false,
      snapshotTotalPayableMinor,
      totalPaidMinor,
      differenceMinor,
      refundDueMinor: differenceMinor < 0 ? Math.abs(differenceMinor) : 0,
      additionalDueMinor: differenceMinor > 0 ? differenceMinor : 0,
      isFullySettled: differenceMinor === 0,
      isRefundDue: differenceMinor < 0,
      isAdditionalDue: differenceMinor > 0,
    };
  }, [matchingMemberShare, myContribution]);

  // Approval status states
  const isInvalidated = myContribution?.approvalStatus === 'INVALIDATED_BY_CHANGE';
  const isAlreadyApproved =
    myContribution?.approvalStatus === 'APPROVED' &&
    (!myContribution.approvedPriceSnapshotId ||
      String(myContribution.approvedPriceSnapshotId?._id || myContribution.approvedPriceSnapshotId) === String(snapshotId));
  const isSuperseded = Boolean(snapshot?.isSuperseded);

  const canApprove =
    Boolean(snapshotId) &&
    !isSuperseded &&
    Boolean(matchingMemberShare) &&
    !isAlreadyApproved &&
    !actionLoading &&
    user?.role === 'SHOP_OWNER';

  // Explicit approval handler
  const handleApprove = async () => {
    if (!canApprove) return;
    try {
      setActionLoading(true);
      await approvePriceSnapshot(poolId, snapshotId);
      notify?.(`Final Cost Breakdown (Snapshot v${snapshotVersion}) approved successfully!`, 'success');
      await loadData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to approve price snapshot.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 py-8" data-testid="pool-approval-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-8" data-testid="pool-approval-error">
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Unable to Load Price Snapshot</AlertTitle>
          <AlertDescription>{error || 'The requested group-buy pool could not be found.'}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate(poolId ? `/group-buys/${poolId}` : '/group-buys')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pool Details
        </Button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-8" data-testid="pool-approval-no-snapshot">
        <Alert variant="warning" className="border-amber-500/50 bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <AlertTitle className="text-amber-300 font-bold">No Frozen Price Snapshot Available</AlertTitle>
          <AlertDescription className="text-amber-200/90 text-sm">
            This pool does not have an active frozen price snapshot yet. Price snapshots are automatically frozen once
            the wholesale MOQ target is reached.
          </AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate(`/group-buys/${poolId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Return to Pool Details
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-6" data-testid="pool-approval-page">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(`/group-buys/${poolId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Review Final Price & Approve</h1>
              <Badge variant="pool">Snapshot v{snapshotVersion}</Badge>
            </div>
            <p className="text-xs text-midnight-muted mt-0.5">
              Pool:{' '}
              <span className="text-slate-300 font-medium">
                {pool.title || pool.productId?.canonicalName || 'Group Buy'}
              </span>{' '}
              • Frozen On:{' '}
              <span className="text-slate-300 font-mono font-medium">
                {snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'Recent'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="font-mono text-xs">
            {pool.state}
          </Badge>
        </div>
      </div>

      {/* ── Status Alerts ── */}

      {/* Invalidated Approval Warning (Requirement E) */}
      {isInvalidated && (
        <Alert variant="warning" className="border-amber-500/60 bg-amber-950/40" data-testid="invalidated-warning-banner">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <AlertTitle className="text-amber-300 font-bold">
            Previous Approval Invalidated by Price / Terms Change
          </AlertTitle>
          <AlertDescription className="text-amber-200/90 text-sm space-y-1">
            <p>
              You previously approved an earlier version of the price breakdown for this pool. However, a material change
              occurred (such as an updated wholesale rate, final shipping quote, or revised volume tier).
            </p>
            <p className="font-semibold text-amber-100">
              Your previous approval is no longer valid. You must review the updated cost breakdown below and explicitly
              approve Snapshot v{snapshotVersion} to confirm your order.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Superseded Warning */}
      {isSuperseded && (
        <Alert variant="destructive" className="border-rose-500/50 bg-rose-950/30" data-testid="superseded-warning-banner">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
          <AlertTitle className="text-rose-300 font-bold">Price Snapshot Superseded</AlertTitle>
          <AlertDescription className="text-rose-200/90 text-sm">
            This price snapshot (v{snapshotVersion}) has been superseded by a newer version. It cannot be approved.
            Please return to the pool details page to access the latest price breakdown.
          </AlertDescription>
        </Alert>
      )}

      {/* Already Approved Success Banner */}
      {isAlreadyApproved && (
        <Alert variant="success" className="border-emerald-500/40 bg-emerald-950/20" data-testid="approved-success-banner">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <AlertTitle className="text-emerald-300 font-bold">
            Cost Breakdown Approved (Snapshot v{snapshotVersion})
          </AlertTitle>
          <AlertDescription className="text-emerald-200/90 text-sm">
            Your shop has explicitly approved this frozen cost breakdown
            {myContribution?.approvedAt ? ` on ${new Date(myContribution.approvedAt).toLocaleString()}` : ''}. When all
            pool participants have completed approval, the pool will transition to final supplier order execution.
          </AlertDescription>
        </Alert>
      )}

      {/* Missing Member Share Guard */}
      {!matchingMemberShare && (
        <Alert variant="destructive" className="border-rose-500/50 bg-rose-950/30" data-testid="missing-share-error">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
          <AlertTitle className="text-rose-300 font-bold">No Participant Share in This Snapshot</AlertTitle>
          <AlertDescription className="text-rose-200/90 text-sm">
            We could not locate an allocated share for your shop in this frozen price snapshot. If you recently joined or
            withdrew, the snapshot may not reflect your current participation.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Section B: Frozen Snapshot Details (Group Bulk Terms) ── */}
      <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Frozen Price Snapshot Specifications (v{snapshotVersion})
            </h2>
          </div>
          <span className="text-xs font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
            Authoritative Frozen Record
          </span>
        </div>

        <p className="text-xs text-midnight-muted leading-relaxed">
          The figures below are locked in Snapshot v{snapshotVersion} created on{' '}
          <span className="text-slate-300 font-mono">
            {snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'N/A'}
          </span>
          . Approval applies strictly to these frozen figures; live pool estimates are never substituted.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs pt-2">
          <div className="space-y-1 p-3 rounded-lg bg-midnight-surface/50 border border-midnight-border/50">
            <span className="text-midnight-muted block">Total Pooled Quantity</span>
            <span className="font-mono font-bold text-white text-sm">
              {snapshot.totalEligibleQuantity}{' '}
              <span className="text-xs text-midnight-muted">{matchingMemberShare?.unit || pool.packUnit || 'units'}</span>
            </span>
          </div>

          <div className="space-y-1 p-3 rounded-lg bg-midnight-surface/50 border border-midnight-border/50">
            <span className="text-midnight-muted block">Applied Unit Price</span>
            <span className="font-mono font-bold text-teal-300 text-sm">
              {formatMinorToMajor(snapshot.appliedUnitPriceMinor, currency)}
            </span>
          </div>

          <div className="space-y-1 p-3 rounded-lg bg-midnight-surface/50 border border-midnight-border/50">
            <span className="text-midnight-muted block">Base Unit Price</span>
            <span className="font-mono text-slate-300 text-sm">
              {formatMinorToMajor(snapshot.baseUnitPriceMinor, currency)}
            </span>
          </div>

          <div className="space-y-1 p-3 rounded-lg bg-midnight-surface/50 border border-midnight-border/50">
            <span className="text-midnight-muted block">Group Merchandise Total</span>
            <span className="font-mono font-bold text-white text-sm">
              {formatMinorToMajor(snapshot.merchandiseTotalMinor, currency)}
            </span>
          </div>

          <div className="space-y-1 p-3 rounded-lg bg-midnight-surface/50 border border-midnight-border/50">
            <span className="text-midnight-muted block">Shipping Cost & Status</span>
            <span className="font-mono text-white">
              {snapshot.shippingCostMinor != null
                ? formatMinorToMajor(snapshot.shippingCostMinor, currency)
                : 'Not available in this snapshot'}
            </span>
            <span className="block text-[11px] text-midnight-muted">
              Status: {snapshot.shippingStatus || 'Not available in this snapshot'}
            </span>
          </div>

          <div className="space-y-1 p-3 rounded-lg bg-midnight-surface/50 border border-midnight-border/50">
            <span className="text-midnight-muted block">Shipping Allocation</span>
            <span className="font-mono text-white">
              {snapshot.shippingAllocationMethod || 'Not available in this snapshot'}
            </span>
          </div>

          <div className="space-y-1 p-3 rounded-lg bg-midnight-surface/50 border border-midnight-border/50">
            <span className="text-midnight-muted block">Tax Terms</span>
            <span className="font-mono text-white">{snapshot.taxInclusion || 'Not available in this snapshot'}</span>
          </div>

          <div className="space-y-1 p-3 rounded-lg bg-midnight-surface/50 border border-midnight-border/50">
            <span className="text-midnight-muted block">Group Total Payable</span>
            <span className="font-mono font-bold text-white text-sm">
              {formatMinorToMajor(snapshot.groupTotalPayableMinor, currency)}
            </span>
          </div>
        </div>

        {/* Supplementary Supplier Terms (Explicitly marked if unavailable) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-midnight-border/50">
          <div className="p-2.5 rounded bg-midnight-surface/30">
            <span className="text-midnight-muted block mb-0.5">Supplier Offer Terms:</span>
            <span className="text-slate-300 font-medium">
              {snapshot.supplierTerms || pool.supplierTerms || 'Not available in this snapshot'}
            </span>
          </div>
          <div className="p-2.5 rounded bg-midnight-surface/30">
            <span className="text-midnight-muted block mb-0.5">Quote Validity:</span>
            <span className="text-slate-300 font-medium">
              {snapshot.quoteValidity || pool.quoteValidity || 'Not available in this snapshot'}
            </span>
          </div>
          <div className="p-2.5 rounded bg-midnight-surface/30">
            <span className="text-midnight-muted block mb-0.5">Cancellation Policy:</span>
            <span className="text-slate-300 font-medium">
              {snapshot.cancellationPolicy || pool.cancellationPolicy || 'Not available in this snapshot'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Section C: Participant-Specific Price Breakdown Ledger ── */}
      {matchingMemberShare && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-teal-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Your Itemized Final Allocation (Snapshot v{snapshotVersion})
              </h2>
            </div>
            <span className="text-xs text-midnight-muted">
              Committed:{' '}
              <strong className="text-white font-mono">
                {matchingMemberShare.quantity} {matchingMemberShare.unit}
              </strong>
            </span>
          </div>

          <PriceBreakdownLedger
            contribution={matchingMemberShare}
            quantity={matchingMemberShare.quantity}
            unit={matchingMemberShare.unit}
            unitPriceMinor={matchingMemberShare.appliedUnitPriceMinor}
            merchandiseShareMinor={matchingMemberShare.merchandiseShareMinor}
            shippingShareMinor={matchingMemberShare.shippingShareMinor}
            roundingAdjustmentMinor={matchingMemberShare.roundingAdjustmentMinor}
            totalPayableMinor={matchingMemberShare.totalPayableMinor}
            verifiedSavingsMinor={matchingMemberShare.verifiedSavingsMinor}
            currency={currency}
            shippingAllocationMethod={snapshot.shippingAllocationMethod || 'PER_UNIT'}
            shippingStatus={snapshot.shippingStatus || 'KNOWN'}
            snapshotVersion={snapshotVersion}
          />
        </div>
      )}

      {/* ── Section D: Payment Reconciliation ── */}
      {reconciliation && !reconciliation.isInvalid && (
        <div
          className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl"
          data-testid="payment-reconciliation-card"
        >
          <div className="flex items-center gap-2 border-b border-midnight-border/70 pb-3">
            <Coins className="h-4 w-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Payment Reconciliation & Settlement
              </h2>
              <p className="text-xs text-midnight-muted">
                Reconciling your initial payment at join against the frozen final payable amount
              </p>
            </div>
          </div>

          {/* Ledger Comparison Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-lg bg-midnight-surface/50 border border-midnight-border/70 space-y-1">
              <span className="text-midnight-muted block font-medium">Initial Amount Paid at Join:</span>
              <span className="font-mono font-bold text-white text-base" data-testid="reconciliation-total-paid">
                {formatMinorToMajor(reconciliation.totalPaidMinor, currency)}
              </span>
              <span className="text-[11px] text-midnight-muted block">
                Recorded via PayPal Sandbox checkout ledger
              </span>
            </div>

            <div className="p-4 rounded-lg bg-midnight-surface/50 border border-midnight-border/70 space-y-1">
              <span className="text-midnight-muted block font-medium">
                Final Frozen Payable (Snapshot v{snapshotVersion}):
              </span>
              <span className="font-mono font-bold text-teal-300 text-base" data-testid="reconciliation-final-payable">
                {formatMinorToMajor(reconciliation.snapshotTotalPayableMinor, currency)}
              </span>
              <span className="text-[11px] text-midnight-muted block">
                Landed cost share inclusive of verified bulk tiers
              </span>
            </div>
          </div>

          {/* Case 1: Tier Savings / Refund Due */}
          {reconciliation.isRefundDue && (
            <div
              className="p-4 rounded-lg border border-teal-500/40 bg-teal-950/20 space-y-2 text-xs"
              data-testid="reconciliation-refund-box"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-teal-300 text-sm flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-teal-400" />
                  Tier-Savings Refund / Credit Due:
                </span>
                <span className="font-mono font-extrabold text-teal-200 text-base tabular-nums">
                  {formatMinorToMajor(reconciliation.refundDueMinor, currency)}
                </span>
              </div>
              <p className="text-teal-200/90 leading-relaxed">
                Bulk demand reached a higher volume tier, reducing your per-unit cost. Because your initial payment of{' '}
                <strong className="text-white">{formatMinorToMajor(reconciliation.totalPaidMinor, currency)}</strong> exceeded
                the final frozen payable of{' '}
                <strong className="text-white">
                  {formatMinorToMajor(reconciliation.snapshotTotalPayableMinor, currency)}
                </strong>
                , you are entitled to a refund of{' '}
                <strong className="text-teal-200">{formatMinorToMajor(reconciliation.refundDueMinor, currency)}</strong>.
              </p>
              <div className="pt-1 flex items-start gap-1.5 text-[11px] text-teal-300/80">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  The refund will be issued to your original payment method via the automated refunds engine after order
                  finalization. Approval confirms your agreement to this breakdown; the refund is not processed immediately
                  upon clicking approve.
                </span>
              </div>
              {matchingMemberShare.verifiedSavingsMinor > 0 && (
                <div className="pt-1 text-[11px] text-teal-300 font-mono">
                  Verified Bulk Savings vs Baseline Offer: {formatMinorToMajor(matchingMemberShare.verifiedSavingsMinor, currency)}
                </div>
              )}
            </div>
          )}

          {/* Case 2: Additional Balance Due */}
          {reconciliation.isAdditionalDue && (
            <div
              className="p-4 rounded-lg border border-amber-500/40 bg-amber-950/20 space-y-2 text-xs"
              data-testid="reconciliation-additional-box"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300 text-sm flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Additional Balance Outstanding:
                </span>
                <span className="font-mono font-extrabold text-amber-200 text-base tabular-nums">
                  {formatMinorToMajor(reconciliation.additionalDueMinor, currency)}
                </span>
              </div>
              <p className="text-amber-200/90 leading-relaxed">
                Your final allocated total ({formatMinorToMajor(reconciliation.snapshotTotalPayableMinor, currency)})
                exceeds your initial payment ({formatMinorToMajor(reconciliation.totalPaidMinor, currency)}) due to
                finalized shipping allocation or quantity adjustments.
              </p>
              <p className="text-[11px] text-amber-300/80">
                The remaining balance of {formatMinorToMajor(reconciliation.additionalDueMinor, currency)} will be payable
                through the standard PayPal Sandbox payment flow once all member approvals are collected.
              </p>
            </div>
          )}

          {/* Case 3: Fully Settled */}
          {reconciliation.isFullySettled && (
            <div
              className="p-4 rounded-lg border border-slate-700/60 bg-midnight-surface/40 space-y-1 text-xs"
              data-testid="reconciliation-settled-box"
            >
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-teal-400" />
                Account Fully Settled
              </div>
              <p className="text-midnight-muted">
                Your initial payment of {formatMinorToMajor(reconciliation.totalPaidMinor, currency)} matches your final
                frozen payable amount. No additional balance is required, and no refund is due.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Section F: Explicit Approval Action ── */}
      <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-midnight-emerald" />
              Explicit Cost Breakdown Confirmation
            </h3>
            <p className="text-xs text-midnight-muted max-w-xl">
              By confirming, you explicitly approve the itemized pricing, applied bulk tier, and allocation rules
              defined in Snapshot v{snapshotVersion}. This constitutes your binding consent for group order placement.
            </p>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full sm:w-auto font-semibold px-6 py-3 whitespace-nowrap"
            disabled={!canApprove}
            onClick={handleApprove}
            data-testid="explicit-approval-btn"
          >
            {isAlreadyApproved
              ? `Snapshot v${snapshotVersion} Already Approved`
              : isSuperseded
              ? `Snapshot v${snapshotVersion} Superseded`
              : `I Review and Approve Final Cost Breakdown (Snapshot v${snapshotVersion})`}
          </Button>
        </div>

        {!canApprove && !isAlreadyApproved && !isSuperseded && user?.role !== 'SHOP_OWNER' && (
          <p className="text-xs text-amber-400">
            Only authorized shop owners can submit formal approval for this group-buy pool.
          </p>
        )}
      </div>
    </div>
  );
}

export default PoolApprovalPage;
