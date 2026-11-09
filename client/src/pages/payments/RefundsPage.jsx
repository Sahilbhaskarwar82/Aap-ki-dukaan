import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RotateCcw,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  CreditCard,
  ArrowUpRight,
  TrendingDown,
} from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableEmpty,
} from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { SandboxDisclosureBanner } from '@/components/common/SandboxDisclosureBanner';
import { formatMinorToMajor } from '@/utils/money';
import { paymentsApi } from '@/api/payments.api';

const REASON_CONFIG = {
  BUYER_WITHDRAWAL: {
    label: 'Buyer Withdrawal',
    desc: 'Buyer explicitly withdrew commitment before pool lock',
    variant: 'secondary',
  },
  QUANTITY_REDUCTION: {
    label: 'Quantity Reduction',
    desc: 'Buyer lowered box count; excess commitment refunded',
    variant: 'secondary',
  },
  TIER_PRICE_DROP_SAVINGS: {
    label: 'Tier Price Drop Savings',
    desc: 'Wholesale tier unlocked at lower unit price than paid at join',
    variant: 'default',
  },
  POOL_CANCELLED: {
    label: 'Pool Cancelled',
    desc: 'Pool failed to achieve target MOQ or was cancelled by admin',
    variant: 'destructive',
  },
  UNDER_MOQ_BUYER_CANCEL: {
    label: 'Under-MOQ Cancelled',
    desc: 'Buyer declined revised under-MOQ terms during 24h window',
    variant: 'warning',
  },
  UNDER_MOQ_NO_RESPONSE: {
    label: 'Under-MOQ Expired',
    desc: 'Buyer did not respond to revised terms within 24 hours',
    variant: 'outline',
  },
  SUPPLIER_REJECTED: {
    label: 'Wholesaler Declined PO',
    desc: 'Regional supplier rejected purchase order; full refund issued',
    variant: 'destructive',
  },
  EXTRA_PAYMENT_FAILURE_ROLLBACK: {
    label: 'Rollback Refund',
    desc: 'Post-approval delta payment failure rollback',
    variant: 'outline',
  },
};

const STATUS_CONFIG = {
  REQUESTED: { variant: 'outline', label: 'REQUESTED', icon: Clock, textClass: 'text-sky-400' },
  PROCESSING: { variant: 'warning', label: 'PROCESSING', icon: Clock, textClass: 'text-amber-400' },
  COMPLETED: { variant: 'success', label: 'COMPLETED', icon: CheckCircle2, textClass: 'text-emerald-400' },
  FAILED: { variant: 'destructive', label: 'FAILED', icon: XCircle, textClass: 'text-rose-400' },
};

function formatDate(isoDate) {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoDate);
  }
}

/**
 * RefundsPage (SUJ-06)
 *
 * Buyer refunds tracker displaying all refund events, status transitions,
 * tier-drop savings reconciliations, and provider refund references.
 */
