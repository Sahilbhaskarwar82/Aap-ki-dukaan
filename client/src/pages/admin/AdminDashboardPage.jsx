/**
 * CoBuy AI — Platform Operations & Reconciliation Dashboard (SUJ-09 / SRU-10)
 *
 * Route: /admin
 * Access: ADMIN, REVIEWER (Reviewer is strictly read-only)
 *
 * Displays:
 *  - Operational health metrics (stalled pools, expired quotes, attention payments, failed refunds, failed AI logs)
 *  - Prominent "Run 72h/24h Lifecycle Check Now" action with non-production offset simulator
 *  - Exception inspection cards and deep links to administrative workspaces
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Clock,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Cpu,
  Store,
  DollarSign,
  ArrowRight,
  Eye,
  Lock,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import {
  getReconciliationDashboard,
  runLifecycleCheck,
  listSuppliersForAdmin,
  searchOffersForAdmin,
} from '@/api/admin.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotifications();

  const isAdmin = user?.role === 'ADMIN';
  const isReviewer = user?.role === 'REVIEWER';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reconciliation, setReconciliation] = useState({
    summary: {
      stalledPoolsCount: 0,
      expiredQuotesCount: 0,
      attentionPaymentsCount: 0,
      failedRefundsCount: 0,
      failedAiLogsCount: 0,
    },
    stalledPools: [],
    expiredQuotes: [],
    attentionPayments: [],
    failedRefunds: [],
    failedAiLogs: [],
  });

  const [supplierCount, setSupplierCount] = useState(null);
  const [offerCount, setOfferCount] = useState(null);

  // Lifecycle Job Modal State
  const [lifecycleModalOpen, setLifecycleModalOpen] = useState(false);
  const [offsetHours, setOffsetHours] = useState('72');
  const [runningJob, setRunningJob] = useState(false);
  const [lastJobResult, setLastJobResult] = useState(null);

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [reconData, suppliersRes, offersRes] = await Promise.allSettled([
        getReconciliationDashboard(),
        listSuppliersForAdmin({ limit: 1 }),
        searchOffersForAdmin({ limit: 1 }),
      ]);

      if (reconData.status === 'fulfilled') {
        setReconciliation(reconData.value);
      } else {
        throw reconData.reason;
      }

      if (suppliersRes.status === 'fulfilled' && suppliersRes.value?.pagination?.totalCount != null) {
        setSupplierCount(suppliersRes.value.pagination.totalCount);
      }

      if (offersRes.status === 'fulfilled' && offersRes.value?.pagination?.totalCount != null) {
        setOfferCount(offersRes.value.pagination.totalCount);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load reconciliation dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Execute lifecycle check
  const handleExecuteLifecycleCheck = async () => {
    if (!isAdmin) {
      notify?.('Lifecycle job execution requires ADMIN role.', 'error');
      return;
    }

    try {
      setRunningJob(true);
      const parsedOffset = parseInt(offsetHours, 10) || 0;
      const result = await runLifecycleCheck(parsedOffset);
      setLastJobResult(result);
      notify?.(
        `Lifecycle check completed: ${result?.results?.lockedMoqReached ?? 0} locked, ${
          result?.results?.lockedUnderMoq ?? 0
        } under-MOQ, ${result?.results?.expiredDecisionWindowsProcessed ?? 0} expired decision windows processed.`,
        'success'
      );
      await loadDashboardData();
    } catch (err) {
      notify?.(
        err?.response?.data?.message || err?.message || 'Failed to execute lifecycle check.',
        'error'
      );
    } finally {
      setRunningJob(false);
    }
  };

  const summary = reconciliation.summary || {
    stalledPoolsCount: reconciliation.stalledPools?.length || 0,
    expiredQuotesCount: reconciliation.expiredQuotes?.length || 0,
    attentionPaymentsCount: reconciliation.attentionPayments?.length || 0,
    failedRefundsCount: reconciliation.failedRefunds?.length || 0,
    failedAiLogsCount: reconciliation.failedAiLogs?.length || 0,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-6" data-testid="admin-dashboard-page">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Shield className="h-6 w-6 text-midnight-red" />
            <h1 className="text-xl font-bold text-white tracking-tight">Platform Operations & Moderation</h1>
            <Badge variant={isAdmin ? 'neutral' : 'warning'}>
              {isAdmin ? 'ADMIN ACCESS' : 'REVIEWER READ-ONLY'}
            </Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Real-time reconciliation exceptions, catalogue oversight, and automated 72h/24h lifecycle scheduler.
          </p>
        </div>

        {/* Global Controls & Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            disabled={loading}
            title="Refresh dashboard metrics"
          >
            <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {isAdmin ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setLifecycleModalOpen(true)}
              data-testid="trigger-lifecycle-btn"
            >
              <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
              Run 72h/24h Lifecycle Check
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-midnight-card border border-midnight-border text-[11px] text-midnight-muted">
              <Lock className="h-3 w-3 text-amber-400" />
              <span>Lifecycle controls locked (Reviewer)</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Sub-navigation Links ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="px-3 py-1.5 rounded-lg bg-midnight-surface border border-midnight-border text-white font-medium"
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
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
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

      {/* ── Reviewer Read-Only Notice ── */}
      {isReviewer && (
        <Alert variant="info" className="py-2.5">
          <Eye className="h-4 w-4" />
          <AlertTitle className="text-xs font-semibold">Reviewer Role Active</AlertTitle>
          <AlertDescription className="text-xs">
            You are operating under read-only auditor permissions. Operational health metrics and audit trails are accessible, but administrative mutations, payment annotations, and scheduler triggers are restricted.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dashboard Load Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadDashboardData} className="ml-4">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Metric Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div
          onClick={() => navigate('/admin/pools')}
          className="cursor-pointer bg-midnight-card border border-midnight-border rounded-xl p-3.5 hover:border-amber-500/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-midnight-muted font-medium">Stalled Pools</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-400">
            {loading ? <Skeleton className="h-7 w-12" /> : summary.stalledPoolsCount}
          </div>
          <span className="text-[10px] text-midnight-muted block mt-0.5">Deadline or Under-MOQ</span>
        </div>

        <div
          onClick={() => navigate('/admin/pools')}
          className="cursor-pointer bg-midnight-card border border-midnight-border rounded-xl p-3.5 hover:border-rose-500/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-midnight-muted font-medium">Attention Payments</span>
            <DollarSign className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-400">
            {loading ? <Skeleton className="h-7 w-12" /> : summary.attentionPaymentsCount}
          </div>
          <span className="text-[10px] text-midnight-muted block mt-0.5">Unknown / Notes pending</span>
        </div>

        <div
          onClick={() => navigate('/admin/pools')}
          className="cursor-pointer bg-midnight-card border border-midnight-border rounded-xl p-3.5 hover:border-rose-500/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-midnight-muted font-medium">Failed Refunds</span>
            <XCircle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-400">
            {loading ? <Skeleton className="h-7 w-12" /> : summary.failedRefundsCount}
          </div>
          <span className="text-[10px] text-midnight-muted block mt-0.5">Provider errors</span>
        </div>

        <div
          onClick={() => navigate('/admin/pools')}
          className="cursor-pointer bg-midnight-card border border-midnight-border rounded-xl p-3.5 hover:border-yellow-500/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-midnight-muted font-medium">Expired Quotes</span>
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-yellow-400">
            {loading ? <Skeleton className="h-7 w-12" /> : summary.expiredQuotesCount}
          </div>
          <span className="text-[10px] text-midnight-muted block mt-0.5">Unaccepted validity</span>
        </div>

        <div className="bg-midnight-card border border-midnight-border rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-midnight-muted font-medium">Failed AI Logs</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-cyan-400">
            {loading ? <Skeleton className="h-7 w-12" /> : summary.failedAiLogsCount}
          </div>
          <span className="text-[10px] text-midnight-muted block mt-0.5">Schema/timeout issues</span>
        </div>

        <div
          onClick={() => navigate('/admin/suppliers')}
          className="cursor-pointer bg-midnight-card border border-midnight-border rounded-xl p-3.5 hover:border-teal-500/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-midnight-muted font-medium">Total Suppliers</span>
            <Store className="h-4 w-4 text-teal-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-teal-400">
            {loading ? <Skeleton className="h-7 w-12" /> : supplierCount != null ? supplierCount : '—'}
          </div>
          <span className="text-[10px] text-midnight-muted block mt-0.5">Catalogue directory</span>
        </div>

        <div
          onClick={() => navigate('/admin/offers')}
          className="cursor-pointer bg-midnight-card border border-midnight-border rounded-xl p-3.5 hover:border-emerald-500/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-midnight-muted font-medium">Catalogue Offers</span>
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
            {loading ? <Skeleton className="h-7 w-12" /> : offerCount != null ? offerCount : '—'}
          </div>
          <span className="text-[10px] text-midnight-muted block mt-0.5">Active wholesale quotes</span>
        </div>
      </div>

      {/* ── Main Exception Inspection Sections ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stalled Pools Preview */}
        <div className="bg-midnight-card border border-midnight-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-midnight-border pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">Stalled Pools & Under-MOQ Exceptions</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/pools')}
              className="text-xs text-teal-400 hover:text-teal-300 p-0 h-auto"
            >
              View All <ArrowRight className="h-3 w-3 ml-1 inline" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : reconciliation.stalledPools?.length === 0 ? (
            <div className="text-center py-6 text-xs text-midnight-muted">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1.5 opacity-70" />
              No stalled pools requiring administrative intervention.
            </div>
          ) : (
            <div className="divide-y divide-midnight-border/40 text-xs">
              {reconciliation.stalledPools.slice(0, 5).map((pool) => (
                <div key={pool._id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white truncate">
                        {pool.productName || pool.productId?.name || pool.poolNumber || pool._id}
                      </span>
                      <Badge variant="warning">{pool.state}</Badge>
                    </div>
                    <div className="text-[11px] text-midnight-muted flex items-center gap-2">
                      <span>Total: {pool.totalQuantity || pool.totalEligibleQuantity || 0} units</span>
                      <span>•</span>
                      <span>Target MOQ: {pool.targetMoq || 0}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/group-buys/${pool._id}`)}
                    className="text-[11px] h-7 px-2"
                  >
                    Inspect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attention Payments Preview */}
        <div className="bg-midnight-card border border-midnight-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-midnight-border pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-rose-400" />
              <h2 className="text-sm font-bold text-white">Payments Requiring Reconciliation (FR-ADMIN-005)</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/pools')}
              className="text-xs text-teal-400 hover:text-teal-300 p-0 h-auto"
            >
              Reconcile <ArrowRight className="h-3 w-3 ml-1 inline" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : reconciliation.attentionPayments?.length === 0 ? (
            <div className="text-center py-6 text-xs text-midnight-muted">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1.5 opacity-70" />
              Zero unresolved payments. All captured payments settled.
            </div>
          ) : (
            <div className="divide-y divide-midnight-border/40 text-xs">
              {reconciliation.attentionPayments.slice(0, 5).map((pay) => (
                <div key={pay._id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{pay.paymentId || pay._id}</span>
                      <Badge variant={pay.paymentStatus === 'PAID' ? 'success' : 'error'}>
                        {pay.paymentStatus}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-midnight-muted">
                      Amount: <strong className="text-teal-300">{formatMinorToMajor(pay.amountMinor, pay.currency)}</strong>
                      {pay.reconciliationNotes?.length > 0 && (
                        <span className="ml-2 text-amber-300">({pay.reconciliationNotes.length} notes)</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/admin/pools')}
                    className="text-[11px] h-7 px-2"
                  >
                    Annotate
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Failed Refunds Preview */}
        <div className="bg-midnight-card border border-midnight-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-midnight-border pb-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-400" />
              <h2 className="text-sm font-bold text-white">Failed Refunds Queue</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/pools')}
              className="text-xs text-teal-400 hover:text-teal-300 p-0 h-auto"
            >
              View All <ArrowRight className="h-3 w-3 ml-1 inline" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : reconciliation.failedRefunds?.length === 0 ? (
            <div className="text-center py-6 text-xs text-midnight-muted">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1.5 opacity-70" />
              No failed refunds recorded.
            </div>
          ) : (
            <div className="divide-y divide-midnight-border/40 text-xs">
              {reconciliation.failedRefunds.slice(0, 5).map((ref) => (
                <div key={ref._id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{ref.refundId || ref._id}</span>
                      <Badge variant="error">{ref.status}</Badge>
                    </div>
                    <div className="text-[11px] text-midnight-muted">
                      Reason: {ref.reason} • Amount:{' '}
                      <strong className="text-rose-300">{formatMinorToMajor(ref.amountMinor, ref.currency)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Failed AI Execution Logs Preview */}
        <div className="bg-midnight-card border border-midnight-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-midnight-border pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">AI Engine Exceptions (AIExecutionLog)</h2>
            </div>
            <Badge variant="outline" className="text-[10px]">Model Traces</Badge>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : reconciliation.failedAiLogs?.length === 0 ? (
            <div className="text-center py-6 text-xs text-midnight-muted">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1.5 opacity-70" />
              No failed AI execution logs detected.
            </div>
          ) : (
            <div className="divide-y divide-midnight-border/40 text-xs">
              {reconciliation.failedAiLogs.slice(0, 5).map((log) => (
                <div key={log._id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{log.operation || 'AI_OPERATION'}</span>
                    <Badge variant="error">{log.status}</Badge>
                  </div>
                  <div className="text-[11px] text-midnight-muted font-mono truncate">
                    Correlation: {log.correlationId || 'N/A'} • Latency: {log.latencyMs || 0}ms
                  </div>
                  {log.safeErrorCode && (
                    <div className="text-[10px] text-rose-400">Error: {log.safeErrorCode}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: Execute 72h/24h Lifecycle Scheduler Check ── */}
      <Dialog open={lifecycleModalOpen} onOpenChange={setLifecycleModalOpen}>
        <DialogContent className="max-w-md bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4 text-midnight-red fill-current" />
              Run 72h/24h Pool Lifecycle Scheduler
            </DialogTitle>
            <DialogDescription className="text-xs text-midnight-muted">
              Evaluates pool deadlines, locks pools meeting wholesale MOQ, cancels shortfalls past 24h decision window, and processes refunds.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-200 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Scheduler Clock Evaluation Notice
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Running the lifecycle check evaluates all active pools against current server time. In development and staging environments, you may simulate fast-forwarding the clock to evaluate 72-hour recruitment locks or 24-hour decision expirations.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold">Lifecycle Clock Evaluation Offset:</label>
              <select
                className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-2.5 focus:border-midnight-red focus:outline-none"
                value={offsetHours}
                onChange={(e) => setOffsetHours(e.target.value)}
              >
                <option value="0">0 hours (Evaluate against current server time)</option>
                <option value="24">+24 hours (Simulate recruitment/decision expiration)</option>
                <option value="72">+72 hours (Simulate complete pool closure window)</option>
              </select>
              <p className="text-[10px] text-midnight-muted">
                Evaluates active pool windows against designated operational deadlines.
              </p>
            </div>

            {lastJobResult && (
              <div className="p-2.5 rounded-lg bg-midnight-surface border border-midnight-border text-[11px] space-y-1">
                <span className="font-semibold text-emerald-400">Previous Run Outcome:</span>
                <div>Locked MOQ Reached: <strong>{lastJobResult.results?.lockedMoqReached ?? 0}</strong></div>
                <div>Locked Under-MOQ: <strong>{lastJobResult.results?.lockedUnderMoq ?? 0}</strong></div>
                <div>Expired Windows Processed: <strong>{lastJobResult.results?.expiredDecisionWindowsProcessed ?? 0}</strong></div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLifecycleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={runningJob}
              onClick={handleExecuteLifecycleCheck}
            >
              {runningJob ? 'Evaluating...' : 'Confirm & Run Lifecycle Check'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminDashboardPage;
