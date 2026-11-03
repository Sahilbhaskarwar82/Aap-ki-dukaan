/**
 * CoBuy AI — Platform Audit Trail & AI Execution Trace Inspector (SUJ-09 / SRU-10)
 *
 * Route: /admin/audit
 * Access: ADMIN, REVIEWER (Both read-only; logs are strictly immutable)
 *
 * Features:
 *  - Searchable, filterable, paginated inspection of the immutable AuditLog collection
 *  - Filters by correlationId, action, resourceType, actorRole, actorId, poolId, orderId
 *  - Inspects execution metadata, actor provenance, and timestamps
 *  - Zero mutation controls (audit logs are cryptographically and architecturally immutable)
 *  - Discloses AIExecutionLog architecture and backend listing endpoint dependency
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  RotateCcw,
  Cpu,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Code,
  Copy,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { getAuditLogs } from '@/api/admin.api';

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

const RESOURCE_TYPES = [
  'USER',
  'SHOP',
  'SUPPLIER',
  'REQUIREMENT',
  'UPLOAD',
  'OFFER',
  'QUOTE',
  'POOL',
  'CONTRIBUTION',
  'PRICE_SNAPSHOT',
  'PAYMENT',
  'REFUND',
  'ORDER',
  'SETTLEMENT',
];

const ACTOR_ROLES = [
  'SHOP_OWNER',
  'SUPPLIER',
  'ADMIN',
  'REVIEWER',
  'SYSTEM_SCHEDULER',
  'WEBHOOK',
];

export function AdminAuditLogsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 1 });

  // Filter States
  const [correlationId, setCorrelationId] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('ALL');
  const [actorRole, setActorRole] = useState('ALL');
  const [poolId, setPoolId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Metadata Inspection Modal State
  const [selectedLog, setSelectedLog] = useState(null);
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);

  // Fetch Audit Logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: currentPage,
        limit: 25,
      };

      if (correlationId.trim()) params.correlationId = correlationId.trim();
      if (action.trim()) params.action = action.trim();
      if (resourceType !== 'ALL') params.resourceType = resourceType;
      if (actorRole !== 'ALL') params.actorRole = actorRole;
      if (poolId.trim()) params.poolId = poolId.trim();
      if (orderId.trim()) params.orderId = orderId.trim();

      const data = await getAuditLogs(params);
      setLogs(data.auditLogs || []);
      setPagination({
        total: data.total || 0,
        page: data.page || 1,
        limit: data.limit || 25,
        pages: data.pages || 1,
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to retrieve audit logs.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, correlationId, action, resourceType, actorRole, poolId, orderId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleOpenMetadata = (log) => {
    setSelectedLog(log);
    setMetadataModalOpen(true);
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard?.writeText(text);
    notify?.(`Copied ${label} to clipboard.`, 'info');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-6" data-testid="admin-audit-logs-page">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <FileText className="h-6 w-6 text-cyan-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Platform Audit Trail & Security Logs</h1>
            <Badge variant="outline">Immutable Log Store</Badge>
            <Badge variant={user?.role === 'ADMIN' ? 'neutral' : 'warning'}>
              {user?.role === 'ADMIN' ? 'ADMIN AUDITOR' : 'REVIEWER AUDITOR'}
            </Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Tamper-evident operational audit trail recording state transitions, actor roles, resource IDs, and correlations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Logs
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
          className="px-3 py-1.5 rounded-lg text-midnight-muted hover:text-white hover:bg-midnight-surface/50 transition-colors"
        >
          Pools & Reconciliation
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/audit')}
          className="px-3 py-1.5 rounded-lg bg-midnight-surface border border-midnight-border text-white font-medium"
        >
          Audit Logs
        </button>
      </div>

      {/* ── AIExecutionLog Backend Dependency Notice ── */}
      <Alert variant="info" className="py-2.5">
        <Cpu className="h-4 w-4" />
        <AlertTitle className="text-xs font-semibold">AIExecutionLog Trace Source Notice</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          The records below are sourced from the immutable <code>AuditLog</code> collection. The CoBuy AI backend includes a dedicated <code>AIExecutionLog</code> model tracking prompt token counts, schema validations, and latency metrics; however, a dedicated listing endpoint (<code>GET /api/admin/ai-logs</code>) is not yet exposed by the backend controller. Failed AI execution exceptions are surfaced on the Operations Dashboard summary.
        </AlertDescription>
      </Alert>

      {/* ── Error Banner ── */}
      {error && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Audit Log Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={fetchLogs} className="ml-4">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Filter Controls ── */}
      <div className="bg-midnight-card border border-midnight-border rounded-xl p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {/* Action Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Action Keyword:</label>
            <input
              type="text"
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border px-2.5 py-1.5 text-white text-xs focus:border-cyan-400 focus:outline-none"
              placeholder="e.g. OFFER_CREATED"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Resource Type Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Resource Type:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-1.5 focus:border-cyan-400 focus:outline-none"
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Resources</option>
              {RESOURCE_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Actor Role Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Actor Role:</label>
            <select
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border text-white text-xs p-1.5 focus:border-cyan-400 focus:outline-none"
              value={actorRole}
              onChange={(e) => {
                setActorRole(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Roles</option>
              {ACTOR_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          {/* Correlation ID Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Correlation ID:</label>
            <input
              type="text"
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border px-2.5 py-1.5 text-white text-xs focus:border-cyan-400 focus:outline-none font-mono"
              placeholder="e.g. corr-12345"
              value={correlationId}
              onChange={(e) => {
                setCorrelationId(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Pool ID Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Pool ID:</label>
            <input
              type="text"
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border px-2.5 py-1.5 text-white text-xs focus:border-cyan-400 focus:outline-none font-mono"
              placeholder="e.g. pool_id"
              value={poolId}
              onChange={(e) => {
                setPoolId(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Order ID Filter */}
          <div>
            <label className="text-midnight-muted block mb-1 font-medium">Order ID:</label>
            <input
              type="text"
              className="w-full rounded-lg bg-midnight-surface border border-midnight-border px-2.5 py-1.5 text-white text-xs focus:border-cyan-400 focus:outline-none font-mono"
              placeholder="e.g. order_id"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Audit Logs Table ── */}
      <div className="bg-midnight-card border border-midnight-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor (Role & ID)</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Correlation ID</TableHead>
              <TableHead className="text-right">Inspection</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-midnight-muted text-xs">
                  No audit log entries found matching the specified query filters.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log._id} data-testid={`audit-row-${log._id}`}>
                  {/* Timestamp */}
                  <TableCell className="font-mono text-xs text-midnight-muted whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>

                  {/* Action */}
                  <TableCell>
                    <span className="font-mono font-semibold text-xs text-white">
                      {log.action}
                    </span>
                  </TableCell>

                  {/* Actor */}
                  <TableCell className="text-xs">
                    <Badge variant={log.actorRole === 'ADMIN' ? 'neutral' : 'outline'} className="text-[10px]">
                      {log.actorRole || 'SYSTEM'}
                    </Badge>
                    {log.actorId && (
                      <span className="font-mono text-[10px] text-midnight-muted block mt-0.5 truncate max-w-[120px]">
                        {String(log.actorId)}
                      </span>
                    )}
                  </TableCell>

                  {/* Resource */}
                  <TableCell className="text-xs">
                    <div className="font-semibold text-slate-300">{log.resourceType}</div>
                    <div className="font-mono text-[10px] text-midnight-muted truncate max-w-[140px]">
                      {String(log.resourceId || 'N/A')}
                    </div>
                  </TableCell>

                  {/* Correlation ID */}
                  <TableCell className="font-mono text-[11px] text-slate-400">
                    <span className="truncate max-w-[150px] inline-block" title={log.correlationId}>
                      {log.correlationId || 'N/A'}
                    </span>
                  </TableCell>

                  {/* Inspection Action */}
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenMetadata(log)}
                      className="text-xs h-7 px-2.5"
                      data-testid={`inspect-audit-${log._id}`}
                    >
                      <Code className="h-3 w-3 mr-1" />
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* ── Pagination Footer ── */}
        <div className="flex items-center justify-between p-3 border-t border-midnight-border text-xs text-midnight-muted">
          <span>
            Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.pages || 1}</strong> (Total {pagination.total} audit records)
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
              disabled={pagination.page >= pagination.pages || loading}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="h-7 px-2"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Modal: Metadata Inspector (Read-Only) ── */}
      <Dialog open={metadataModalOpen} onOpenChange={setMetadataModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-midnight-card border-midnight-border text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-cyan-400" />
              Audit Log Event Details: {selectedLog?.action}
            </DialogTitle>
            <DialogDescription className="text-xs text-midnight-muted">
              Immutable event payload captured at {selectedLog?.createdAt ? new Date(selectedLog.createdAt).toISOString() : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-midnight-surface rounded-lg border border-midnight-border font-mono text-[11px]">
              <div>
                <span className="text-midnight-muted">Log ID:</span>{' '}
                <span className="text-slate-200">{selectedLog?._id}</span>
              </div>
              <div>
                <span className="text-midnight-muted">Correlation ID:</span>{' '}
                <span className="text-teal-300">{selectedLog?.correlationId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-midnight-muted">Actor Role:</span>{' '}
                <span className="text-slate-200">{selectedLog?.actorRole}</span>
              </div>
              <div>
                <span className="text-midnight-muted">Actor ID:</span>{' '}
                <span className="text-slate-200">{String(selectedLog?.actorId || 'SYSTEM')}</span>
              </div>
              <div>
                <span className="text-midnight-muted">Resource Type:</span>{' '}
                <span className="text-slate-200">{selectedLog?.resourceType}</span>
              </div>
              <div>
                <span className="text-midnight-muted">Resource ID:</span>{' '}
                <span className="text-slate-200">{String(selectedLog?.resourceId || 'N/A')}</span>
              </div>
              {selectedLog?.poolId && (
                <div>
                  <span className="text-midnight-muted">Pool ID:</span>{' '}
                  <span className="text-amber-300">{String(selectedLog.poolId)}</span>
                </div>
              )}
              {selectedLog?.orderId && (
                <div>
                  <span className="text-midnight-muted">Order ID:</span>{' '}
                  <span className="text-teal-300">{String(selectedLog.orderId)}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">Raw Event Metadata:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(JSON.stringify(selectedLog?.metadata || {}, null, 2), 'metadata JSON')
                  }
                  className="h-6 text-[10px] px-2 text-midnight-muted hover:text-white"
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy JSON
                </Button>
              </div>

              <pre className="p-3 rounded-lg bg-midnight-surface border border-midnight-border text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-60">
                {JSON.stringify(selectedLog?.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMetadataModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminAuditLogsPage;
