/**
 * CoBuy AI — Finalized Group Orders List Page (SUJ-07)
 *
 * Route: /orders
 *
 * Displays collective purchase orders, fulfillment tracking,
 * supplier confirmation status, and itemized allocation breakdown.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Search,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';

import { formatMinorToMajor } from '@/utils/money';
import { listOrders } from '@/api/orders.api';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { SandboxDisclosureBanner } from '@/components/common/SandboxDisclosureBanner';

export function OrdersListPage() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    async function loadOrders() {
      try {
        setLoading(true);
        setError(null);
        const data = await listOrders();
        setOrders(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load finalized orders.');
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, []);

  const filteredOrders = orders.filter((order) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (order.orderNumber && order.orderNumber.toLowerCase().includes(q)) ||
      (order.supplierId?.name && order.supplierId.name.toLowerCase().includes(q)) ||
      (order.productId?.canonicalName &&
        order.productId.canonicalName.toLowerCase().includes(q)) ||
      (order.productId?.name &&
        order.productId.name.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'ALL' ||
      order.orderState === statusFilter ||
      order.supplierConfirmationStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getOrderStateVariant = (state = '') => {
    switch (state) {
      case 'CONFIRMED':
      case 'DELIVERED':
      case 'FULFILLED':
        return 'success';
      case 'CANCELLED':
      case 'EXCEPTION':
        return 'error';
      case 'AWAITING_SUPPLIER_CONFIRMATION':
        return 'warning';
      case 'SHIPPED':
      case 'PROCESSING':
      default:
        return 'pool';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="orders-list-page">
      {/* ── Page Header with Required Test Identifiers ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Finalized Group Orders</h1>
          </div>
          <p className="text-xs text-midnight-muted mt-1">
            Confirmed collective purchase orders, fulfillment tracking, and itemized allocation breakdown
          </p>
        </div>

        <Badge variant="neutral" className="font-mono text-xs">
          {orders.length} Total Orders
        </Badge>
      </div>

      <SandboxDisclosureBanner />

      {/* ── Wholesale Lifecycle Guidance Banner ── */}
      <div className="p-3.5 rounded-lg border border-slate-700/60 bg-slate-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex items-start sm:items-center gap-2.5">
          <Package className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
          <span>
            <strong>Group Buy Lifecycle:</strong> Active commitments in recruiting pools are held in escrow. Track your live pool progress on <span className="font-semibold text-white">Group Buys</span> and <span className="font-semibold text-white">Dashboard</span>. Once a pool completes the manufacturer MOQ and freezes pricing, it is finalized into a confirmed collective purchase order listed here.
          </span>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-emerald-400 hover:text-emerald-300 font-semibold underline shrink-0 cursor-pointer text-xs"
        >
          View Dashboard Commitments &rarr;
        </button>
      </div>

      {error && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Orders</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Filter & Search Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-midnight-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by order # or product..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {['ALL', 'CONFIRMED', 'PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-midnight-emerald text-midnight-bg font-bold'
                  : 'bg-midnight-surface border border-midnight-border text-slate-300 hover:border-slate-500'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ── Orders Table ── */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-12 text-center space-y-3 shadow-xl">
          <div className="inline-flex p-3 rounded-full bg-midnight-surface border border-midnight-border text-midnight-muted mx-auto">
            <Package className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-white">No Finalized Group Orders Found</h3>
          <p className="text-xs text-midnight-muted max-w-sm mx-auto">
            Orders appear here once a group-buy pool reaches full funding and is dispatched to the wholesaler.
          </p>
          <Button variant="primary" size="sm" onClick={() => navigate('/group-buys')}>
            Explore Active Pools
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-midnight-border bg-midnight-card overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-midnight-surface/80 border-b border-midnight-border text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">Order Number</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Wholesale Supplier</th>
                  <th className="py-3 px-4">Total Quantity</th>
                  <th className="py-3 px-4">Grand Total</th>
                  <th className="py-3 px-4">Supplier Status</th>
                  <th className="py-3 px-4">Fulfillment</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-midnight-border/60">
                {filteredOrders.map((order) => {
                  const totalQty =
                    order.totalQuantity ||
                    order.memberOrders?.reduce((acc, m) => acc + (m.quantity || m.allocatedQuantity || 0), 0) ||
                    0;
                  const unit = order.unit || order.packUnit || 'units';

                  return (
                    <tr key={order._id} className="hover:bg-midnight-surface/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {order.orderNumber || `AKD-${order._id.slice(-6)}`}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-slate-200">
                        {order.supplierId?.name || 'Regional Wholesaler'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {totalQty} {unit}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-teal-300">
                        {formatMinorToMajor(order.grandTotalMinor || 0, order.currency)}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            order.supplierConfirmationStatus === 'CONFIRMED'
                              ? 'success'
                              : order.supplierConfirmationStatus === 'REJECTED'
                              ? 'error'
                              : 'warning'
                          }
                        >
                          {order.supplierConfirmationStatus || 'PENDING'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant={getOrderStateVariant(order.orderState)}>
                          {order.orderState || 'PROCESSING'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/orders/${order._id}`)}
                        >
                          View Details <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrdersListPage;
