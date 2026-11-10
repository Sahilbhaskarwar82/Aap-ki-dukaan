/**
 * CoBuy AI — Group-Buy Pool Detail Page (SUJ-03 / SUJ-04 / SUJ-05)
 *
 * Route: /group-buys/:poolId
 *
 * Provides a comprehensive, interactive view of a 72-hour collective buying pool:
 *  - Real-time MOQ target & tier progression (TierProgressBar)
 *  - 72h recruitment countdown & 24h decision deadlines (CountdownTimer)
 *  - Transparent landed cost & savings breakdown (PriceBreakdownLedger)
 *  - Direct Join & Checkout flow with PayPal Sandbox (PayPalCheckoutModal)
 *  - Pre-lock quantity customization & buyer withdrawal
 *  - Versioned PriceSnapshot explicit review & approval (SUJ-04)
 *  - 24h Under-MOQ buyer decision workflow with AI advisory (SUJ-05)
 *  - Participant contributions table & chronological ActivityTimeline
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShoppingBag,
  Edit3,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import {
  fetchPoolById,
  joinPool,
  updateContributionQuantity,
  withdrawContribution,
  approvePriceSnapshot,
  submitUnderMoqDecision,
  fetchConfirmedRequirements,
} from '@/api/pools.api';

import { TierProgressBar } from '@/components/common/TierProgressBar';
import { CountdownTimer } from '@/components/common/CountdownTimer';
import { ProvenanceBadge } from '@/components/common/ProvenanceBadge';
import { PriceBreakdownLedger } from '@/components/common/PriceBreakdownLedger';
import { MOQStepCalculator } from '@/components/common/MOQStepCalculator';
import { ActivityTimeline } from '@/components/common/ActivityTimeline';
import { SandboxDisclosureBanner } from '@/components/common/SandboxDisclosureBanner';
import { PayPalCheckoutModal } from '@/pages/payments/PayPalCheckoutModal';

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

export function GroupBuyDetailPage() {
  const { poolId } = useParams();
  const navigate = useNavigate();
  const { user, shop } = useAuth();
  const { notify } = useNotifications();

  // Primary Data State
  const [pool, setPool] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [userRequirements, setUserRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Join / Checkout State
  const [joinQuantity, setJoinQuantity] = useState(0);
  const [selectedRequirementId, setSelectedRequirementId] = useState('');
  const [acceptSubstitution, setAcceptSubstitution] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [activePaymentContributionId, setActivePaymentContributionId] = useState(null);
  const [paymentPurpose, setPaymentPurpose] = useState('INITIAL_JOIN');
  const [estimatedPayableMinor, setEstimatedPayableMinor] = useState(0);

  // Edit / Withdraw Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editQuantity, setEditQuantity] = useState(0);
  const [previousQuantity, setPreviousQuantity] = useState(null);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('BUYER_WITHDRAWAL');
  const [actionLoading, setActionLoading] = useState(false);
  const initialLoadedRef = useRef(false);

  // Load pool details
  const loadPoolData = useCallback(async () => {
    if (!poolId) return;
    try {
      if (!initialLoadedRef.current) {
        setLoading(true);
      }
      setError(null);
      const data = await fetchPoolById(poolId);
      initialLoadedRef.current = true;
      setPool(data.pool);
      setContributions(data.contributions || []);
      if (data.pool) {
        const moqR = data.pool.minRetailerQuantity || Math.ceil((data.pool.targetMoq || 1) * 0.2);
        setJoinQuantity((prev) => (prev > 0 ? prev : moqR));
      }

      // If retailer, fetch confirmed requirements to allow linking
      if (user?.role === 'SHOP_OWNER') {
        try {
          const reqs = await fetchConfirmedRequirements();
          setUserRequirements(reqs || []);
          if (reqs && reqs.length > 0) {
            setSelectedRequirementId((prev) => prev || reqs[0]._id);
          }
        } catch {
          // Non-critical if requirements fail
        }
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load group-buy pool details.');
    } finally {
      setLoading(false);
    }
  }, [poolId, user?.role]);

  useEffect(() => {
    loadPoolData();
  }, [loadPoolData]);

  // Find current user's contribution if any
  const myContribution = useMemo(() => {
    if (!contributions || !user) return null;
    const myShopId = (shop?._id || user?.shopId)?.toString?.() || null;
    if (!myShopId) return null;
    return contributions.find(
      (c) => {
        const cShopId = (c.shopId?._id || c.shopId)?.toString?.() || null;
        return cShopId === myShopId && c.state !== 'WITHDRAWN';
      }
    ) || null;
  }, [contributions, user, shop]);

  // Mathematical constraints for joining/editing
  const targetMoq = pool?.targetMoq || 1;
  const minRetailerQty = pool?.minRetailerQuantity || Math.ceil(targetMoq * 0.2);
  const stepMultiple = pool?.quantityStepMultiple || Math.max(1, Math.floor(targetMoq * 0.01));
  const currentPriceMinor = pool?.currentUnitPriceMinor || pool?.baseUnitPriceMinor || 0;
  const currency = pool?.currency || 'INR';
  const packUnit = pool?.packUnit || 'UNIT';

  // Initialize joinQuantity once pool data is loaded
  useEffect(() => {
    if (pool?.minRetailerQuantity) {
      setJoinQuantity(pool.minRetailerQuantity);
    } else if (pool?.targetMoq) {
      setJoinQuantity(Math.ceil(pool.targetMoq * 0.2));
    }
  }, [pool?.minRetailerQuantity, pool?.targetMoq]);

  // Handle Join Pool Click
  const handleInitiateJoin = async () => {
    if (joinQuantity < minRetailerQty) {
      notify?.(`Quantity must be at least the buyer minimum of ${minRetailerQty} ${packUnit}.`, 'error');
      return;
    }
    const q = Number(joinQuantity);
    if (!Number.isInteger(q) || q <= 0) {
      notify?.('Please enter a valid positive whole number quantity.', 'error');
      return;
    }
    try {
      setActionLoading(true);
      const payload = {
        quantity: joinQuantity,
        unit: packUnit,
        requirementId: selectedRequirementId || undefined,
        acceptSubstitution,
      };
      const createdContribution = await joinPool(poolId, payload);
      const contribId = createdContribution?._id || createdContribution?.id;
      setActivePaymentContributionId(contribId);
      setPaymentPurpose('INITIAL_JOIN');
      setEstimatedPayableMinor(joinQuantity * currentPriceMinor);
      setCheckoutModalOpen(true);
      await loadPoolData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to initiate pool contribution.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Edit Quantity (Pre-lock)
  const handleSaveEditQuantity = async () => {
    if (!myContribution) return;
    const oldQty = myContribution.quantity;
    if (editQuantity === oldQty) {
      setEditModalOpen(false);
      return;
    }
    try {
      setActionLoading(true);
      await updateContributionQuantity(poolId, myContribution._id, editQuantity);
      setEditModalOpen(false);
      // If quantity increased and delta is due, prompt checkout
      if (editQuantity > oldQty) {
        const deltaQty = editQuantity - oldQty;
        setActivePaymentContributionId(myContribution._id);
        setPaymentPurpose('QUANTITY_INCREASE_DELTA');
        setEstimatedPayableMinor(deltaQty * currentPriceMinor);
        setPreviousQuantity(oldQty);
        setCheckoutModalOpen(true);
        notify?.('Contribution quantity updated. Complete checkout for additional quantity.', 'info');
      } else {
        notify?.('Contribution quantity reduced. Delta refund initiated.', 'success');
      }
      await loadPoolData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to update quantity.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Withdraw (Pre-lock)
  const handleConfirmWithdraw = async () => {
    if (!myContribution) return;
    try {
      setActionLoading(true);
      await withdrawContribution(poolId, myContribution._id, withdrawReason);
      setWithdrawModalOpen(false);
      notify?.('Contribution withdrawn. Full refund initiated.', 'info');
      await loadPoolData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to withdraw.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Snapshot Approval (SUJ-04)
  const handleApproveSnapshotClick = async () => {
    const snapshotId = pool?.latestPriceSnapshotId?._id || pool?.latestPriceSnapshotId;
    if (!snapshotId) return;
    try {
      setActionLoading(true);
      await approvePriceSnapshot(poolId, snapshotId);
      notify?.('Final Price Breakdown (Snapshot) approved!', 'success');
      await loadPoolData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to approve snapshot.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Under-MOQ 24h Decision (SUJ-05)
  const handleUnderMoqDecisionClick = async (decision) => {
    try {
      setActionLoading(true);
      await submitUnderMoqDecision(poolId, decision);
      notify?.(
        decision === 'PROCEED'
          ? 'Confirmed: Proceeding with order.'
          : 'Participation cancelled. Full refund has been initiated.',
        'info'
      );
      await loadPoolData();
    } catch (err) {
      notify?.(err?.response?.data?.message || err?.message || 'Failed to record decision.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="group-buy-detail-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 lg:col-span-2 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Unable to Load Group-Buy Pool</AlertTitle>
          <AlertDescription>{error || 'The requested pool could not be found.'}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate('/group-buys')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Marketplace
        </Button>
      </div>
    );
  }

  const isExpired = pool?.deadline ? new Date(pool.deadline).getTime() <= Date.now() : false;
  const isMoqReached = (pool.totalEligibleQuantity || 0) >= targetMoq;
  const isRecruiting = pool.state === 'RECRUITING' && !isExpired && !isMoqReached;
  const isPoolLocked = !isRecruiting;
  const isAwaitingApprovals = pool.state === 'AWAITING_APPROVALS';
  const isUnderMoqDecision = pool.state === 'UNDER_MOQ_DECISION_PENDING';

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="group-buy-detail-page">
      {/* ── Top Navigation & Title Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/group-buys')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Pools
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">{pool.title}</h1>
              <Badge variant="pool">{pool.state}</Badge>
            </div>
            <p className="text-xs text-midnight-muted mt-0.5">
              {pool.creatorShopName && (
                <span>Published by <span className="text-slate-300 font-medium">{pool.creatorShopName}</span> • </span>
              )}
              Target Area: <span className="text-slate-300 font-medium">{pool.deliveryArea}</span> • Unit:{' '}
              <span className="text-slate-300 font-medium">{packUnit}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {pool.dataSourceType && <ProvenanceBadge type={pool.dataSourceType} />}
          <Badge variant="neutral" className="font-mono text-xs">
            {pool.participantCount || contributions.length} participants
          </Badge>
        </div>
      </div>

      <SandboxDisclosureBanner />

      {/* ── Urgency Alert Banners ── */}
      {isUnderMoqDecision && (
        <Alert variant="warning" className="border-amber-500/50 bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <AlertTitle className="text-amber-300 font-bold">24-Hour Under-MOQ Decision Window Active</AlertTitle>
          <AlertDescription className="text-amber-200/90 text-sm">
            This pool reached its 72-hour recruitment deadline without reaching the Wholesaler MOQ. All participants must
            explicitly choose to proceed or cancel. Non-response is never treated as consent and will automatically cancel
            and fully refund your contribution.
          </AlertDescription>
        </Alert>
      )}

      {isAwaitingApprovals && (
        <Alert variant="warning" className="border-teal-500/50 bg-teal-950/30">
          <CheckCircle2 className="h-5 w-5 text-teal-400" />
          <AlertTitle className="text-teal-300 font-bold">MOQ Target Reached — Price Snapshot Frozen</AlertTitle>
          <AlertDescription className="text-teal-200/90 text-sm">
            Bulk target reached! Final landed pricing has been locked in Snapshot version. Review your itemized cost below
            and click Approve to finalize.
          </AlertDescription>
        </Alert>
      )}

      {isPoolLocked && !isUnderMoqDecision && !isAwaitingApprovals && (
        <Alert variant="warning" className="border-amber-500/50 bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <AlertTitle className="text-amber-300 font-bold">
            {isExpired ? 'Recruitment Deadline Passed' : isMoqReached ? 'Target MOQ Achieved' : 'Group-Buy Pool Locked'}
          </AlertTitle>
          <AlertDescription className="text-amber-200/90 text-sm">
            {isExpired
              ? 'The 72-hour recruitment period has ended. New contributions, edits, and withdrawals are locked.'
              : isMoqReached
              ? 'The pool has achieved its required wholesale volume and is locked into order processing.'
              : `Pool is currently in ${pool.state} status. Modifications are closed.`}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Main Dashboard Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Progression, Tiers & Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Progress & Live Countdown Card */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border/70 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-midnight-emerald" />
                  MOQ Progress & Bulk Tier Progression
                </h2>
                <p className="text-xs text-midnight-muted">
                  Target MOQ: <span className="font-mono font-bold text-white">{targetMoq}</span> {packUnit} • Pooled:{' '}
                  <span className="font-mono font-bold text-teal-300">{pool.totalEligibleQuantity || 0}</span> {packUnit}
                </p>
              </div>

              {(isUnderMoqDecision ? (pool.decisionDeadline || pool.deadline) : pool.deadline) && (
                <CountdownTimer
                  deadline={isUnderMoqDecision ? (pool.decisionDeadline || pool.deadline) : pool.deadline}
                  label={isUnderMoqDecision ? '24h Decision Remaining' : 'Recruitment Remaining'}
                  variant="badge"
                  onExpire={() => {
                    if (pool.state === 'RECRUITING') {
                      loadPoolData();
                    }
                  }}
                />
              )}
            </div>

            <TierProgressBar
              totalEligibleQuantity={pool.totalEligibleQuantity || 0}
              targetMoq={targetMoq}
              tiers={pool.pricingTiers || []}
              baseUnitPriceMinor={pool.baseUnitPriceMinor || currentPriceMinor}
              currency={currency}
              packUnit={packUnit}
            />
          </div>

          {/* 2. Transparent Financial Price Breakdown Ledger */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Landed Pricing & Verified Savings
            </h3>
            <PriceBreakdownLedger
              contribution={myContribution}
              quantity={myContribution?.quantity || joinQuantity || minRetailerQty}
              unit={packUnit}
              unitPriceMinor={currentPriceMinor}
              merchandiseShareMinor={(myContribution?.quantity || joinQuantity || minRetailerQty) * currentPriceMinor}
              shippingShareMinor={pool.shippingCostMinor ? Math.floor(pool.shippingCostMinor / Math.max(1, pool.participantCount || 1)) : 0}
              totalPayableMinor={(myContribution?.quantity || joinQuantity || minRetailerQty) * currentPriceMinor}
              currency={currency}
              snapshotVersion={pool.snapshotVersion || pool.latestPriceSnapshotId?._id || pool.latestPriceSnapshotId}
            />
          </div>

          {/* 3. Under-MOQ 24h Decision Card (SUJ-05) */}
          {isUnderMoqDecision && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <Sparkles className="h-5 w-5 text-amber-400" />
                AI Under-MOQ Advisory & Recommendation
              </div>

              <p className="text-sm text-slate-300 leading-relaxed">
                {pool.underMoqAdvisory?.explanation ||
                  `The pool reached ${pool.totalEligibleQuantity || 0} / ${targetMoq} ${packUnit} (${Math.round(
                    ((pool.totalEligibleQuantity || 0) / targetMoq) * 100
                  )}%). Supplier feasibility is pending or accepted with revised terms.`}
              </p>

              {pool.underMoqAdvisory?.suggestedAction && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-midnight-muted uppercase tracking-wider">Suggested Action:</span>
                  <Badge variant="warning">{pool.underMoqAdvisory.suggestedAction}</Badge>
                </div>
              )}

              {user?.role === 'SHOP_OWNER' && myContribution && (
                <div className="pt-2 flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    disabled={actionLoading}
                    onClick={() => handleUnderMoqDecisionClick('PROCEED')}
                  >
                    Proceed with Order
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={actionLoading}
                    onClick={() => handleUnderMoqDecisionClick('CANCEL')}
                  >
                    Cancel & Request Full Refund
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 4. Participant Contributions List */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>Pool Participants ({contributions.length})</span>
              <span className="text-xs text-midnight-muted font-normal">Anonymized for Kirana Privacy</span>
            </h3>

            <div className="divide-y divide-midnight-border/50">
              {contributions.map((c, idx) => (
                <div key={c._id || idx} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-midnight-muted">#{idx + 1}</span>
                    <span className="text-white font-medium">
                      {c.shopId?.name || `Shop #${(c._id || '').slice(-4)}`}
                    </span>
                    {c.state === 'APPROVED' && <Badge variant="success">Approved</Badge>}
                    {c.state === 'ACTIVE' && <Badge variant="pool">Active</Badge>}
                    {c.state === 'PENDING_PAYMENT' && <Badge variant="warning">Pending Payment</Badge>}
                    {c.state === 'WITHDRAWN' && <Badge variant="neutral">Withdrawn</Badge>}
                  </div>
                  <div className="font-mono text-slate-300">
                    {c.quantity} {packUnit} • {formatMinorToMajor(c.totalPaidMinor || (c.quantity * currentPriceMinor), currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): User Action & Participation Panel */}
        <div className="space-y-6">
          {/* Action Card: Join OR Manage My Contribution */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-5 shadow-xl">
            {myContribution ? (
              /* Already Joined View */
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-midnight-emerald" />
                    My Contribution
                  </h3>
                  <Badge variant="success">{myContribution.state}</Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-midnight-muted">Committed Quantity:</span>
                    <span className="font-mono font-bold text-white">
                      {myContribution.quantity} {packUnit}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-midnight-muted">Total Paid:</span>
                    <span className="font-mono font-bold text-teal-300">
                      {formatMinorToMajor(myContribution.totalPaidMinor || (myContribution.quantity * currentPriceMinor), currency)}
                    </span>
                  </div>
                </div>

                {/* Pending Payment Recovery */}
                {myContribution.state === 'PENDING_PAYMENT' && isRecruiting && (
                  <div className="pt-2">
                    <Alert variant="warning" className="p-3 mb-2 bg-amber-950/30 border-amber-500/30">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <AlertDescription className="text-xs text-amber-200">
                        Your contribution is pending payment. Complete checkout to activate your share.
                      </AlertDescription>
                    </Alert>
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => {
                        setActivePaymentContributionId(myContribution._id);
                        setPaymentPurpose('INITIAL_JOIN');
                        setEstimatedPayableMinor(myContribution.finalTotalPayableMinor || (myContribution.quantity * currentPriceMinor));
                        setCheckoutModalOpen(true);
                      }}
                    >
                      Complete Payment
                    </Button>
                  </div>
                )}

                {/* Pre-Lock Controls */}
                {isRecruiting ? (
                  <div className="pt-3 border-t border-midnight-border/70 space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-center"
                      disabled={actionLoading}
                      onClick={() => {
                        setEditQuantity(myContribution.quantity);
                        setEditModalOpen(true);
                      }}
                    >
                      <Edit3 className="h-4 w-4 mr-2" /> Modify Quantity
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full justify-center"
                      disabled={actionLoading}
                      onClick={() => setWithdrawModalOpen(true)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" /> Withdraw & Refund
                    </Button>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-midnight-border/70 text-center">
                    <p className="text-xs text-midnight-muted">
                      Pool is locked. Quantity modifications and withdrawals are closed.
                    </p>
                  </div>
                )}

                {/* Explicit Snapshot Approval (SUJ-04) */}
                {isAwaitingApprovals && myContribution.approvalStatus !== 'APPROVED' && (
                  <div className="pt-3 border-t border-midnight-border/70 space-y-3">
                    <p className="text-xs text-teal-200">
                      Target achieved! Please review and explicitly approve final snapshot terms.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full justify-center"
                      disabled={actionLoading}
                      onClick={handleApproveSnapshotClick}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve Cost Breakdown
                    </Button>
                  </div>
                )}
              </div>
            ) : isRecruiting ? (
              /* Join Pool View */
              <div className="space-y-4">
                <div className="border-b border-midnight-border/70 pb-3">
                  <h3 className="font-bold text-white">Join This Group-Buy</h3>
                  <p className="text-xs text-midnight-muted mt-0.5">
                    Pay-at-join commitment with full automatic refund protection.
                  </p>
                </div>

                <div className="space-y-3">
                  <MOQStepCalculator
                    value={joinQuantity}
                    onChange={setJoinQuantity}
                    targetMoq={targetMoq}
                    minRetailerQuantity={minRetailerQty}
                    quantityStepMultiple={stepMultiple}
                    currentUnitPriceMinor={currentPriceMinor}
                    baseUnitPriceMinor={pool.baseUnitPriceMinor || currentPriceMinor}
                    tiers={pool.pricingTiers || []}
                    currency={currency}
                    packUnit={packUnit}
                  />

                  {userRequirements.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Link Confirmed Requirement:
                      </label>
                      <select
                        className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-emerald focus:outline-none"
                        value={selectedRequirementId}
                        onChange={(e) => setSelectedRequirementId(e.target.value)}
                      >
                        {userRequirements.map((r) => (
                          <option key={r._id} value={r._id}>
                            {r.title} ({r.confirmedFields?.quantity || r.confirmedFields?.volume || ''} {r.confirmedFields?.unit || ''})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-midnight-border bg-midnight-surface text-midnight-emerald focus:ring-0"
                      checked={acceptSubstitution}
                      onChange={(e) => setAcceptSubstitution(e.target.checked)}
                    />
                    <span className="text-xs text-slate-300">
                      Allow compatible product substitution if supplier runs out of primary brand
                    </span>
                  </label>
                </div>

                <Button
                  variant="primary"
                  className="w-full justify-center mt-2"
                  disabled={actionLoading || joinQuantity < minRetailerQty}
                  onClick={handleInitiateJoin}
                >
                  Commit & Checkout
                </Button>
              </div>
            ) : (
              /* Closed Pool State */
              <div className="text-center py-6 space-y-2">
                <p className="text-sm font-semibold text-slate-300">Recruitment Closed</p>
                <p className="text-xs text-midnight-muted">
                  This group-buy pool is no longer accepting new retailer contributions.
                </p>
              </div>
            )}
          </div>

          {/* Activity Timeline Card */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Audit Activity Trail
            </h3>
            <ActivityTimeline
              events={[
                {
                  action: 'POOL_CREATED',
                  timestamp: pool.createdAt,
                  actorRole: 'SHOP_OWNER',
                  description: `72h Group Pool published with target MOQ ${targetMoq} ${packUnit}`,
                },
                ...(pool.stateHistory || []).map((h) => ({
                  action: h.state,
                  timestamp: h.transitionedAt,
                  actorRole: 'SYSTEM',
                  description: `Status changed to ${h.state}`,
                })),
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── PayPal Sandbox Checkout Modal ── */}
      <PayPalCheckoutModal
        open={checkoutModalOpen}
        onOpenChange={setCheckoutModalOpen}
        contributionId={activePaymentContributionId}
        paymentPurpose={paymentPurpose}
        estimatedAmountMinor={estimatedPayableMinor}
        currency={currency}
        poolTitle={pool.title}
        productTitle={pool.productId?.canonicalName || pool.title}
        isMockMode={import.meta.env.VITE_PAYMENT_MODE === 'mock'}
        onSuccess={async () => {
          notify?.('Payment capture verified! Contribution is active.', 'success');
          setCheckoutModalOpen(false);
          setPreviousQuantity(null);
          await loadPoolData();
        }}
        onCancel={async () => {
          setCheckoutModalOpen(false);
          if (paymentPurpose === 'QUANTITY_INCREASE_DELTA' && previousQuantity && myContribution) {
            try {
              await updateContributionQuantity(poolId, myContribution._id, previousQuantity);
              setPreviousQuantity(null);
              await loadPoolData();
              notify?.('Quantity increase checkout cancelled. Quantity reverted.', 'info');
            } catch {
              notify?.('Payment checkout was cancelled.', 'info');
            }
          } else {
            notify?.('Payment checkout was cancelled.', 'info');
          }
        }}
        onError={async (err) => {
          setCheckoutModalOpen(false);
          if (paymentPurpose === 'QUANTITY_INCREASE_DELTA' && previousQuantity && myContribution) {
            try {
              await updateContributionQuantity(poolId, myContribution._id, previousQuantity);
              setPreviousQuantity(null);
              await loadPoolData();
            } catch {
              // Ignore revert error
            }
          }
          notify?.(err?.message || 'Payment capture failed.', 'error');
        }}
      />

      {/* ── Edit Quantity Modal (Pre-Lock) ── */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modify Contribution Quantity</DialogTitle>
            <DialogDescription>
              Adjust your pooled quantity before the pool locks. Decreasing quantity triggers an immediate partial refund;
              increasing quantity requires completing delta checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <MOQStepCalculator
              value={editQuantity}
              onChange={setEditQuantity}
              targetMoq={targetMoq}
              minRetailerQuantity={minRetailerQty}
              quantityStepMultiple={stepMultiple}
              currentUnitPriceMinor={currentPriceMinor}
              baseUnitPriceMinor={pool.baseUnitPriceMinor || currentPriceMinor}
              tiers={pool.pricingTiers || []}
              currency={currency}
              packUnit={packUnit}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={actionLoading || editQuantity < minRetailerQty}
              onClick={handleSaveEditQuantity}
            >
              Update Quantity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Withdraw Confirmation Modal (Pre-Lock) ── */}
      <Dialog open={withdrawModalOpen} onOpenChange={setWithdrawModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-400">Withdraw from Pool?</DialogTitle>
            <DialogDescription>
              Are you sure you want to withdraw your {myContribution?.quantity} {packUnit} contribution? Your payment of{' '}
              {formatMinorToMajor(myContribution?.totalPaidMinor || 0, currency)} will be fully refunded to your original payment method.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <label className="text-xs text-midnight-muted">Select Reason:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2"
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
            >
              <option value="BUYER_WITHDRAWAL">Voluntary Buyer Withdrawal</option>
              <option value="QUANTITY_REDUCTION">Procurement Needs Changed</option>
              <option value="FOUND_ALTERNATIVE">Found Alternative Wholesaler</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setWithdrawModalOpen(false)}>
              Keep My Contribution
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={actionLoading}
              onClick={handleConfirmWithdraw}
            >
              Confirm Withdrawal & Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GroupBuyDetailPage;
