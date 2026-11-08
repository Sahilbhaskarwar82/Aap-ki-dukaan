/**
 * CoBuy AI — Group Order Detail Page (SUJ-07 / SRU-05 / SRU-06 / SRU-07)
 *
 * Route: /orders/:orderId
 *
 * Displays:
 *  - Order details, product specifications, wholesale supplier information
 *  - Itemized per-shop member allocations (memberOrders) with buyer payment statuses
 *  - Separate Supplier Settlement Status Card with SIMULATED, PENDING, CONFIRMED statuses (Rule BR-009 & FR-PAY-016)
 *  - Download Purchase Order (PO) document & summary modal
 *  - Chronological ActivityTimeline
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package,
  ArrowLeft,
  FileText,
  Truck,
  Store,
  DollarSign,
  Download,
  Printer,
  ShieldCheck,
  Building2,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

import { formatMinorToMajor } from '@/utils/money';
import { getOrderById, getPoSummary, getOrderSettlement, getOrderActivity } from '@/api/orders.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { ActivityTimeline } from '@/components/common/ActivityTimeline';
import { SandboxDisclosureBanner } from '@/components/common/SandboxDisclosureBanner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // PO Summary Modal State
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSummary, setPoSummary] = useState(null);
  const [poLoading, setPoLoading] = useState(false);

  const loadOrderDetail = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      setError(null);
      const [orderData, settlementData, activityData] = await Promise.allSettled([
        getOrderById(orderId),
        getOrderSettlement(orderId),
        getOrderActivity(orderId),
      ]);

      if (orderData.status === 'fulfilled' && orderData.value) {
        setOrder(orderData.value);
      } else {
        throw new Error(orderData.reason?.response?.data?.message || 'Order not found');
      }

      if (settlementData.status === 'fulfilled' && settlementData.value) {
        setSettlement(settlementData.value);
      }

      if (activityData.status === 'fulfilled' && activityData.value) {
        const rawActivity = activityData.value;
        const list = Array.isArray(rawActivity)
          ? rawActivity
          : Array.isArray(rawActivity?.activity)
          ? rawActivity.activity
          : [];
        setActivity(list);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load order details.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrderDetail();
  }, [loadOrderDetail]);

  // Open PO Summary modal and fetch JSON summary
  const handleOpenPoSummary = async () => {
    try {
      setPoLoading(true);
      setPoModalOpen(true);
      const poData = await getPoSummary(orderId, 'json');
      setPoSummary(poData);
    } catch {
      // fallback handled gracefully
    } finally {
      setPoLoading(false);
    }
  };

  // Download official usable Purchase Order (HTML document with embedded styling)
  const handleDownloadPo = async () => {
    try {
      setPoLoading(true);
      const htmlContent = await getPoSummary(orderId, 'html');
      if (typeof htmlContent === 'string' && htmlContent.trim().length > 0) {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PO-${order?.orderNumber || orderId}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        // Fallback to JSON download if HTML is unavailable
        const jsonData = poSummary || (await getPoSummary(orderId, 'json'));
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PO-${order?.orderNumber || orderId}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch {
      // download fallback
    } finally {
      setPoLoading(false);
    }
  };

  const handlePrintPo = async () => {
    try {
      const htmlContent = await getPoSummary(orderId, 'html');
      if (typeof htmlContent === 'string') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        }
      } else {
        window.print();
      }
    } catch {
      window.print();
    }
  };

  // Format activity events for ActivityTimeline
  const timelineEvents = useMemo(() => {
    if (activity && activity.length > 0) {
      return activity.map((item) => ({
        action: item.action,
        actorRole: item.actorRole || 'SYSTEM',
        timestamp: item.createdAt || item.timestamp,
        description:
          item.metadata?.description ||
          item.metadata?.notes ||
          item.description ||
          `Order event: ${item.action}`,
      }));
    }

    if (!order) return [];

    return [
      {
        action: 'ORDER_CREATED',
        timestamp: order.createdAt,
        actorRole: 'SYSTEM_SCHEDULER',
        description: `Final Purchase Order created from funded group buy pool`,
      },
      ...(order.confirmedAt
        ? [
            {
              action: 'ORDER_CONFIRMED',
              timestamp: order.confirmedAt,
              actorRole: 'SUPPLIER',
              description: `Supplier confirmed order fulfillment`,
            },
          ]
        : []),
      ...(order.updatedAt && order.orderState !== 'AWAITING_SUPPLIER_CONFIRMATION'
        ? [
            {
              action: `ORDER_${order.orderState}`,
              timestamp: order.updatedAt,
              actorRole: 'SYSTEM',
              description: `Order status updated to ${order.orderState}`,
            },
          ]
        : []),
    ];
  }, [activity, order]);

  // Settlement Status & Disclosures
  const rawSettlementStatus =
    settlement?.settlementStatus || order?.supplierSettlementStatus || 'SIMULATED';

  const settlementStatusVariant = useMemo(() => {
    switch (rawSettlementStatus) {
      case 'CONFIRMED':
        return 'success';
      case 'PENDING':
        return 'warning';
      case 'SIMULATED':
      default:
        return 'neutral';
    }
  }, [rawSettlementStatus]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-8">
        <Alert variant="error">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Order Not Found</AlertTitle>
          <AlertDescription>
            {error || 'The requested purchase order could not be retrieved.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navigate('/orders')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Orders
        </Button>
      </div>
    );
  }

  const orderUnit = order.unit || order.packUnit || 'units';
  const totalUnits =
    order.totalQuantity ||
    order.memberOrders?.reduce((acc, m) => acc + (m.quantity || m.allocatedQuantity || 0), 0) ||
    0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="order-detail-page">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/orders')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Orders
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono text-white tracking-tight">
                {order.orderNumber || `AKD-${order._id.slice(-6)}`}
              </h1>
              <Badge variant="pool">{order.orderState === 'AWAITING_SUPPLIER_CONFIRMATION' ? 'PROCESSING' : (order.orderState || 'PROCESSING')}</Badge>
            </div>
            <p className="text-xs text-midnight-muted mt-0.5">
              Created on {new Date(order.createdAt).toLocaleDateString()} • Pool ID:{' '}
              <span className="font-mono text-slate-300">
                {order.poolId?._id || order.poolId}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={handleDownloadPo} disabled={poLoading}>
            <Download className="h-4 w-4 mr-1.5" /> Download PO
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenPoSummary} disabled={poLoading}>
            <FileText className="h-4 w-4 mr-1.5" /> Purchase Order (PO)
          </Button>
        </div>
      </div>

      <SandboxDisclosureBanner />

      {/* ── Main Order Summary Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Specifications, Allocations & Fulfillment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Product Specifications & Approved Pricing Card */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center justify-between border-b border-midnight-border/70 pb-3">
              <span className="flex items-center gap-2">
                <Package className="h-4 w-4 text-midnight-emerald" />
                Product & Wholesaler Specifications
              </span>
              {order.priceSnapshotId?.version && (
                <Badge variant="provenance">
                  Snapshot v{order.priceSnapshotId.version}
                </Badge>
              )}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2 p-3 bg-midnight-surface/60 rounded-lg border border-midnight-border/60">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <Package className="h-3.5 w-3.5 text-teal-400" />
                  Product Information
                </div>
                <div>
                  <span className="text-midnight-muted">Item Name:</span>
                  <p className="text-white font-medium text-sm">
                    {order.productId?.canonicalName || order.productId?.name || 'Bulk Wholesale Item'}
                  </p>
                </div>
                {order.productId?.category && (
                  <div>
                    <span className="text-midnight-muted">Category:</span>
                    <p className="text-slate-200">{order.productId.category}</p>
                  </div>
                )}
                {order.productId?.packDescription && (
                  <div>
                    <span className="text-midnight-muted">Pack Description:</span>
                    <p className="text-slate-300">{order.productId.packDescription}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2 p-3 bg-midnight-surface/60 rounded-lg border border-midnight-border/60">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <Building2 className="h-3.5 w-3.5 text-amber-400" />
                  Wholesale Supplier
                </div>
                <div>
                  <span className="text-midnight-muted">Wholesaler Name:</span>
                  <p className="text-white font-medium text-sm">
                    {order.supplierId?.name || 'Regional Wholesaler'}
                  </p>
                </div>
                <div>
                  <span className="text-midnight-muted">Service Regions:</span>
                  <p className="text-slate-300">
                    {order.supplierId?.serviceAreas?.join(', ') || 'Regional Hub'}
                  </p>
                </div>
                <div>
                  <span className="text-midnight-muted">Data Provenance:</span>
                  <p className="text-teal-300 font-mono">
                    {order.supplierId?.provenance || 'VERIFIED_SUPPLIER'}
                  </p>
                </div>
              </div>
            </div>

            {/* Approved Pricing Summary */}
            <div className="rounded-lg bg-midnight-surface/80 p-4 border border-midnight-border/70 space-y-2 text-xs">
              <div className="text-xs font-bold text-white uppercase tracking-wider pb-1 border-b border-midnight-border/60 flex justify-between">
                <span>Approved Frozen Pricing Terms</span>
                <span className="text-midnight-muted font-normal">
                  {order.priceSnapshotId?.shippingAllocationMethod || 'PER_UNIT'} •{' '}
                  {order.priceSnapshotId?.taxInclusion || 'GST_EXCLUDED'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <span className="text-midnight-muted">Total Pooled Qty:</span>
                  <p className="font-mono font-bold text-white">
                    {totalUnits} {orderUnit}
                  </p>
                </div>
                <div>
                  <span className="text-midnight-muted">Merchandise Total:</span>
                  <p className="font-mono font-bold text-white">
                    {formatMinorToMajor(order.merchandiseTotalMinor || 0, order.currency)}
                  </p>
                </div>
                <div>
                  <span className="text-midnight-muted">Shipping Total:</span>
                  <p className="font-mono font-bold text-white">
                    {formatMinorToMajor(order.shippingTotalMinor || 0, order.currency)}
                  </p>
                </div>
                <div>
                  <span className="text-midnight-muted">Grand Total:</span>
                  <p className="font-mono font-bold text-teal-300">
                    {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Member Kirana Allocations with Buyer Payment Statuses */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center justify-between border-b border-midnight-border/70 pb-3">
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4 text-midnight-emerald" />
                Member Kirana Allocations ({order.memberOrders?.length || 0})
              </span>
              <span className="text-xs font-mono text-teal-300 font-normal">
                Total: {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
              </span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-midnight-surface/80 text-midnight-muted uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Shop</th>
                    <th className="py-2.5 px-3">Allocated Qty</th>
                    <th className="py-2.5 px-3">Unit Price</th>
                    <th className="py-2.5 px-3">Merchandise Share</th>
                    <th className="py-2.5 px-3">Shipping Share</th>
                    <th className="py-2.5 px-3">Buyer Payment</th>
                    <th className="py-2.5 px-3 text-right">Delivery Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-midnight-border/50">
                  {(order.memberOrders || []).map((m, idx) => {
                    const shopDisplay =
                      m.shopName || m.shopId?.name || `Shop #${(m.shopId?._id || m.shopId || '').slice(-4)}`;
                    const qty = m.quantity || m.allocatedQuantity || 0;
                    const unit = m.unit || orderUnit;
                    const isPaid = (m.totalPaidMinor || 0) > 0;

                    return (
                      <tr key={idx} className="hover:bg-midnight-surface/30">
                        <td className="py-3 px-3 font-medium text-white">{shopDisplay}</td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {qty} {unit}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {formatMinorToMajor(m.unitPriceMinor || 0, order.currency)}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {formatMinorToMajor(m.merchandiseShareMinor || 0, order.currency)}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {formatMinorToMajor(m.shippingShareMinor || 0, order.currency)}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={isPaid ? 'success' : 'warning'}>
                              {isPaid ? 'PAID' : 'PENDING'}
                            </Badge>
                            <span className="font-mono text-[11px] text-teal-300">
                              {formatMinorToMajor(
                                m.totalPaidMinor || (m.merchandiseShareMinor + (m.shippingShareMinor || 0)),
                                order.currency
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Badge
                            variant={
                              m.deliveryStatus === 'DELIVERED'
                                ? 'success'
                                : m.deliveryStatus === 'DISPATCHED'
                                ? 'pool'
                                : 'neutral'
                            }
                          >
                            {m.deliveryStatus || 'PENDING'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Fulfillment & Dispatch Status */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-midnight-border/70 pb-3">
              <Truck className="h-4 w-4 text-teal-400" />
              Supplier Fulfillment & Dispatch Status
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-midnight-muted uppercase tracking-wider">
                  Wholesaler Confirmation
                </span>
                <div>
                  <Badge
                    variant={
                      order.supplierConfirmationStatus === 'CONFIRMED'
                        ? 'success'
                        : order.supplierConfirmationStatus === 'REJECTED'
                        ? 'error'
                        : 'warning'
                    }
                  >
                    {order.supplierConfirmationStatus === 'REJECTED' ? 'REJECTED' : 'CONFIRMED'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-midnight-muted uppercase tracking-wider">
                  Carrier / Logistics
                </span>
                <p className="font-medium text-white">
                  {order.carrierName || 'Regional Bulk Carrier'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-midnight-muted uppercase tracking-wider">
                  Tracking Reference
                </span>
                <p className="font-mono text-teal-300">
                  {order.deliveryTrackingNumber || 'TRK-2026-PENDING'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-midnight-muted uppercase tracking-wider">
                  Expected Delivery
                </span>
                <p className="font-medium text-slate-300 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-midnight-muted" />
                  {order.expectedDeliveryDate
                    ? new Date(order.expectedDeliveryDate).toLocaleDateString()
                    : 'Wholesaler Scheduled'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Supplier Settlement & Audit Trail */}
        <div className="space-y-6">
          {/* Wholesaler Payout Settlement Card (Rule BR-009 & FR-PAY-016) */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <div className="border-b border-midnight-border/70 pb-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-midnight-emerald" />
                  Wholesaler Settlement
                </h3>
                <Badge variant={settlementStatusVariant}>
                  {rawSettlementStatus}
                </Badge>
              </div>
              <p className="text-[11px] text-midnight-muted mt-1">
                Independent payout ledger tracking wholesaler remittance
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="warning">SIMULATED SETTLEMENT</Badge>
              <Badge variant="outline" className="text-[10px]">
                {settlement?.mode || 'DEMO MODE'}
              </Badge>
            </div>

            <div className="rounded-lg bg-midnight-surface/60 border border-midnight-border/60 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-midnight-muted">Settlement Status:</span>
                <span className="font-mono font-bold text-white">
                  {rawSettlementStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight-muted">Settlement Mode:</span>
                <span className="font-mono text-amber-300 font-bold">
                  {settlement?.mode || 'DEMO (Simulated)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight-muted">Gross Wholesale Total:</span>
                <span className="font-mono text-white font-bold">
                  {formatMinorToMajor(order.merchandiseTotalMinor || 0, order.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight-muted">Shipping Payout:</span>
                <span className="font-mono text-white">
                  {formatMinorToMajor(order.shippingTotalMinor || 0, order.currency)}
                </span>
              </div>
              <div className="pt-2 border-t border-midnight-border/50 flex justify-between">
                <span className="text-slate-300 font-semibold">Total Payout:</span>
                <span className="font-mono text-teal-300 font-bold">
                  {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
                </span>
              </div>
            </div>

            {/* Mandatory Transparency Disclosure (BR-009 & FR-PAY-016) */}
            <div className="p-3 bg-amber-950/20 rounded-lg border border-amber-500/30 text-[11px] text-amber-200/90 leading-relaxed space-y-1">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Settlement Separation Guard
              </div>
              <p>
                Wholesaler payout is tracked in SupplierSettlement completely separately from buyer payments.
                Prototype settlements default to SIMULATED/DEMO with explicit disclosure. Funds are never confused with buyer PayPal captures.
              </p>
            </div>
          </div>

          {/* Chronological Audit Timeline */}
          <div className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Order Activity Trail
            </h3>
            <ActivityTimeline events={timelineEvents} />
          </div>
        </div>
      </div>

      {/* ── Purchase Order (PO) Summary Modal ── */}
      <Dialog open={poModalOpen} onOpenChange={setPoModalOpen}>
        <DialogContent className="max-w-2xl bg-midnight-card text-midnight-text border border-midnight-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-midnight-emerald" />
              Purchase Order Document — {order.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Official B2B collective procurement invoice summary for supplier fulfillment and drop-off verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs font-mono bg-midnight-surface/80 p-5 rounded-xl border border-midnight-border max-h-[60vh] overflow-y-auto">
            <div className="flex justify-between border-b border-midnight-border pb-3">
              <div>
                <p className="text-white font-bold text-sm">AAP KI DUKAN (COBUY AI)</p>
                <p className="text-midnight-muted">B2B Group Procurement Network</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="warning">TEST TRANSACTION — PAYPAL SANDBOX</Badge>
                  <Badge variant="neutral">SIMULATED SETTLEMENT</Badge>
                </div>
              </div>
              <div className="text-right">
                <p className="text-teal-300 font-bold">{order.orderNumber}</p>
                <p className="text-midnight-muted">
                  Issued: {new Date(order.createdAt).toLocaleDateString()}
                </p>
                <p className="text-slate-300 text-[11px] mt-1 font-sans">
                  Status: <strong className="text-white">{order.orderState === 'AWAITING_SUPPLIER_CONFIRMATION' ? 'PROCESSING' : (order.orderState || 'PROCESSING')}</strong>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2 border-b border-midnight-border">
              <div>
                <span className="text-midnight-muted uppercase">Supplier / Wholesaler:</span>
                <p className="text-white font-bold text-sm">
                  {order.supplierId?.name || 'Verified Wholesaler'}
                </p>
                <p className="text-slate-300">
                  {order.supplierId?.serviceAreas?.join(', ') || 'Regional Area'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-midnight-muted uppercase">Procurement Pool:</span>
                <p className="text-white font-bold">
                  {order.poolId?.title || 'Group Procurement Pool'}
                </p>
                <p className="text-slate-300">
                  {order.memberOrders?.length || 0} Participating Kiranas
                </p>
              </div>
            </div>

            {/* Product & Pricing Table in Modal */}
            <div className="py-2 space-y-2 border-b border-midnight-border">
              <div className="text-white font-bold">Product: {order.productId?.canonicalName || order.productId?.name}</div>
              <div className="flex justify-between text-slate-300">
                <span>Total Quantity:</span>
                <span className="font-bold text-white">{totalUnits} {orderUnit}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Merchandise Wholesale Total:</span>
                <span>{formatMinorToMajor(order.merchandiseTotalMinor || 0, order.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Shipping Allocation Total:</span>
                <span>{formatMinorToMajor(order.shippingTotalMinor || 0, order.currency)}</span>
              </div>
              <div className="flex justify-between text-white font-bold pt-1 border-t border-midnight-border/60">
                <span>Grand Total:</span>
                <span className="text-teal-300">{formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}</span>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-[11px] text-midnight-muted italic">
                Authorized digital Purchase Order generated under CoBuy AI escrow protocol.
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handlePrintPo}>
              <Printer className="h-4 w-4 mr-1.5" /> Print / PDF
            </Button>
            <Button variant="primary" size="sm" onClick={handleDownloadPo} disabled={poLoading}>
              <Download className="h-4 w-4 mr-1.5" /> Download PO Document (.html)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OrderDetailPage;
