/**
 * CoBuy AI — 24-Hour Under-MOQ Buyer Decision Page (SUJ-05)
 *
 * Route: /group-buys/:poolId/decision
 *
 * Provides participating buyers with a dedicated decision interface when a 72-hour
 * pool closes below the wholesale Minimum Order Quantity (MOQ_W):
 *  - Enforces the strict platform legal rule: "Silence is not consent"
 *  - Live 24-hour countdown timer synced with pool.decisionDeadline
 *  - Achieved volume vs. target MOQ metrics and exact shortfall
 *  - Full wholesaler feasibility statuses (AWAITING_SUPPLIER, ACCEPTED_SUB_MOQ, REVISED_QUOTE_PROVIDED, REJECTED_SUB_MOQ)
 *  - Baseline vs. revised unit pricing & shipping shares (strictly when source data exists)
 *  - Grounded AI Under-MOQ advisory from pool.aiUnderMoqRecommendation
 *  - Explicit voting actions: PROCEED or CANCEL (with confirmation dialog & full refund workflow)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  ShieldCheck,
  Scale,
  Receipt,
  Info,
  HelpCircle,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import { fetchPoolById, submitUnderMoqDecision } from '@/api/pools.api';

import { CountdownTimer } from '@/components/common/CountdownTimer';
import { Button } from '@/components/ui/Button';
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
} from '@/components/ui/Dialog';

export function UnderMOQDecisionPage() {
  const { poolId } = useParams();
  const navigate = useNavigate();
  const { user, shop } = useAuth();
  const { notify } = useNotifications();

  // Primary Data State
  const [pool, setPool] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDeadlineExpired, setIsDeadlineExpired] = useState(false);

  // Decision Modal & Submission State
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState(null); // 'PROCEED' | 'CANCEL'
  const [actionLoading, setActionLoading] = useState(false);

  // Load pool & participant contributions
  const loadData = useCallback(async () => {
    if (!poolId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPoolById(poolId);
      const fetchedPool = data?.pool || null;
      setPool(fetchedPool);
      setContributions(Array.isArray(data?.contributions) ? data.contributions : []);
      if (fetchedPool?.decisionDeadline) {
        setIsDeadlineExpired(new Date(fetchedPool.decisionDeadline).getTime() <= Date.now());
      }
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || 'Failed to load under-MOQ decision data.'
      );
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Identify buyer's contribution using standard shop ID matching (excluding WITHDRAWN)
  const myContribution = useMemo(() => {
    if (!contributions || (!shop && !user)) return null;
    const targetShopId = String(shop?._id || user?.shopId || '');
    return (
      contributions.find(
        (c) =>
          String(c.shopId?._id || c.shopId || '') === targetShopId &&
          c.state !== 'WITHDRAWN' &&
          c.status !== 'WITHDRAWN'
      ) || null
    );
  }, [contributions, shop, user]);

  // 24-hour decision deadline & expiry callback
  const decisionDeadline = pool?.decisionDeadline || null;
  const handleExpire = useCallback(() => {
    setIsDeadlineExpired(true);
    loadData();
  }, [loadData]);

  // Target metrics & shortfall
  const targetMoq = Number(pool?.targetMoq || 0);
  const achievedQuantity = Number(pool?.totalEligibleQuantity || 0);
  const shortfall = Math.max(0, targetMoq - achievedQuantity);
  const packUnit = pool?.packUnit || 'UNIT';
  const currency = pool?.currency || 'INR';
  const achievementPct =
    targetMoq > 0 ? Math.min(100, Math.round((achievedQuantity / targetMoq) * 100)) : 0;

  // Supplier feasibility status handling (AWAITING_SUPPLIER, ACCEPTED_SUB_MOQ, REVISED_QUOTE_PROVIDED, REJECTED_SUB_MOQ)
  const rawSupplierStatus =
    pool?.supplierFeasibilityStatus || pool?.supplierUnderMoqStatus || 'NOT_APPLICABLE';

  const supplierStatusConfig = useMemo(() => {
    switch (rawSupplierStatus) {
      case 'ACCEPTED_SUB_MOQ':
        return {
          variant: 'success',
          label: 'Accepted Sub-MOQ',
          title: 'Wholesaler Accepted Under-MOQ Fulfillment',
          description:
            'The wholesaler has agreed to fulfill the pooled volume without requiring MOQ price penalties.',
        };
      case 'REVISED_QUOTE_PROVIDED':
        return {
          variant: 'pool',
          label: 'Revised Quote Provided',
          title: 'Wholesaler Issued Revised Terms',
          description:
            'The wholesaler provided updated per-unit pricing or shipping terms for this sub-MOQ batch.',
        };
      case 'REJECTED_SUB_MOQ':
        return {
          variant: 'error',
          label: 'Rejected Sub-MOQ',
          title: 'Wholesaler Declined Under-MOQ Fulfillment',
          description:
            'The wholesaler declined to fulfill below target MOQ. The pool cannot proceed under original terms.',
        };
      case 'AWAITING_SUPPLIER':
        return {
          variant: 'warning',
          label: 'Awaiting Supplier Response',
          title: 'Wholesaler Evaluation In Progress',
          description:
            'The wholesaler has been notified of the order volume and is reviewing whether to fulfill at sub-MOQ or offer a revised quote.',
        };
      default:
        return {
          variant: 'neutral',
          label: 'Pending Evaluation',
          title: 'Supplier Feasibility Pending',
          description: 'Supplier feasibility evaluation is pending or not applicable.',
        };
    }
  }, [rawSupplierStatus]);

  // Current baseline pricing vs. Revised pricing (only displayed when actual source data exists)
  const currentUnitPriceMinor = pool?.currentUnitPriceMinor ?? pool?.baseUnitPriceMinor ?? null;
  const currentShippingCostMinor = pool?.shippingCostMinor ?? null;

  const revisedUnitPriceMinor =
    pool?.revisedUnitPriceMinor ??
    pool?.revisedQuote?.unitPriceMinor ??
    pool?.aiUnderMoqRecommendation?.supportingFigures?.revisedUnitPriceMinor ??
    null;

  const revisedShippingCostMinor =
    pool?.revisedShippingCostMinor ??
    pool?.revisedQuote?.shippingCostMinor ??
    pool?.aiUnderMoqRecommendation?.supportingFigures?.revisedShippingCostMinor ??
    null;

  const hasRevisedPricing = revisedUnitPriceMinor !== null || revisedShippingCostMinor !== null;

  // AI Under-MOQ Advisory
  const aiRecommendation = pool?.aiUnderMoqRecommendation || null;
  const suggestedAction = aiRecommendation?.suggestedAction || null;
  const aiExplanation = aiRecommendation?.explanation || null;
  const supportingFigures = aiRecommendation?.supportingFigures || null;
  const uncertainties = Array.isArray(aiRecommendation?.uncertainties)
    ? aiRecommendation.uncertainties
    : [];

  // Check if buyer has already submitted a decision
  const existingDecision = myContribution?.underMoqDecision;
  const hasAlreadyDecided =
    existingDecision === 'PROCEED' || existingDecision === 'CANCEL';

  // Initiate confirmation dialog
  const handleInitiateDecision = (decision) => {
    setPendingDecision(decision);
    setConfirmDialogOpen(true);
  };

  // Submit confirmed decision
  const handleConfirmDecision = async () => {
    if (!pendingDecision) return;
    try {
      setActionLoading(true);
      await submitUnderMoqDecision(poolId, pendingDecision);
      notify?.(
        pendingDecision === 'PROCEED'
          ? 'Decision recorded: You confirmed to proceed with the order.'
          : 'Decision recorded: Participation cancelled. Full refund has been initiated.',
        'success'
      );
      setConfirmDialogOpen(false);
      setPendingDecision(null);
      await loadData();
    } catch (err) {
      notify?.(
        err?.response?.data?.message || err?.message || 'Failed to submit under-MOQ decision.',
        'error'
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ── Loading Skeleton State ──
  if (loading) {
    return (
      <div className="min-h-screen bg-midnight-bg text-midnight-text py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-9 w-44 rounded-lg bg-midnight-surface" />
          <Skeleton className="h-20 w-full rounded-xl bg-midnight-surface" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-64 md:col-span-2 rounded-xl bg-midnight-surface" />
            <Skeleton className="h-64 rounded-xl bg-midnight-surface" />
          </div>
          <Skeleton className="h-56 w-full rounded-xl bg-midnight-surface" />
        </div>
      </div>
    );
  }

  // ── Error State / Missing Pool ──
  if (error || !pool) {
    return (
      <div className="min-h-screen bg-midnight-bg text-midnight-text py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto space-y-6 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/group-buys')}
            className="text-midnight-muted hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Marketplace
          </Button>

          <Alert variant="error" className="text-left">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <AlertTitle className="text-rose-300 font-bold">Unable to Load Under-MOQ Decision</AlertTitle>
            <AlertDescription className="text-rose-200/90 text-sm mt-1">
              {error || 'The requested group-buy pool could not be found or has not entered under-MOQ decision phase.'}
            </AlertDescription>
          </Alert>

          <Button variant="outline" onClick={loadData}>
            Retry Loading
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight-bg text-midnight-text py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation Back */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/group-buys/${poolId}`)}
            className="text-midnight-muted hover:text-white -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pool Details
          </Button>
          <Badge variant="outline" className="font-mono text-xs">
            Pool #{poolId.slice(-6).toUpperCase()}
          </Badge>
        </div>

        {/* ── 1. Prominent Legal Warning: "Silence is not consent" ── */}
        <Alert variant="warning" className="border-amber-500/50 bg-amber-950/30 text-amber-200 shadow-xl">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <AlertTitle className="text-amber-300 font-bold tracking-wide flex items-center gap-2">
            <span>Silence is not consent.</span>
          </AlertTitle>
          <AlertDescription className="text-amber-200/90 text-sm mt-1 font-medium">
            Silence is not consent. Failure to respond within 24 hours results in automatic cancellation/refund according to backend rules.
          </AlertDescription>
        </Alert>

        {/* ── 2. Header & Live Countdown Card ── */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-midnight-border/70 pb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="warning">UNDER-MOQ DECISION</Badge>
                <Badge variant="outline">{pool.state}</Badge>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                24-Hour Under-MOQ Buyer Decision
              </h1>
              <p className="text-sm text-midnight-muted mt-1">
                {pool.title || pool.productId?.canonicalName || 'Wholesale Group Buy'}
              </p>
            </div>

            {decisionDeadline && (
              <div className="flex flex-col items-start md:items-end">
                <CountdownTimer
                  deadline={decisionDeadline}
                  label="Decision Window Remaining"
                  variant="badge"
                  onExpire={handleExpire}
                />
                {isDeadlineExpired && (
                  <span className="text-xs text-rose-400 font-medium mt-1">
                    Decision window has expired
                  </span>
                )}
              </div>
            )}
          </div>

          {/* User Participation Context */}
          {myContribution ? (
            <div className="flex flex-wrap items-center justify-between gap-4 bg-midnight-surface/80 rounded-lg p-4 border border-midnight-border/60">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-midnight-emerald/10 border border-midnight-emerald/30 flex items-center justify-center text-midnight-emerald">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-midnight-muted uppercase tracking-wider">Your Active Share</div>
                  <div className="text-sm font-bold text-white">
                    {myContribution.quantity} {packUnit} • Total Paid:{' '}
                    <span className="text-teal-300 font-mono">
                      {formatMinorToMajor(
                        myContribution.totalPaidMinor ||
                          myContribution.quantity * (currentUnitPriceMinor || 0),
                        currency
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {hasAlreadyDecided ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-midnight-muted">Your Vote:</span>
                  <Badge variant={existingDecision === 'PROCEED' ? 'success' : 'error'}>
                    {existingDecision === 'PROCEED' ? 'VOTED: PROCEED' : 'VOTED: CANCELLED'}
                  </Badge>
                </div>
              ) : (
                <Badge variant="warning">VOTE REQUIRED</Badge>
              )}
            </div>
          ) : (
            <Alert variant="info" className="bg-cyan-950/20 border-cyan-500/30">
              <Info className="h-4 w-4 text-cyan-400" />
              <AlertDescription className="text-xs text-cyan-200">
                You do not have an active contribution in this pool. Only participating shop owners may submit decisions.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* ── 3. Volume Metrics & Shortfall + Supplier Feasibility Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Volume & Shortfall Card */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Scale className="h-4 w-4 text-teal-400" />
              Volume Achieved & Shortfall
            </h2>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5 font-medium">
                  <span className="text-midnight-muted">Wholesale Target MOQ:</span>
                  <span className="font-mono text-white font-bold">{targetMoq} {packUnit}</span>
                </div>
                <div className="flex justify-between text-xs mb-1.5 font-medium">
                  <span className="text-midnight-muted">Pooled Volume Achieved:</span>
                  <span className="font-mono text-teal-300 font-bold">{achievedQuantity} {packUnit}</span>
                </div>
                <div className="w-full bg-midnight-surface rounded-full h-2.5 overflow-hidden border border-midnight-border">
                  <div
                    className="bg-amber-400 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${achievementPct}%` }}
                  />
                </div>
                <div className="text-right text-[11px] text-amber-300/80 font-mono mt-1">
                  {achievementPct}% of wholesale threshold
                </div>
              </div>

              <div className="p-3 bg-midnight-surface rounded-lg border border-midnight-border/70 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Exact Shortfall:</span>
                <span className="font-mono font-bold text-amber-400 text-sm">
                  {shortfall} {packUnit}
                </span>
              </div>
            </div>
          </div>

          {/* Supplier Feasibility Status Card */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-400" />
              Supplier Feasibility Status
            </h2>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={supplierStatusConfig.variant} className="text-xs font-bold py-1 px-3">
                  {supplierStatusConfig.label}
                </Badge>
              </div>

              <div className="p-3.5 bg-midnight-surface rounded-lg border border-midnight-border/70 space-y-1">
                <div className="text-xs font-semibold text-white">
                  {supplierStatusConfig.title}
                </div>
                <p className="text-xs text-midnight-muted leading-relaxed">
                  {supplierStatusConfig.description}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. Unit Cost & Shipping Breakdown (Source Grounded) ── */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-teal-400" />
              Commercial Pricing Comparison
            </span>
            {hasRevisedPricing && <Badge variant="pool">Revised Quote Available</Badge>}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Current Baseline Terms */}
            <div className="p-4 rounded-lg bg-midnight-surface border border-midnight-border space-y-2">
              <div className="text-xs font-bold text-white uppercase tracking-wider border-b border-midnight-border pb-2">
                Baseline (Original) Terms
              </div>
              <div className="flex justify-between text-xs py-1">
                <span className="text-midnight-muted">Unit Cost:</span>
                <span className="font-mono text-white font-medium">
                  {currentUnitPriceMinor !== null
                    ? `${formatMinorToMajor(currentUnitPriceMinor, currency)} / ${packUnit}`
                    : 'Not specified'}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1">
                <span className="text-midnight-muted">Pool Shipping Total:</span>
                <span className="font-mono text-white font-medium">
                  {currentShippingCostMinor !== null
                    ? formatMinorToMajor(currentShippingCostMinor, currency)
                    : 'Included / Free'}
                </span>
              </div>
              {myContribution && currentUnitPriceMinor !== null && (
                <div className="flex justify-between text-xs py-1 border-t border-midnight-border/60 pt-2">
                  <span className="text-midnight-muted">Your Merchandise Share:</span>
                  <span className="font-mono text-teal-300 font-bold">
                    {formatMinorToMajor(myContribution.quantity * currentUnitPriceMinor, currency)}
                  </span>
                </div>
              )}
            </div>

            {/* Revised Terms (Only rendered when source data exists) */}
            <div className="p-4 rounded-lg bg-midnight-surface border border-midnight-border space-y-2">
              <div className="text-xs font-bold text-white uppercase tracking-wider border-b border-midnight-border pb-2 flex items-center justify-between">
                <span>Revised Sub-MOQ Terms</span>
                {!hasRevisedPricing && (
                  <span className="text-[10px] text-midnight-muted font-normal lowercase">none provided</span>
                )}
              </div>

              {hasRevisedPricing ? (
                <>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-midnight-muted">Revised Unit Cost:</span>
                    <span className="font-mono text-teal-300 font-bold">
                      {revisedUnitPriceMinor !== null
                        ? `${formatMinorToMajor(revisedUnitPriceMinor, currency)} / ${packUnit}`
                        : `${formatMinorToMajor(currentUnitPriceMinor, currency)} / ${packUnit}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-midnight-muted">Revised Shipping Total:</span>
                    <span className="font-mono text-white font-medium">
                      {revisedShippingCostMinor !== null
                        ? formatMinorToMajor(revisedShippingCostMinor, currency)
                        : formatMinorToMajor(currentShippingCostMinor || 0, currency)}
                    </span>
                  </div>
                  {myContribution && (
                    <div className="flex justify-between text-xs py-1 border-t border-midnight-border/60 pt-2">
                      <span className="text-midnight-muted">Your Revised Merchandise:</span>
                      <span className="font-mono text-teal-300 font-bold">
                        {formatMinorToMajor(
                          myContribution.quantity * (revisedUnitPriceMinor ?? currentUnitPriceMinor ?? 0),
                          currency
                        )}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-midnight-muted py-3 flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-midnight-muted flex-shrink-0" />
                  <span>
                    No revised quote required or submitted. The wholesaler has not issued alternative per-unit or shipping rates.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 5. AI Under-MOQ Advisory Card (pool.aiUnderMoqRecommendation) ── */}
        {aiRecommendation && (
          <div className="rounded-xl border border-teal-500/30 bg-teal-950/10 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-teal-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  AI Under-MOQ Advisory & Recommendation
                </h2>
              </div>
              {suggestedAction && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-midnight-muted">Suggested Action:</span>
                  <Badge
                    variant={
                      suggestedAction === 'PROCEED'
                        ? 'success'
                        : suggestedAction === 'CANCEL'
                        ? 'error'
                        : 'warning'
                    }
                  >
                    {suggestedAction}
                  </Badge>
                </div>
              )}
            </div>

            {aiExplanation && (
              <p className="text-sm text-slate-200 leading-relaxed font-normal">
                {aiExplanation}
              </p>
            )}

            {/* Supporting Figures Grid */}
            {supportingFigures && typeof supportingFigures === 'object' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-midnight-surface/70 border border-midnight-border text-center">
                  <div className="text-[10px] text-midnight-muted uppercase">Achieved</div>
                  <div className="text-sm font-mono font-bold text-white mt-0.5">
                    {supportingFigures.achievedQuantity ?? achievedQuantity} {packUnit}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-midnight-surface/70 border border-midnight-border text-center">
                  <div className="text-[10px] text-midnight-muted uppercase">Target MOQ</div>
                  <div className="text-sm font-mono font-bold text-white mt-0.5">
                    {supportingFigures.targetMoq ?? targetMoq} {packUnit}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-midnight-surface/70 border border-midnight-border text-center">
                  <div className="text-[10px] text-midnight-muted uppercase">Shortfall</div>
                  <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">
                    {supportingFigures.shortfall ?? shortfall} {packUnit}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-midnight-surface/70 border border-midnight-border text-center">
                  <div className="text-[10px] text-midnight-muted uppercase">Achievement</div>
                  <div className="text-sm font-mono font-bold text-teal-300 mt-0.5">
                    {supportingFigures.achievementPercentage ?? achievementPct}%
                  </div>
                </div>
              </div>
            )}

            {/* Commercial Uncertainties / Risks */}
            {uncertainties.length > 0 && (
              <div className="pt-2 border-t border-teal-500/20">
                <div className="text-xs font-semibold text-teal-300 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  Key Commercial Uncertainties & Considerations:
                </div>
                <ul className="list-disc list-inside space-y-1 text-xs text-slate-300 pl-1">
                  {uncertainties.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── 6. Explicit Decision Actions Card ── */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-midnight-border/70 pb-3">
            <div>
              <h2 className="text-base font-bold text-white">Your Explicit Vote</h2>
              <p className="text-xs text-midnight-muted mt-0.5">
                Every participating buyer must explicitly choose to proceed or cancel.
              </p>
            </div>
            {isDeadlineExpired && (
              <Badge variant="error">DECISION WINDOW EXPIRED</Badge>
            )}
          </div>

          {hasAlreadyDecided ? (
            <div className="p-4 rounded-lg bg-midnight-surface border border-midnight-border flex items-center gap-3">
              {existingDecision === 'PROCEED' ? (
                <CheckCircle2 className="h-6 w-6 text-midnight-emerald flex-shrink-0" />
              ) : (
                <XCircle className="h-6 w-6 text-rose-400 flex-shrink-0" />
              )}
              <div>
                <div className="text-sm font-bold text-white">
                  Decision Already Submitted: {existingDecision}
                </div>
                <p className="text-xs text-midnight-muted mt-0.5">
                  {existingDecision === 'PROCEED'
                    ? 'You voted to proceed with the sub-MOQ order. If all participants proceed, supplier fulfillment begins.'
                    : 'You voted to cancel your participation. A full 100% refund has been registered to your account.'}
                </p>
              </div>
            </div>
          ) : !myContribution ? (
            <div className="text-center py-4">
              <p className="text-sm text-midnight-muted">
                You do not hold an active contribution in this pool and cannot vote.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* PROCEED Action Option */}
                <div className="rounded-lg border border-teal-500/30 bg-teal-950/10 p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                      <CheckCircle2 className="h-4 w-4" />
                      Option 1: Proceed with Order
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Accept fulfillment for your {myContribution.quantity} {packUnit} share at proposed terms. Your funds remain committed.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    disabled={actionLoading || isDeadlineExpired}
                    onClick={() => handleInitiateDecision('PROCEED')}
                  >
                    Proceed with Order
                  </Button>
                </div>

                {/* CANCEL Action Option */}
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/10 p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                      <XCircle className="h-4 w-4" />
                      Option 2: Cancel & Request Refund
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Decline sub-MOQ terms. Immediately cancel your participation of {myContribution.quantity} {packUnit} and receive a 100% full refund.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full justify-center"
                    disabled={actionLoading || isDeadlineExpired}
                    onClick={() => handleInitiateDecision('CANCEL')}
                  >
                    Cancel & Request Full Refund
                  </Button>
                </div>
              </div>

              {isDeadlineExpired && (
                <Alert variant="error" className="py-2.5">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                  <AlertDescription className="text-xs text-rose-200">
                    The 24-hour decision window has closed. Decisions are locked and automatic handling is in effect.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Confirmation Dialog ── */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md bg-midnight-card border border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              {pendingDecision === 'PROCEED' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-midnight-emerald" />
                  Confirm Proceed with Order
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                  Confirm Cancellation & Full Refund
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-midnight-muted mt-2">
              {pendingDecision === 'PROCEED' ? (
                <span>
                  You are voting to proceed with your order of{' '}
                  <strong className="text-white">
                    {myContribution?.quantity} {packUnit}
                  </strong>
                  . If all participating buyers agree, the wholesaler will be instructed to fulfill this batch.
                </span>
              ) : (
                <span>
                  You are voting to cancel your participation of{' '}
                  <strong className="text-white">
                    {myContribution?.quantity} {packUnit}
                  </strong>
                  . A 100% full refund will be initiated back to your original payment method. This action cannot be undone.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading}
              onClick={() => {
                setConfirmDialogOpen(false);
                setPendingDecision(null);
              }}
            >
              Back
            </Button>
            <Button
              variant={pendingDecision === 'PROCEED' ? 'primary' : 'destructive'}
              size="sm"
              disabled={actionLoading}
              onClick={handleConfirmDecision}
            >
              {actionLoading
                ? 'Recording...'
                : pendingDecision === 'PROCEED'
                ? 'Yes, Proceed with Order'
                : 'Yes, Cancel & Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UnderMOQDecisionPage;
