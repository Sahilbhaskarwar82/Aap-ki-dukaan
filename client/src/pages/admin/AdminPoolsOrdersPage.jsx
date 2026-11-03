/**
 * CoBuy AI — Pools, Orders & Payment Reconciliation Workspace (SUJ-09 / SRU-10)
 *
 * Route: /admin/pools
 * Access: ADMIN (Full reconciliation & annotation), REVIEWER (Read-only)
 *
 * Implements:
 *  - Operational reconciliation workspace for stalled group-buy pools and under-MOQ exceptions
 *  - Immutable payment protection (FR-ADMIN-005): core payment facts (amountMinor, currency,
 *    providerOrderId, providerCaptureId, payerUserId, poolId, capturedAt) can NEVER be edited
 *  - Append-only reconciliation annotation via POST /api/admin/reconciliation/:paymentId/annotate
 *  - Inspection of failed refunds, expired supplier quotes, and AI execution exceptions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Clock,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Lock,
  ShieldCheck,
  Eye,
  ExternalLink,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatMinorToMajor } from '@/utils/money';
import {
  getReconciliationDashboard,
  annotatePayment,
} from '@/api/admin.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
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

export function AdminPoolsOrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotifications();

  const isAdmin = user?.role === 'ADMIN';
  const isReviewer = user?.role === 'REVIEWER';

  const [activeTab, setActiveTab] = useState('PAYMENTS'); // 'PAYMENTS' | 'POOLS' | 'REFUNDS' | 'QUOTES'
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

  // Annotate Modal State (FR-ADMIN-005)
  const [annotateModalOpen, setAnnotateModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [syncWithProvider, setSyncWithProvider] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getReconciliationDashboard();
      setReconciliation(data);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load reconciliation data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Annotate Modal
  const handleOpenAnnotate = (payment) => {
    if (!isAdmin) return;
    setSelectedPayment(payment);
    setNoteText('');
    setSyncWithProvider(false);
    setAnnotateModalOpen(true);
  };

  // Submit Annotation
  const handleSubmitAnnotation = async (e) => {
    e.preventDefault();
    if (!selectedPayment || !isAdmin) return;

    if (!noteText.trim()) {
      notify?.('Please enter a reconciliation note.', 'error');
      return;
    }

    try {
      setSubmittingNote(true);
      await annotatePayment(selectedPayment._id, {
        note: noteText.trim(),
        syncWithProvider,
      });

      notify?.('Reconciliation note appended without modifying captured transaction facts.', 'success');
      setAnnotateModalOpen(false);
      setSelectedPayment(null);
      setNoteText('');
      await loadData();
    } catch (err) {
      notify?.(
        err?.response?.data?.message || err?.message || 'Failed to record reconciliation note.',
        'error'
      );
    } finally {
      setSubmittingNote(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-6" data-testid="admin-pools-orders-page">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <DollarSign className="h-6 w-6 text-amber-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Pools & Payment Reconciliation Workspace</h1>
            <Badge variant="outline">FR-ADMIN-005 Immutability Guard</Badge>
            <Badge variant={isAdmin ? 'neutral' : 'warning'}>
              {isAdmin ? 'ADMIN RECONCILER' : 'REVIEWER READ-ONLY'}
            </Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Resolve stalled group-buys, inspect payment exceptions, and append immutable audit notes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
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
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Catalogue Offers
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/pools')}
          className="px-3 py-1.5 rounded-lg bg-midnight-surface border border-midnight-border text-white font-medium"
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
          <AlertTitle className="text-xs font-semibold">Reviewer Mode Active</AlertTitle>
          <AlertDescription className="text-xs">
            Reviewers can audit reconciliation exceptions and view payment histories, but cannot append reconciliation notes or trigger provider state synchronizations.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Reconciliation Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadData} className="ml-4">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Reconciliation Workspace Tabs ── */}
      <div className="flex items-center gap-2 border-b border-midnight-border pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('PAYMENTS')}
          className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'PAYMENTS'
              ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
              : 'text-midnight-muted hover:text-white'
          }`}
        >
          <DollarSign className="h-3.5 w-3.5" />
          Attention Payments ({reconciliation.attentionPayments?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('POOLS')}
          className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'POOLS'
              ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
              : 'text-midnight-muted hover:text-white'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Stalled Pools ({reconciliation.stalledPools?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REFUNDS')}
          className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'REFUNDS'
              ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
              : 'text-midnight-muted hover:text-white'
          }`}
        >
          <XCircle className="h-3.5 w-3.5" />
          Failed Refunds ({reconciliation.failedRefunds?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('QUOTES')}
          className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'QUOTES'
              ? 'bg-yellow-950/60 text-yellow-300 border border-yellow-800/60'
              : 'text-midnight-muted hover:text-white'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Expired Quotes ({reconciliation.expiredQuotes?.length || 0})
        </button>
      </div>

      {/* ── Tab Content: Attention Payments (FR-ADMIN-005) ── */}
      {activeTab === 'PAYMENTS' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-midnight-card border border-midnight-border space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              FR-ADMIN-005 Immutable Payment Integrity Architecture
            </div>
            <p className="text-[11px] text-midnight-muted leading-relaxed">
              In accordance with financial ledger integrity, core payment records (amount, currency, PayPal Order ID, Capture ID, payer ID, pool allocation, captured timestamp) cannot be altered or overwritten by any user or administrator. Administrators may append chronological reconciliation notes and optionally invoke provider state sync.
            </p>
          </div>

          <div className="bg-midnight-card border border-midnight-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Provider Details</TableHead>
                  <TableHead>Captured At</TableHead>
                  <TableHead>Reconciliation Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : reconciliation.attentionPayments?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-midnight-muted text-xs">
                      <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1 opacity-70" />
                      Zero unresolved payments. All captured payments match gateway settlement.
                    </TableCell>
                  </TableRow>
                ) : (
                  reconciliation.attentionPayments.map((pay) => (
                    <TableRow key={pay._id} data-testid={`payment-row-${pay._id}`}>
                      {/* Payment ID & Purpose */}
                      <TableCell className="font-mono text-xs">
                        <div className="font-bold text-white">{pay.paymentId || pay._id}</div>
                        <div className="text-[10px] text-midnight-muted">{pay.paymentPurpose || 'POOL_JOIN'}</div>
                      </TableCell>

                      {/* Status (Actual model field: paymentStatus) */}
                      <TableCell>
                        <Badge
                          variant={
                            pay.paymentStatus === 'PAID'
                              ? 'success'
                              : pay.paymentStatus === 'CAPTURE_PENDING'
                              ? 'warning'
                              : 'error'
                          }
                        >
                          {pay.paymentStatus}
                        </Badge>
                      </TableCell>

                      {/* Amount */}
                      <TableCell>
                        <span className="font-mono font-bold text-teal-300">
                          {formatMinorToMajor(pay.amountMinor, pay.currency)}
                        </span>
                      </TableCell>

                      {/* Provider Details */}
                      <TableCell className="text-xs text-midnight-muted font-mono">
                        <div>{pay.provider || 'PAYPAL_SANDBOX'}</div>
                        {pay.providerCaptureId && (
                          <div className="text-[10px] text-slate-400">Cap: {pay.providerCaptureId}</div>
                        )}
                        {pay.providerOrderId && (
                          <div className="text-[10px] text-slate-500">Order: {pay.providerOrderId}</div>
                        )}
                      </TableCell>

                      {/* Captured At */}
                      <TableCell className="text-xs text-midnight-muted font-mono">
                        {pay.capturedAt ? new Date(pay.capturedAt).toLocaleString() : 'Uncaptured'}
                      </TableCell>

                      {/* Reconciliation Notes */}
                      <TableCell className="text-xs">
                        {pay.reconciliationNotes?.length > 0 ? (
                          <div className="space-y-1 max-w-xs">
                            <span className="text-amber-300 font-semibold text-[11px]">
                              {pay.reconciliationNotes.length} note{pay.reconciliationNotes.length > 1 ? 's' : ''}
                            </span>
                            <div className="text-[10px] text-midnight-muted truncate italic">
                              Latest: "{pay.reconciliationNotes[pay.reconciliationNotes.length - 1].note}"
                            </div>
                          </div>
                        ) : (
                          <span className="text-midnight-muted text-[11px] italic">No notes</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        {isAdmin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAnnotate(pay)}
                            className="text-xs h-7 px-2.5"
                            data-testid={`annotate-payment-${pay._id}`}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Annotate
                          </Button>
                        ) : (
                          <span className="text-[11px] text-midnight-muted">Read-Only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Tab Content: Stalled Pools ── */}
      {activeTab === 'POOLS' && (
        <div className="bg-midnight-card border border-midnight-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pool ID / Product</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Progress (MOQ)</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : reconciliation.stalledPools?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-midnight-muted text-xs">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1 opacity-70" />
                    No stalled pools requiring manual administrative resolution.
                  </TableCell>
                </TableRow>
              ) : (
                reconciliation.stalledPools.map((pool) => (
                  <TableRow key={pool._id}>
                    <TableCell className="font-medium text-white">
                      <div className="font-bold text-sm">
                        {pool.productName || pool.productId?.name || pool.poolNumber || pool._id}
                      </div>
                      <div className="font-mono text-[10px] text-midnight-muted">{pool._id}</div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="warning">{pool.state}</Badge>
                    </TableCell>

                    <TableCell className="text-xs font-mono">
                      <div>
                        {pool.totalQuantity || pool.totalEligibleQuantity || 0} / {pool.targetMoq || 100} units
                      </div>
                      <div className="text-[10px] text-rose-300">
                        Shortfall: {Math.max(0, (pool.targetMoq || 100) - (pool.totalQuantity || pool.totalEligibleQuantity || 0))} units
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-midnight-muted font-mono">
                      {pool.deadlineAt ? new Date(pool.deadlineAt).toLocaleString() : 'N/A'}
                    </TableCell>

                    <TableCell className="text-xs text-midnight-muted">
                      {pool.supplierName || pool.supplierId?.name || 'Assigned Wholesaler'}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/group-buys/${pool._id}`)}
                        className="text-xs h-7 px-2.5"
                      >
                        Inspect Pool <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Tab Content: Failed Refunds ── */}
      {activeTab === 'REFUNDS' && (
        <div className="bg-midnight-card border border-midnight-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Refund ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Failure Reason</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : reconciliation.failedRefunds?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-midnight-muted text-xs">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1 opacity-70" />
                    Zero failed refunds.
                  </TableCell>
                </TableRow>
              ) : (
                reconciliation.failedRefunds.map((ref) => (
                  <TableRow key={ref._id}>
                    <TableCell className="font-mono text-xs font-bold text-white">
                      {ref.refundId || ref._id}
                    </TableCell>

                    <TableCell>
                      <Badge variant="error">{ref.status}</Badge>
                    </TableCell>

                    <TableCell className="font-mono font-bold text-rose-300 text-xs">
                      {formatMinorToMajor(ref.amountMinor, ref.currency)}
                    </TableCell>

                    <TableCell className="text-xs text-midnight-muted">{ref.reason}</TableCell>

                    <TableCell className="text-xs text-rose-400">
                      {ref.failureReason || 'Gateway communication failure'}
                    </TableCell>

                    <TableCell className="text-xs text-midnight-muted font-mono">
                      {new Date(ref.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Tab Content: Expired Quotes ── */}
      {activeTab === 'QUOTES' && (
        <div className="bg-midnight-card border border-midnight-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote Reference</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Quoted Price</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : reconciliation.expiredQuotes?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-midnight-muted text-xs">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1 opacity-70" />
                    Zero expired quotes pending refresh.
                  </TableCell>
                </TableRow>
              ) : (
                reconciliation.expiredQuotes.map((q) => (
                  <TableRow key={q._id}>
                    <TableCell className="font-mono text-xs font-bold text-white">{q._id}</TableCell>
                    <TableCell className="text-xs text-white">
                      {q.supplierId?.name || String(q.supplierId) || 'Supplier'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-teal-300">
                      {formatMinorToMajor(q.unitPriceMinor || 0, q.currency || 'INR')}
                    </TableCell>
                    <TableCell className="text-xs text-amber-400 font-mono">
                      {q.validUntil ? new Date(q.validUntil).toLocaleString() : 'Expired'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">{q.status || 'EXPIRED'}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Modal: Annotate Payment (FR-ADMIN-005 Append Only) ── */}
      <Dialog open={annotateModalOpen} onOpenChange={setAnnotateModalOpen}>
        <DialogContent className="max-w-lg bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Append Payment Reconciliation Note
            </DialogTitle>
            <DialogDescription className="text-xs text-midnight-muted">
              Record immutable administrative findings for payment {selectedPayment?.paymentId}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitAnnotation} className="space-y-4 py-2 text-xs">
            {/* Immutable Protected Facts Card */}
            <div className="p-3 rounded-lg bg-midnight-surface border border-midnight-border space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                  Protected Transaction Ledger Facts:
                </span>
                <span className="text-[10px] text-emerald-400">NON-EDITABLE</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-midnight-muted pt-1">
                <div>
                  Amount:{' '}
                  <strong className="text-teal-300 font-mono">
                    {formatMinorToMajor(selectedPayment?.amountMinor, selectedPayment?.currency)}
                  </strong>
                </div>
                <div>
                  Status:{' '}
                  <strong className="text-white font-mono">{selectedPayment?.paymentStatus}</strong>
                </div>
                <div>
                  Provider: <strong className="text-white">{selectedPayment?.provider}</strong>
                </div>
                <div>
                  Capture ID:{' '}
                  <strong className="text-slate-300 font-mono">
                    {selectedPayment?.providerCaptureId || 'None'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Existing Notes History */}
            {selectedPayment?.reconciliationNotes?.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-semibold text-slate-300">Previous Reconciliation Notes:</span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-midnight-surface border border-midnight-border">
                  {selectedPayment.reconciliationNotes.map((n, idx) => (
                    <div key={idx} className="p-2 rounded bg-midnight-card/80 border border-midnight-border/50 text-[11px]">
                      <div className="flex items-center justify-between text-midnight-muted text-[10px] mb-0.5">
                        <span className="font-semibold text-teal-300">Author: {n.author || 'ADMIN'}</span>
                        <span className="font-mono">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</span>
                      </div>
                      <p className="text-slate-200">{n.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New Note Textarea */}
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">New Reconciliation Note *</label>
              <textarea
                rows={3}
                className="w-full rounded-lg bg-midnight-surface border border-midnight-border p-2.5 text-white text-xs focus:border-teal-400 focus:outline-none resize-none"
                placeholder="Document verification findings, manual settlement references, or provider dispute ID..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>

            {/* Provider Sync Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="syncWithProvider"
                className="rounded border-midnight-border bg-midnight-surface text-teal-400 focus:ring-teal-400"
                checked={syncWithProvider}
                onChange={(e) => setSyncWithProvider(e.target.checked)}
              />
              <label htmlFor="syncWithProvider" className="text-slate-300 text-xs cursor-pointer select-none">
                Trigger Gateway State Synchronization (reconcile with PayPal/provider)
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAnnotateModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={submittingNote || !noteText.trim()} type="submit">
                {submittingNote ? 'Recording...' : 'Append Reconciliation Note'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminPoolsOrdersPage;