export function RefundsPage() {
  const navigate = useNavigate();
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch refunds
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await paymentsApi.listRefunds({ page: 1, limit: 100 });
        if (!cancelled) {
          setRefunds(res.refunds || []);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || err.message || 'Failed to load refunds tracker.');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadIndex]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadIndex((prev) => prev + 1);
  }, []);

  // Filtered Refunds
  const filteredRefunds = useMemo(() => {
    return refunds.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }
      if (reasonFilter !== 'ALL' && item.reason !== reasonFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRefundId = item.providerRefundId?.toLowerCase().includes(q);
        const paymentIdStr = typeof item.paymentId === 'object' && item.paymentId !== null
          ? (item.paymentId._id || item.paymentId.providerCaptureId || '')
          : String(item.paymentId || '');
        const matchesPaymentId = paymentIdStr.toLowerCase().includes(q);
        const matchesId = item._id?.toLowerCase().includes(q);
        if (!matchesRefundId && !matchesPaymentId && !matchesId) {
          return false;
        }
      }
      return true;
    });
  }, [refunds, statusFilter, reasonFilter, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    let totalCompletedMinor = 0;
    let completedCount = 0;
    let processingCount = 0;
    let failedCount = 0;

    refunds.forEach((r) => {
      if (r.status === 'COMPLETED') {
        totalCompletedMinor += r.amountMinor || 0;
        completedCount += 1;
      } else if (r.status === 'PROCESSING' || r.status === 'REQUESTED') {
        processingCount += 1;
      } else if (r.status === 'FAILED') {
        failedCount += 1;
      }
    });

    return { totalCompletedMinor, completedCount, processingCount, failedCount };
  }, [refunds]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" data-testid="refunds-page">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-midnight-border/70 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight font-space-grotesk">
              Refunds & Savings Tracker
            </h1>
            <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-950/40 text-xs">
              Automated Reconciliations
            </Badge>
          </div>
          <p className="text-sm text-midnight-muted mt-1">
            Track multi-state refunds, bulk tier-drop savings returns, and order cancellation reimbursements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/payments')}
            className="gap-1.5 border-midnight-border/80 hover:bg-midnight-surface"
            data-testid="view-payments-btn"
          >
            <CreditCard className="h-4 w-4 text-emerald-400" />
            <span>View Payments Ledger</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-midnight-muted" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-1.5"
            data-testid="refresh-refunds-btn"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Mandatory Sandbox Transparency Disclosure (FR-PAY-011 / BR-012) */}
      <SandboxDisclosureBanner
        type="TEST_TRANSACTION"
        data-testid="sandbox-disclosure-banner"
      />

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border shadow-sm">
          <div className="flex items-center justify-between text-midnight-muted mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Total Refunded</span>
            <TrendingDown className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-space-grotesk text-white">
            {formatMinorToMajor(metrics.totalCompletedMinor, 'INR')}
          </div>
          <p className="text-xs text-midnight-muted mt-1">Returned to buyer accounts</p>
        </div>

        <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border shadow-sm">
          <div className="flex items-center justify-between text-midnight-muted mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Completed Refunds</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-space-grotesk text-white">
            {metrics.completedCount}
          </div>
          <p className="text-xs text-emerald-400/80 mt-1">Status: COMPLETED</p>
        </div>

        <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border shadow-sm">
          <div className="flex items-center justify-between text-midnight-muted mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">In Progress</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-space-grotesk text-white">
            {metrics.processingCount}
          </div>
          <p className="text-xs text-amber-300/80 mt-1">Requested or processing</p>
        </div>

        <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border shadow-sm">
          <div className="flex items-center justify-between text-midnight-muted mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Failed Reversals</span>
            <XCircle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-space-grotesk text-white">
            {metrics.failedCount}
          </div>
          <p className="text-xs text-midnight-muted mt-1">Requires admin review</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-midnight-muted pointer-events-none" />
            <Input
              type="text"
              placeholder="Search by Refund ID or Payment ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-midnight-surface/80"
              data-testid="search-refunds-input"
            />
          </div>

          <div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-midnight-surface/80"
              data-testid="filter-refund-status-select"
            >
              <option value="ALL">All Refund Statuses</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="PROCESSING">PROCESSING</option>
              <option value="REQUESTED">REQUESTED</option>
              <option value="FAILED">FAILED</option>
            </Select>
          </div>

          <div>
            <Select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="w-full bg-midnight-surface/80"
              data-testid="filter-refund-reason-select"
            >
              <option value="ALL">All Refund Reasons</option>
              <option value="TIER_PRICE_DROP_SAVINGS">Tier Price Drop Savings</option>
              <option value="BUYER_WITHDRAWAL">Buyer Withdrawal (Pre-Lock)</option>
              <option value="QUANTITY_REDUCTION">Quantity Reduction Delta</option>
              <option value="POOL_CANCELLED">Pool Cancelled</option>
              <option value="UNDER_MOQ_BUYER_CANCEL">Under-MOQ Cancelled</option>
              <option value="UNDER_MOQ_NO_RESPONSE">Under-MOQ Expired (24h)</option>
              <option value="SUPPLIER_REJECTED">Wholesaler Declined PO</option>
              <option value="EXTRA_PAYMENT_FAILURE_ROLLBACK">Rollback Refund</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error" icon={AlertCircle}>
          <AlertTitle>Unable to load refunds</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-4">
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3 p-4 bg-midnight-card border border-midnight-border rounded-xl">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {/* Refunds Table */}
      {!loading && !error && (
        <div className="rounded-xl border border-midnight-border overflow-hidden bg-midnight-card shadow-lg">
          <Table data-testid="refunds-table">
            <TableHeader>
              <TableRow className="border-b border-midnight-border bg-midnight-surface/80">
                <TableHead className="font-semibold text-white">Date & ID</TableHead>
                <TableHead className="font-semibold text-white">Reason</TableHead>
                <TableHead className="font-semibold text-white text-right">Amount</TableHead>
                <TableHead className="font-semibold text-white">Provider Refund ID</TableHead>
                <TableHead className="font-semibold text-white">Source Payment</TableHead>
                <TableHead className="font-semibold text-white text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRefunds.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  message="No refund records match the selected filters."
                />
              ) : (
                filteredRefunds.map((item) => {
                  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.REQUESTED;
                  const reasonConfig = REASON_CONFIG[item.reason] || {
                    label: item.reason,
                    desc: '',
                    variant: 'outline',
                  };

                  return (
                    <TableRow
                      key={item._id}
                      className="hover:bg-midnight-surface/50 border-b border-midnight-border/40 transition-colors"
                      data-testid={`refund-row-${item._id}`}
                    >
                      {/* Date & ID */}
                      <TableCell>
                        <div className="font-medium text-white text-xs">
                          {formatDate(item.createdAt)}
                        </div>
                        <div className="text-[11px] font-mono text-midnight-muted truncate max-w-[140px]">
                          {item._id}
                        </div>
                      </TableCell>

                      {/* Reason */}
                      <TableCell>
                        <Badge variant={reasonConfig.variant} className="text-xs">
                          {reasonConfig.label}
                        </Badge>
                        {reasonConfig.desc && (
                          <div className="text-[11px] text-midnight-muted mt-0.5 truncate max-w-[200px]">
                            {reasonConfig.desc}
                          </div>
                        )}
                        {item.failureReason && (
                          <div className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                            <XCircle className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[200px]">{item.failureReason}</span>
                          </div>
                        )}
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="text-right">
                        <div className="font-bold font-space-grotesk text-purple-300 text-sm">
                          +{formatMinorToMajor(item.amountMinor, item.currency)}
                        </div>
                        <div className="text-[10px] text-midnight-muted uppercase">
                          {item.currency || 'INR'}
                        </div>
                      </TableCell>

                      {/* Provider Refund ID */}
                      <TableCell>
                        {item.providerRefundId ? (
                          <span className="font-mono text-xs text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/30 select-all">
                            {item.providerRefundId}
                          </span>
                        ) : (
                          <span className="text-xs text-midnight-muted">—</span>
                        )}
                      </TableCell>

                      {/* Source Payment ID */}
                      <TableCell>
                        <div className="font-mono text-xs text-midnight-muted truncate max-w-[140px] select-all">
                          {item.paymentId ? `Pay: ${String(item.paymentId?._id || item.paymentId).slice(-8)}` : '—'}
                        </div>
                        {item.poolId && (
                          <div className="text-[10px] text-midnight-muted truncate max-w-[140px]">
                            {typeof item.poolId === 'object'
                              ? (item.poolId.title || `Pool: ${String(item.poolId._id).slice(-8)}`)
                              : `Pool: ${String(item.poolId).slice(-8)}`}
                          </div>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-center">
                        <Badge variant={statusConfig.variant} className="text-xs font-semibold">
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Empty State Banner when no records exist at all */}
      {!loading && !error && refunds.length === 0 && (
        <div
          className="text-center py-12 p-8 rounded-xl bg-midnight-card border border-midnight-border space-y-4"
          data-testid="refunds-empty-state"
        >
          <div className="p-4 rounded-full bg-midnight-surface inline-block border border-midnight-border text-midnight-muted">
            <RotateCcw className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No refunds recorded</h3>
          <p className="text-xs text-midnight-muted max-w-md mx-auto">
            You do not have any pending or completed refund transactions.
            Any tier-drop bulk savings or order cancellation returns will automatically appear here.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/payments')}
          >
            Go to Payments Ledger
          </Button>
        </div>
      )}
    </div>
  );
}

export default RefundsPage;
