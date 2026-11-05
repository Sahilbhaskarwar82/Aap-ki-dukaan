/**
 * CoBuy AI — Retailer Dashboard & Analytics Page (HIM-06)
 *
 * Route: /dashboard
 *
 * Central operations hub for authenticated retail shop owners and kiranas.
 * Aggregates:
 *  - Authoritative KPI metrics:
 *      1. Active Pools Joined (user-participating active pools)
 *      2. Pending Snapshot Approvals (snapshots awaiting retailer sign-off)
 *      3. 24h Under-MOQ Decisions Required (feasibility resolutions)
 *      4. Total Verified Savings (authoritative backend savings, zero fabrication)
 *  - Action-Required alert banners for urgent pool decisions
 *  - Active Group-Buy pools tracking table with TierProgressBar & 72h CountdownTimer
 *  - Recent procurement requirements with status badges
 *  - Recent group purchase orders with fulfillment status
 *  - Recent procurement alerts and notifications
 *  - Quick action shortcuts to registered routes
 *  - Comprehensive loading skeletons, empty states, and error retry handlers
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Package,
  TrendingDown,
  Layers,
  Sparkles,
  Search,
  Bell,
  RefreshCw,
  Store,
  Users,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import { fetchPools, fetchPoolById } from '@/api/pools.api';
import { listRequirements } from '@/api/requirements.api';
import { listOrders } from '@/api/orders.api';
import { paymentsApi } from '@/api/payments.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { TierProgressBar } from '@/components/common/TierProgressBar';
import { CountdownTimer } from '@/components/common/CountdownTimer';
import { ProvenanceBadge } from '@/components/common/ProvenanceBadge';

function formatDate(isoDate) {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return String(isoDate);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(isoDate);
  }
}

function formatRelativeTime(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
}

export function BuyerDashboardPage() {
  const navigate = useNavigate();
  const { user, shop } = useAuth();
  const { notifications: contextNotifications } = useNotifications();

  // Primary data states
  const [pools, setPools] = useState([]);
  const [poolDetailsMap, setPoolDetailsMap] = useState({});
  const [requirements, setRequirements] = useState([]);
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingsUnavailable, setSavingsUnavailable] = useState(false);
  const [activeTab, setActiveTab] = useState('joined'); // 'joined' | 'all'

  const currentShopId = shop?._id || user?.shopId;
  const currentUserId = user?._id;

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSavingsUnavailable(false);

    try {
      // 1. Parallel fetch top-level dashboard collections
      const [poolsResult, reqsResult, ordersResult, refundsResult] = await Promise.allSettled([
        fetchPools(),
        listRequirements({ limit: 5 }),
        listOrders({ limit: 5 }),
        paymentsApi.listRefunds({ limit: 50 }),
      ]);

      let loadedPools = [];
      if (poolsResult.status === 'fulfilled') {
        loadedPools = Array.isArray(poolsResult.value) ? poolsResult.value : [];
        setPools(loadedPools);
      } else {
        throw new Error(poolsResult.reason?.message || 'Failed to load group-buy pools.');
      }

      if (reqsResult.status === 'fulfilled') {
        // Backend wraps: { data: { data: { requirements: [...], pagination: {...} }, message, statusCode } }
        // So res.data.data.requirements is the array we need.
        const resPayload = reqsResult.value?.data?.data !== undefined
          ? reqsResult.value.data.data
          : reqsResult.value?.data;
        const reqData = Array.isArray(resPayload)
          ? resPayload
          : Array.isArray(resPayload?.requirements)
          ? resPayload.requirements
          : Array.isArray(reqsResult.value?.data?.requirements)
          ? reqsResult.value.data.requirements
          : [];
        setRequirements(reqData);
      } else {
        setRequirements([]);
      }

      if (ordersResult.status === 'fulfilled') {
        setOrders(Array.isArray(ordersResult.value) ? ordersResult.value : []);
      } else {
        setOrders([]);
      }

      if (refundsResult.status === 'fulfilled') {
        const refData = refundsResult.value?.refunds || refundsResult.value || [];
        setRefunds(Array.isArray(refData) ? refData : []);
      } else {
        setRefunds([]);
        setSavingsUnavailable(true);
      }

      // 2. Fetch participation details for active pools in parallel
      const activePools = loadedPools.filter((p) =>
        ['RECRUITING', 'MOQ_REACHED', 'AWAITING_APPROVALS', 'UNDER_MOQ_DECISION_PENDING'].includes(p.state)
      );

      const detailsMap = {};
      if (activePools.length > 0) {
        const detailResults = await Promise.allSettled(
          activePools.map((p) => fetchPoolById(p._id))
        );

        detailResults.forEach((res, index) => {
          const poolObj = activePools[index];
          if (res.status === 'fulfilled' && res.value) {
            const contributions = Array.isArray(res.value.contributions) ? res.value.contributions : [];
            const myContribution = contributions.find((c) => {
              const shopMatch = currentShopId && (c.shopId?._id || c.shopId)?.toString() === currentShopId.toString();
              const userMatch = currentUserId && (c.createdByUserId?._id || c.createdByUserId)?.toString() === currentUserId.toString();
              return (shopMatch || userMatch) && c.state !== 'WITHDRAWN';
            });
            detailsMap[poolObj._id] = {
              pool: res.value.pool || poolObj,
              contributions,
              myContribution: myContribution || null,
            };
          } else {
            detailsMap[poolObj._id] = {
              pool: poolObj,
              contributions: [],
              myContribution: null,
            };
          }
        });
      }
      setPoolDetailsMap(detailsMap);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load retailer dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [currentShopId, currentUserId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // ── KPI Computations ──────────────────────────────────────────────────────────

  // Active pools where the authenticated retailer has an active contribution
  const myJoinedActivePools = useMemo(() => {
    return pools
      .filter((p) => ['RECRUITING', 'MOQ_REACHED', 'AWAITING_APPROVALS', 'UNDER_MOQ_DECISION_PENDING'].includes(p.state))
      .map((p) => {
        const detail = poolDetailsMap[p._id];
        return {
          pool: detail?.pool || p,
          myContribution: detail?.myContribution || null,
          contributions: detail?.contributions || [],
        };
      })
      .filter((item) => {
        if (!item.myContribution) return false;
        return ['ACTIVE', 'PENDING_PAYMENT', 'FINALIZED'].includes(item.myContribution.state);
      });
  }, [pools, poolDetailsMap]);

  // Pools requiring PriceSnapshot approval by current retailer
  const pendingApprovalPools = useMemo(() => {
    return myJoinedActivePools.filter(({ pool, myContribution }) => {
      if (pool.state !== 'AWAITING_APPROVALS') return false;
      return myContribution?.approvalStatus === 'PENDING_APPROVAL' || myContribution?.approvalStatus !== 'APPROVED';
    });
  }, [myJoinedActivePools]);

  // Pools in 24h Under-MOQ decision window requiring current retailer action
  const underMoqRequiredPools = useMemo(() => {
    return myJoinedActivePools.filter(({ pool, myContribution }) => {
      if (pool.state !== 'UNDER_MOQ_DECISION_PENDING') return false;
      return myContribution?.underMoqDecision === 'PENDING' || myContribution?.underMoqDecision !== 'PROCEED';
    });
  }, [myJoinedActivePools]);

  // Authoritative verified savings from contribution ledger & tier-drop refunds
  const totalVerifiedSavingsMinor = useMemo(() => {
    let sum = 0;
    // Verified savings from member contributions
    myJoinedActivePools.forEach(({ myContribution }) => {
      if (myContribution && typeof myContribution.verifiedSavingsMinor === 'number') {
        sum += Math.max(0, myContribution.verifiedSavingsMinor);
      }
    });

    // Plus completed tier-drop refunds
    refunds.forEach((r) => {
      if (r.reason === 'TIER_PRICE_DROP_SAVINGS' && r.status === 'COMPLETED') {
        sum += Math.max(0, Number(r.amountMinor) || 0);
      }
    });

    return sum;
  }, [myJoinedActivePools, refunds]);

  // Notifications to display (most recent 4)
  const displayNotifications = useMemo(() => {
    const list = Array.isArray(contextNotifications) ? contextNotifications : [];
    return list.slice(0, 4);
  }, [contextNotifications]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="buyer-dashboard-page">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Retailer Dashboard & Analytics</h1>
            <Badge variant="warning">Wave 3 (HIM-06)</Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Welcome back, <span className="text-slate-200 font-medium">{shop?.name || user?.name || 'Retailer'}</span> •
            Procurement operations and collective demand aggregation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            disabled={loading}
            title="Refresh dashboard metrics"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/requirements/new')}>
            <Plus className="h-4 w-4 mr-1" /> New Requirement
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/group-buys')}>
            <Search className="h-4 w-4 mr-1" /> Browse Pools
          </Button>
        </div>
      </div>

      {/* ── Global API Error Banner with Retry ── */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <div className="flex-1">
            <AlertTitle>Dashboard Data Fetch Error</AlertTitle>
            <AlertDescription className="text-xs mt-1">{error}</AlertDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadDashboardData} className="self-center">
            Retry
          </Button>
        </Alert>
      )}

      {/* ── Action Required Alert Banners ── */}
      {underMoqRequiredPools.length > 0 && (
        <Alert variant="warning" className="border-amber-500/50 bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div>
              <AlertTitle className="text-amber-300 font-bold">
                {underMoqRequiredPools.length} Group Pool(s) in 24h Under-MOQ Decision Window
              </AlertTitle>
              <AlertDescription className="text-amber-200/90 text-xs mt-1">
                Action required: Pool closed below supplier MOQ. Choose to proceed with revised wholesale pricing or cancel for an automatic full refund.
              </AlertDescription>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {underMoqRequiredPools.map(({ pool }) => (
                <div
                  key={pool._id}
                  className="flex items-center gap-2 bg-midnight-surface/80 border border-amber-500/30 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                >
                  <span className="font-semibold">{pool.title}</span>
                  {pool.decisionDeadline && (
                    <span className="text-[11px] text-amber-400">
                      • Deadline: {formatDate(pool.decisionDeadline)}
                    </span>
                  )}
                  <Button
                    variant="warning"
                    size="sm"
                    className="h-6 text-[11px] px-2 ml-1"
                    onClick={() => navigate(`/group-buys/${pool._id}`)}
                  >
                    Review Decision
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Alert>
      )}

      {pendingApprovalPools.length > 0 && (
        <Alert variant="warning" className="border-teal-500/50 bg-teal-950/30">
          <CheckCircle2 className="h-5 w-5 text-teal-400 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div>
              <AlertTitle className="text-teal-300 font-bold">
                {pendingApprovalPools.length} Pool(s) Awaiting Final Cost Snapshot Approval
              </AlertTitle>
              <AlertDescription className="text-teal-200/90 text-xs mt-1">
                Wholesale target met! Please review your locked landed cost breakdown and confirm your allocation.
              </AlertDescription>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {pendingApprovalPools.map(({ pool }) => (
                <div
                  key={pool._id}
                  className="flex items-center gap-2 bg-midnight-surface/80 border border-teal-500/30 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                >
                  <span className="font-semibold">{pool.title}</span>
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-6 text-[11px] px-2 ml-1"
                    onClick={() => navigate(`/group-buys/${pool._id}`)}
                  >
                    Approve Snapshot
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Alert>
      )}

      {/* ── KPI Metric Summary Row (4 Authoritative Cards) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-summary-row">
        {/* KPI 1: Active Pools Joined */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-midnight-muted">
            <span className="text-xs uppercase tracking-wider font-semibold">Active Pools Joined</span>
            <Layers className="h-4 w-4 text-midnight-emerald" />
          </div>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold font-mono text-white" data-testid="kpi-active-pools">
              {myJoinedActivePools.length}
            </div>
          )}
          <p className="text-[11px] text-midnight-muted">Active collective pools with your commitment</p>
        </div>

        {/* KPI 2: Pending Snapshot Approvals */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-midnight-muted">
            <span className="text-xs uppercase tracking-wider font-semibold">Pending Approvals</span>
            <CheckCircle2 className="h-4 w-4 text-teal-400" />
          </div>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold font-mono text-white" data-testid="kpi-pending-approvals">
              {pendingApprovalPools.length}
            </div>
          )}
          <p className="text-[11px] text-midnight-muted">Frozen price snapshots awaiting your sign-off</p>
        </div>

        {/* KPI 3: 24h Under-MOQ Decisions */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-midnight-muted">
            <span className="text-xs uppercase tracking-wider font-semibold">24h Decisions</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold font-mono text-white" data-testid="kpi-under-moq-decisions">
              {underMoqRequiredPools.length}
            </div>
          )}
          <p className="text-[11px] text-midnight-muted">Under-MOQ feasibility resolution windows</p>
        </div>

        {/* KPI 4: Total Verified Savings */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-midnight-muted">
            <span className="text-xs uppercase tracking-wider font-semibold">Total Verified Savings</span>
            <TrendingDown className="h-4 w-4 text-emerald-400" />
          </div>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : savingsUnavailable ? (
            <div className="text-xl font-bold font-mono text-midnight-muted" data-testid="kpi-verified-savings">
              Unavailable
            </div>
          ) : (
            <div className="text-2xl font-bold font-mono text-emerald-400" data-testid="kpi-verified-savings">
              {formatMinorToMajor(totalVerifiedSavingsMinor, 'INR')}
            </div>
          )}
          <p className="text-[11px] text-midnight-muted">
            {savingsUnavailable ? 'Savings ledger temporarily unavailable' : 'Authoritative savings from settled orders & tier drops'}
          </p>
        </div>
      </div>

      {/* ── Active Group-Buy Pools Section ── */}
      <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl" data-testid="active-pools-section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-midnight-border/70 pb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-midnight-emerald" />
              Active Regional Group-Buy Pools
            </h2>
            <div className="inline-flex rounded-lg bg-midnight-surface p-0.5 border border-midnight-border text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('joined')}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                  activeTab === 'joined' ? 'bg-midnight-card text-white shadow-sm' : 'text-midnight-muted hover:text-slate-300'
                }`}
              >
                My Pools ({myJoinedActivePools.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                  activeTab === 'all' ? 'bg-midnight-card text-white shadow-sm' : 'text-midnight-muted hover:text-slate-300'
                }`}
              >
                All Active ({pools.filter((p) => ['RECRUITING', 'MOQ_REACHED', 'AWAITING_APPROVALS'].includes(p.state)).length})
              </button>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => navigate('/group-buys')}>
            Explore Marketplace <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : activeTab === 'joined' && myJoinedActivePools.length === 0 ? (
          <div className="text-center py-8 text-midnight-muted space-y-2">
            <Layers className="h-8 w-8 text-midnight-muted mx-auto opacity-50" />
            <p className="text-sm font-medium text-slate-300">You have not joined any active pools yet.</p>
            <p className="text-xs max-w-md mx-auto">
              Join an existing regional group buy to access wholesale tier discounts, or publish a new pool from your requirement.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <Button variant="primary" size="sm" onClick={() => navigate('/group-buys')}>
                Browse Available Pools
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/group-buys/create')}>
                Create First Pool
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-midnight-border/50">
            {(activeTab === 'joined'
              ? myJoinedActivePools
              : pools
                  .filter((p) => ['RECRUITING', 'MOQ_REACHED', 'AWAITING_APPROVALS', 'UNDER_MOQ_DECISION_PENDING'].includes(p.state))
                  .map((p) => ({
                    pool: poolDetailsMap[p._id]?.pool || p,
                    myContribution: poolDetailsMap[p._id]?.myContribution || null,
                  }))
            )
              .slice(0, 5)
              .map(({ pool, myContribution }) => {
                const packUnit = pool.packUnit || 'UNIT';
                const targetMoq = Math.max(1, Number(pool.targetMoq) || 1);
                const pooledQty = Math.max(0, Number(pool.totalEligibleQuantity) || 0);
                const unitPriceMinor = pool.currentUnitPriceMinor || pool.baseUnitPriceMinor || 0;

                return (
                  <div key={pool._id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/group-buys/${pool._id}`}
                          className="font-bold text-white hover:text-teal-300 transition-colors"
                        >
                          {pool.title}
                        </Link>
                        <Badge variant="pool" className="text-[10px]">
                          {pool.state}
                        </Badge>
                        {myContribution && (
                          <Badge variant="success" className="text-[10px]">
                            Joined: {myContribution.quantity} {myContribution.unit || packUnit}
                          </Badge>
                        )}
                        {pool.dataSourceType && (
                          <ProvenanceBadge type={pool.dataSourceType} className="text-[10px]" />
                        )}
                      </div>

                      <div className="text-xs text-midnight-muted flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          Area: <strong className="text-slate-300">{pool.deliveryArea}</strong>
                        </span>
                        <span>
                          Target MOQ: <strong className="text-slate-300">{targetMoq} {packUnit}</strong>
                        </span>
                        <span>
                          Current Unit Price:{' '}
                          <strong className="text-teal-300">
                            {formatMinorToMajor(unitPriceMinor, pool.currency)}/{packUnit}
                          </strong>
                        </span>
                        {pool.supplierOfferId?.supplierId?.name && (
                          <span>
                            Supplier: <strong className="text-slate-300">{pool.supplierOfferId.supplierId.name}</strong>
                          </span>
                        )}
                      </div>

                      <div className="pt-1 max-w-lg">
                        <TierProgressBar
                          totalEligibleQuantity={pooledQty}
                          targetMoq={targetMoq}
                          tiers={pool.pricingTiers || []}
                          baseUnitPriceMinor={unitPriceMinor}
                          packUnit={packUnit}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                      {pool.deadline && (
                        <CountdownTimer deadline={pool.deadline} variant="badge" />
                      )}
                      <Button variant="primary" size="sm" onClick={() => navigate(`/group-buys/${pool._id}`)}>
                        View Details
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ── Two Columns: Recent Requirements & Recent Orders ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Requirements */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl" data-testid="recent-requirements-section">
          <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-midnight-emerald" />
              Recent Requirements
            </h3>
            <Button variant="outline" size="sm" onClick={() => navigate('/requirements')}>
              Manage
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : requirements.length === 0 ? (
            <div className="text-center py-6 text-midnight-muted space-y-2">
              <p className="text-xs">No purchasing requirements recorded yet.</p>
              <Button variant="primary" size="sm" onClick={() => navigate('/requirements/new')}>
                <Plus className="h-3 w-3 mr-1" /> Create Requirement
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-sm">
              {requirements.slice(0, 4).map((r) => {
                const displayTitle =
                  r.productName ||
                  r.confirmedFields?.productName ||
                  r.extractedFields?.productName ||
                  r.title ||
                  r.lineItems?.[0]?.rawItemText ||
                  r.originalDescription ||
                  'Requirement';
                const quantity =
                  r.requestedQuantity ||
                  r.confirmedFields?.requestedQuantity ||
                  r.extractedFields?.requestedQuantity ||
                  r.lineItems?.[0]?.quantity ||
                  r.targetQuantity ||
                  '';
                const unit =
                  r.quantityUnit ||
                  r.confirmedFields?.quantityUnit ||
                  r.extractedFields?.quantityUnit ||
                  r.lineItems?.[0]?.unit ||
                  r.confirmedFields?.unit ||
                  '';

                return (
                  <div key={r._id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/requirements/${r._id}`}
                        className="font-medium text-white hover:text-teal-300 transition-colors truncate block"
                      >
                        {displayTitle}
                      </Link>
                      <p className="text-[11px] text-midnight-muted">
                        {quantity ? `${quantity} ${unit} • ` : ''}
                        {formatDate(r.createdAt)}
                      </p>
                    </div>
                    <Badge variant={r.status === 'CONFIRMED' ? 'success' : 'outline'} className="text-[11px]">
                      {r.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl" data-testid="recent-orders-section">
          <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Package className="h-4 w-4 text-teal-400" />
              Recent Group Orders
            </h3>
            <Button variant="outline" size="sm" onClick={() => navigate('/orders')}>
              All Orders
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-6 text-midnight-muted">
              <p className="text-xs">No finalized purchase orders recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-sm">
              {orders.slice(0, 4).map((o) => {
                const orderIdDisplay = o.orderNumber || `AKD-${o._id?.slice(-4)}`;
                const orderStatus = o.supplierConfirmationStatus || o.fulfillmentStatus || 'CONFIRMED';

                return (
                  <div key={o._id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/orders/${o._id}`}
                        className="font-mono font-medium text-white hover:text-teal-300 transition-colors block truncate"
                      >
                        {orderIdDisplay}
                      </Link>
                      <p className="text-[11px] text-midnight-muted">
                        {formatMinorToMajor(o.grandTotalMinor || 0, o.currency || 'INR')} • {formatDate(o.createdAt)}
                      </p>
                    </div>
                    <Badge variant={orderStatus === 'CONFIRMED' ? 'success' : 'secondary'} className="text-[11px]">
                      {orderStatus}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Two Columns: Recent Notifications & Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Notifications (2 columns) */}
        <div className="lg:col-span-2 rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl" data-testid="recent-notifications-section">
          <div className="flex items-center justify-between border-b border-midnight-border/70 pb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" />
              Procurement Alerts & Notifications
            </h3>
            <Button variant="outline" size="sm" onClick={() => navigate('/notifications')}>
              View All
            </Button>
          </div>

          {displayNotifications.length === 0 ? (
            <p className="text-xs text-midnight-muted py-4">No unread notifications at this time.</p>
          ) : (
            <div className="divide-y divide-midnight-border/50 text-sm">
              {displayNotifications.map((n) => (
                <div key={n._id || n.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.isRead && <span className="h-2 w-2 rounded-full bg-teal-400 inline-block shrink-0" />}
                      <p className="font-medium text-white text-xs">{n.title || 'Procurement Alert'}</p>
                    </div>
                    <p className="text-xs text-slate-300/80 line-clamp-1">{n.message || n.description}</p>
                    <span className="text-[10px] text-midnight-muted">{formatRelativeTime(n.createdAt)}</span>
                  </div>
                  <Badge variant={n.isRead ? 'outline' : 'warning'} className="text-[10px]">
                    {n.isRead ? 'Read' : 'New'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions (1 column) */}
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl" data-testid="quick-actions-section">
          <h3 className="font-bold text-white border-b border-midnight-border/70 pb-3">
            Quick Actions
          </h3>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate('/requirements/new')}
              className="w-full text-left p-3 rounded-lg border border-midnight-border bg-midnight-surface/50 hover:bg-midnight-surface hover:border-midnight-emerald/50 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-emerald-300">Create Requirement</div>
                  <div className="text-[11px] text-midnight-muted">Submit AI purchasing draft</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-midnight-muted group-hover:text-white" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/suppliers')}
              className="w-full text-left p-3 rounded-lg border border-midnight-border bg-midnight-surface/50 hover:bg-midnight-surface hover:border-teal-500/50 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-teal-950/60 text-teal-400 border border-teal-500/30">
                  <Store className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-teal-300">Browse Suppliers</div>
                  <div className="text-[11px] text-midnight-muted">Discover verified wholesalers</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-midnight-muted group-hover:text-white" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/group-buys')}
              className="w-full text-left p-3 rounded-lg border border-midnight-border bg-midnight-surface/50 hover:bg-midnight-surface hover:border-amber-500/50 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-amber-950/60 text-amber-400 border border-amber-500/30">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-amber-300">Explore Group Buys</div>
                  <div className="text-[11px] text-midnight-muted">Pool demand for volume discount</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-midnight-muted group-hover:text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuyerDashboardPage;

