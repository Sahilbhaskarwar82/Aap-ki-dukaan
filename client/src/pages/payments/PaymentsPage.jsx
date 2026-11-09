import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  Receipt,
  ArrowUpRight,
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

const PURPOSE_META = {
  INITIAL_JOIN: {
    label: 'Initial Join',
    desc: 'Pay-at-join initial pool commitment',
    variant: 'default',
  },
  QUANTITY_INCREASE_DELTA: {
    label: 'Quantity Delta',
    desc: 'Additional boxes added to commitment',
    variant: 'secondary',
  },
  POST_APPROVAL_FINAL: {
    label: 'Post-Approval Final',
    desc: 'Outstanding balance upon snapshot lock',
    variant: 'outline',
  },
  UNDER_MOQ_SURCHARGE: {
    label: 'Under-MOQ Surcharge',
    desc: 'Agreed wholesale freight/box surcharge',
    variant: 'warning',
  },
};

const STATUS_VARIANTS = {
  PAID: { variant: 'success', label: 'PAID', icon: CheckCircle2, textClass: 'text-emerald-400' },
  CREATED: { variant: 'outline', label: 'CREATED', icon: Clock, textClass: 'text-sky-400' },
  CAPTURE_PENDING: { variant: 'warning', label: 'CAPTURE PENDING', icon: Clock, textClass: 'text-amber-400' },
  CANCELLED: { variant: 'secondary', label: 'CANCELLED', icon: XCircle, textClass: 'text-midnight-muted' },
  FAILED: { variant: 'destructive', label: 'FAILED', icon: XCircle, textClass: 'text-rose-400' },
  REFUNDED: { variant: 'outline', label: 'REFUNDED', icon: RotateCcw, textClass: 'text-purple-400' },
  PARTIALLY_REFUNDED: { variant: 'outline', label: 'PARTIAL REFUND', icon: RotateCcw, textClass: 'text-amber-300' },
  UNKNOWN: { variant: 'destructive', label: 'UNKNOWN', icon: AlertCircle, textClass: 'text-amber-500' },
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
 * PaymentsPage (SUJ-06)
 *
 * Buyer transaction ledger displaying all payments, statuses, provider tracking IDs,
 * and sandbox transparency disclosures.
 */
export function PaymentsPage() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [purposeFilter, setPurposeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch payments
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await paymentsApi.listPayments({ page: 1, limit: 100 });
        if (!cancelled) {
          setPayments(res.payments || []);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || err.message || 'Failed to load payments ledger.');
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

  // Derived filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter((item) => {
      if (statusFilter !== 'ALL' && item.paymentStatus !== statusFilter) {
        return false;
      }
      if (purposeFilter !== 'ALL' && item.paymentPurpose !== purposeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesOrder = item.providerOrderId?.toLowerCase().includes(q);
        const matchesCapture = item.providerCaptureId?.toLowerCase().includes(q);
        const matchesId = item._id?.toLowerCase().includes(q);
        const matchesPool = typeof item.poolId === 'object'
          ? item.poolId?.title?.toLowerCase().includes(q)
          : String(item.poolId || '').toLowerCase().includes(q);
        if (!matchesOrder && !matchesCapture && !matchesId && !matchesPool) {
          return false;
        }
      }
      return true;
    });
  }, [payments, statusFilter, purposeFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalPaidPaise = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let failedOrCancelledCount = 0;

    payments.forEach((p) => {
      if (p.paymentStatus === 'PAID') {
        totalPaidPaise += p.amountMinor || 0;
        paidCount += 1;
      } else if (p.paymentStatus === 'CREATED' || p.paymentStatus === 'CAPTURE_PENDING') {
        pendingCount += 1;
      } else if (p.paymentStatus === 'FAILED' || p.paymentStatus === 'CANCELLED') {
        failedOrCancelledCount += 1;
      }
    });

    return { totalPaidPaise, paidCount, pendingCount, failedOrCancelledCount };
  }, [payments]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" data-testid="payments-page">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-midnight-border/70 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight font-space-grotesk">
              Payments & Settlement Ledger
            </h1>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-950/40 text-xs">
              Live Escrow
            </Badge>
          </div>
          <p className="text-sm text-midnight-muted mt-1">
            Paise-accurate transaction history with authoritative PayPal Sandbox verification and capture IDs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/refunds')}
            className="gap-1.5 border-midnight-border/80 hover:bg-midnight-surface"
            data-testid="view-refunds-btn"
          >
            <RotateCcw className="h-4 w-4 text-purple-400" />
            <span>View Refunds Tracker</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-midnight-muted" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-1.5"
            data-testid="refresh-payments-btn"
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
            <span className="text-xs uppercase tracking-wider font-semibold">Total Settled</span>
            <Receipt className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-space-grotesk text-white">
            {formatMinorToMajor(metrics.totalPaidPaise, 'INR')}
          </div>
          <p className="text-xs text-midnight-muted mt-1">Across all verified captures</p>
        </div>

        <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border shadow-sm">
          <div className="flex items-center justify-between text-midnight-muted mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Verified Payments</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-space-grotesk text-white">
            {metrics.paidCount}
          </div>
          <p className="text-xs text-emerald-400/80 mt-1">Status: PAID</p>
        </div>

        <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border shadow-sm">
          <div className="flex items-center justify-between text-midnight-muted mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Pending / In-Flight</span>
            <Clock className="h-4 w-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-space-grotesk text-white">
            {metrics.pendingCount}
          </div>
          <p className="text-xs text-midnight-muted mt-1">Awaiting checkout approval</p>
        </div>

        <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border shadow-sm">
          <div className="flex items-center justify-between text-midnight-muted mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Cancelled / Failed</span>
            <XCircle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-space-grotesk text-white">
            {metrics.failedOrCancelledCount}
          </div>
          <p className="text-xs text-midnight-muted mt-1">Buyer dismissed or timed out</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 rounded-xl bg-midnight-card border border-midnight-border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-midnight-muted pointer-events-none" />
            <Input
              type="text"
              placeholder="Search by Order ID or Capture ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-midnight-surface/80"
              data-testid="search-payments-input"
            />
          </div>

          <div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-midnight-surface/80"
              data-testid="filter-status-select"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="PAID">PAID (Captured)</option>
              <option value="CREATED">CREATED (Pending)</option>
              <option value="CAPTURE_PENDING">CAPTURE PENDING</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="FAILED">FAILED</option>
              <option value="REFUNDED">REFUNDED</option>
              <option value="PARTIALLY_REFUNDED">PARTIALLY REFUNDED</option>
            </Select>
          </div>

          <div>
            <Select
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value)}
              className="w-full bg-midnight-surface/80"
              data-testid="filter-purpose-select"
            >
              <option value="ALL">All Payment Purposes</option>
              <option value="INITIAL_JOIN">Initial Join (Pay-at-Join)</option>
              <option value="QUANTITY_INCREASE_DELTA">Quantity Increase Delta</option>
              <option value="POST_APPROVAL_FINAL">Post-Approval Final</option>
              <option value="UNDER_MOQ_SURCHARGE">Under-MOQ Surcharge</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error" icon={AlertCircle}>
          <AlertTitle>Unable to load payments</AlertTitle>
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

      {/* Payments Table */}
      {!loading && !error && (
        <div className="rounded-xl border border-midnight-border overflow-hidden bg-midnight-card shadow-lg">
          <Table data-testid="payments-table">
            <TableHeader>
              <TableRow className="border-b border-midnight-border bg-midnight-surface/80">
                <TableHead className="font-semibold text-white">Date & ID</TableHead>
                <TableHead className="font-semibold text-white">Purpose</TableHead>
                <TableHead className="font-semibold text-white text-right">Amount</TableHead>
                <TableHead className="font-semibold text-white">Provider</TableHead>
                <TableHead className="font-semibold text-white">Provider Order ID</TableHead>
                <TableHead className="font-semibold text-white">Capture ID</TableHead>
                <TableHead className="font-semibold text-white text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.length === 0 ? (
                <TableEmpty
                  colSpan={7}
                  message="No payment transactions match the selected filters."
                />
              ) : (
                filteredPayments.map((item) => {
                  const statusConfig = STATUS_VARIANTS[item.paymentStatus] || STATUS_VARIANTS.UNKNOWN;
                  const purposeConfig = PURPOSE_META[item.paymentPurpose] || {
                    label: item.paymentPurpose,
                    desc: '',
                    variant: 'outline',
                  };

                  return (
                    <TableRow
                      key={item._id}
                      className="hover:bg-midnight-surface/50 border-b border-midnight-border/40 transition-colors"
                      data-testid={`payment-row-${item._id}`}
                    >
                      {/* Date & ID */}
                      <TableCell>
                        <div className="font-medium text-white text-xs">
                          {formatDate(item.createdAt)}
                        </div>
                        <div className="text-[11px] font-mono text-midnight-muted truncate max-w-[140px]">
                          {item._id}
                        </div>
                        {item.poolId && (
                          <div className="text-[10px] text-midnight-muted truncate max-w-[140px]" title={typeof item.poolId === 'object' ? item.poolId.title : item.poolId}>
                            {typeof item.poolId === 'object' ? item.poolId.title : `Pool: ${String(item.poolId).slice(-8)}`}
                          </div>
                        )}
                      </TableCell>

                      {/* Purpose */}
                      <TableCell>
                        <Badge variant={purposeConfig.variant} className="text-xs">
                          {purposeConfig.label}
                        </Badge>
                        {purposeConfig.desc && (
                          <div className="text-[11px] text-midnight-muted mt-0.5 truncate max-w-[180px]">
                            {purposeConfig.desc}
                          </div>
                        )}
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="text-right">
                        <div className="font-bold font-space-grotesk text-white text-sm">
                          {formatMinorToMajor(item.amountMinor, item.currency)}
                        </div>
                        <div className="text-[10px] text-midnight-muted uppercase">
                          {item.currency || 'INR'}
                        </div>
                      </TableCell>

                      {/* Provider */}
                      <TableCell>
                        <Badge
                          variant={item.provider === 'PAYPAL_SANDBOX' ? 'outline' : 'secondary'}
                          className="text-[10px] uppercase tracking-wider gap-1"
                        >
                          <ShieldCheck className="h-3 w-3 text-emerald-400" />
                          {item.provider || 'PAYPAL_SANDBOX'}
                        </Badge>
                      </TableCell>

                      {/* Provider Order ID */}
                      <TableCell>
                        <span className="font-mono text-xs text-midnight-text bg-midnight-surface/80 px-2 py-0.5 rounded border border-midnight-border/60 select-all">
                          {item.providerOrderId || '—'}
                        </span>
                      </TableCell>

                      {/* Provider Capture ID */}
                      <TableCell>
                        {item.providerCaptureId ? (
                          <span className="font-mono text-xs text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30 select-all">
                            {item.providerCaptureId}
                          </span>
                        ) : (
                          <span className="text-xs text-midnight-muted">—</span>
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
      {!loading && !error && payments.length === 0 && (
        <div
          className="text-center py-12 p-8 rounded-xl bg-midnight-card border border-midnight-border space-y-4"
          data-testid="payments-empty-state"
        >
          <div className="p-4 rounded-full bg-midnight-surface inline-block border border-midnight-border text-midnight-muted">
            <CreditCard className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No payment transactions found</h3>
          <p className="text-xs text-midnight-muted max-w-md mx-auto">
            You haven't participated in any group-buy pools or processed payments yet.
            Join a pool from the marketplace to start aggregating regional demand.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/group-buys')}
          >
            Browse Group-Buy Pools
          </Button>
        </div>
      )}
    </div>
  );
}

export default PaymentsPage;
