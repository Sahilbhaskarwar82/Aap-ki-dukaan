/**
 * CoBuy AI — Group-Buy Pools Marketplace Page (SUJ-02)
 *
 * Route: /group-buys
 *
 * Implements a responsive B2B group-buy procurement marketplace allowing
 * independent shop owners and kiranas to discover, filter, and monitor
 * collective 72-hour bulk purchase pools.
 *
 * Reuses SUJ-01 core procurement widgets:
 *  - TierProgressBar (Visual MOQ progress & tier discount progression)
 *  - CountdownTimer (72-hour urgency tracker with normal/warning/critical states)
 *  - ProvenanceBadge (Data source verification: verified live, seeded demo, etc.)
 *  - formatMinorToMajor (Paise-accurate currency formatting)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  MapPin,
  Search,
  Filter,
  RotateCcw,
  Plus,
  AlertCircle,
  ShoppingBag,
  Clock,
  ArrowRight,
} from 'lucide-react';

import { formatMinorToMajor } from '@/utils/money';
import { TierProgressBar } from '@/components/common/TierProgressBar';
import { CountdownTimer } from '@/components/common/CountdownTimer';
import { ProvenanceBadge } from '@/components/common/ProvenanceBadge';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { cn } from '@/lib/utils';

import { fetchPools, fetchProductCatalogue } from '@/api/pools.api';

// Map backend pool lifecycle state to human-readable labels and badge variants
const POOL_STATE_CONFIG = {
  RECRUITING: {
    label: 'Recruiting',
    variant: 'pool',
    description: 'Open for buyer contributions',
  },
  MOQ_REACHED: {
    label: 'MOQ Reached',
    variant: 'success',
    description: 'Target met — awaiting final review',
  },
  AWAITING_APPROVALS: {
    label: 'Price Locked',
    variant: 'warning',
    description: 'Target reached — price snapshot frozen',
  },
  UNDER_MOQ_DECISION_PENDING: {
    label: '24h Decision',
    variant: 'warning',
    description: 'Under-MOQ window active',
  },
  FUNDED: {
    label: 'Funded',
    variant: 'success',
    description: 'Fully funded and ready for supplier order',
  },
  ORDERED: {
    label: 'Ordered',
    variant: 'neutral',
    description: 'Dispatched to supplier',
  },
  FULFILLED: {
    label: 'Fulfilled',
    variant: 'success',
    description: 'Delivered to buyers',
  },
  EXPIRED: {
    label: 'Expired',
    variant: 'outline',
    description: 'Recruitment period ended',
  },
  CANCELLED: {
    label: 'Cancelled',
    variant: 'outline',
    description: 'Pool cancelled',
  },
};

export function GroupBuyMarketplacePage() {
  const navigate = useNavigate();

  // Primary API Data State
  const [pools, setPools] = useState([]);
  const [productMap, setProductMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [areaFilter, setAreaFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Load Marketplace Data (Pools + Product Catalogue for Accurate Category Resolution)
  const [reloadIndex, setReloadIndex] = useState(0);

  const loadMarketplaceData = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadIndex((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let ignore = false;
    async function executeLoad() {
      try {
        const [poolsData, catalogueData] = await Promise.all([
          fetchPools(),
          fetchProductCatalogue(),
        ]);
        if (!ignore) {
          setPools(poolsData);
          setProductMap(catalogueData.productMap || {});
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.message || 'Failed to load group-buy pools. Please verify your connection.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    executeLoad();
    return () => {
      ignore = true;
    };
  }, [reloadIndex]);

  // Distinct Filter Options Derived from Actual Data
  const availableDeliveryAreas = useMemo(() => {
    const areas = new Set();
    pools.forEach((p) => {
      if (p.deliveryArea && typeof p.deliveryArea === 'string') {
        areas.add(p.deliveryArea.trim());
      }
    });
    return Array.from(areas).sort();
  }, [pools]);

  const availableCategories = useMemo(() => {
    const cats = new Set();
    pools.forEach((p) => {
      const prodId = p.productId?._id || p.productId;
      const prod = (typeof p.productId === 'object' && p.productId !== null ? p.productId : productMap[prodId]) || productMap[prodId];
      if (prod?.category) {
        cats.add(prod.category.toUpperCase().trim());
      }
    });
    return Array.from(cats).sort();
  }, [pools, productMap]);

  // Combined Deterministic Filtering Logic
  const filteredPools = useMemo(() => {
    return pools.filter((pool) => {
      // 1. Status Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'ACTIVE' && pool.state !== 'RECRUITING') return false;
        if (statusFilter === 'LOCKED' && !['MOQ_REACHED', 'AWAITING_APPROVALS', 'AWAITING_PAYMENT'].includes(pool.state)) {
          return false;
        }
        if (statusFilter !== 'ACTIVE' && statusFilter !== 'LOCKED' && pool.state !== statusFilter) {
          return false;
        }
      }

      // 2. Delivery Area Filter
      if (areaFilter !== 'ALL') {
        const poolArea = (pool.deliveryArea || '').toUpperCase().trim();
        const selectedArea = areaFilter.toUpperCase().trim();
        if (poolArea !== selectedArea && poolArea !== 'ALL_INDIA') return false;
      }

      // 3. Category Filter (Accurate lookup from Product Catalogue)
      if (categoryFilter !== 'ALL') {
        const prodId = pool.productId?._id || pool.productId;
        const prod = (typeof pool.productId === 'object' && pool.productId !== null ? pool.productId : productMap[prodId]) || productMap[prodId];
        const poolCat = (prod?.category || '').toUpperCase().trim();
        if (poolCat !== categoryFilter.toUpperCase().trim()) return false;
      }

      // 4. Keyword Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const titleMatch = (pool.title || '').toLowerCase().includes(query);
        const prodId = pool.productId?._id || pool.productId;
        const prod = (typeof pool.productId === 'object' && pool.productId !== null ? pool.productId : productMap[prodId]) || productMap[prodId];
        const prodNameMatch = (prod?.canonicalName || '').toLowerCase().includes(query);
        const areaMatch = (pool.deliveryArea || '').toLowerCase().includes(query);
        if (!titleMatch && !prodNameMatch && !areaMatch) return false;
      }

      return true;
    });
  }, [pools, productMap, statusFilter, areaFilter, categoryFilter, searchQuery]);

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    areaFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    searchQuery.trim() !== '';

  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setAreaFilter('ALL');
    setCategoryFilter('ALL');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" data-testid="group-buy-marketplace">
      {/* ── Top Header Section ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white font-space-grotesk">
              Group-Buy Marketplace
            </h1>
            <Badge variant="pool" className="text-[11px]">
              72h Pools
            </Badge>
          </div>
          <p className="text-xs text-midnight-muted mt-1 max-w-2xl">
            Join collective procurement pools with regional shops to satisfy wholesaler MOQs and unlock wholesale tier pricing with guaranteed 20% retailer minimums.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => navigate('/group-buys/create')}
          className="self-start sm:self-auto gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>Publish Group-Buy</span>
        </Button>
      </div>

      {/* ── Multi-Filter Control Toolbar ── */}
      <div className="bg-midnight-card border border-midnight-border rounded-xl p-4 space-y-3 shadow-md">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-midnight-muted">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-midnight-red" />
            <span>Filter Pools</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[11px] text-midnight-muted hover:text-white flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-midnight-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product, title, area..."
              className="w-full h-10 pl-9 pr-3 rounded-md border border-midnight-border bg-midnight-surface text-sm text-white placeholder:text-midnight-muted focus:outline-none focus:ring-2 focus:ring-midnight-red focus:border-midnight-red transition-colors"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-midnight-border bg-midnight-surface text-sm text-midnight-text focus:outline-none focus:ring-2 focus:ring-midnight-red focus:border-midnight-red transition-colors cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Delivery Area Filter */}
          <div>
            <select
              aria-label="Filter by delivery area"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-midnight-border bg-midnight-surface text-sm text-midnight-text focus:outline-none focus:ring-2 focus:ring-midnight-red focus:border-midnight-red transition-colors cursor-pointer"
            >
              <option value="ALL">All Delivery Areas</option>
              {availableDeliveryAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* Pool Status Filter */}
          <div>
            <select
              aria-label="Filter by pool status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-midnight-border bg-midnight-surface text-sm text-midnight-text focus:outline-none focus:ring-2 focus:ring-midnight-red focus:border-midnight-red transition-colors cursor-pointer"
            >
              <option value="ALL">All Pool Statuses</option>
              <option value="ACTIVE">Active (Recruiting)</option>
              <option value="LOCKED">Locked (MOQ Reached)</option>
              <option value="UNDER_MOQ_DECISION_PENDING">Under-MOQ Decision</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Error Banner State ── */}
      {error && (
        <Alert variant="error" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadMarketplaceData}>
            Retry
          </Button>
        </Alert>
      )}

      {/* ── Loading Skeleton Grid ── */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="rounded-xl border border-midnight-border bg-midnight-card p-5 space-y-4"
            >
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-14 w-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="pt-2 border-t border-midnight-border/50 flex justify-between">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && !error && filteredPools.length === 0 && (
        <div className="rounded-xl border border-midnight-border bg-midnight-card p-12 text-center space-y-4 shadow-xl">
          <div className="inline-flex p-3 rounded-full bg-midnight-surface border border-midnight-border text-midnight-muted mx-auto">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No Group-Buy Pools Found</h3>
          <p className="text-sm text-midnight-muted max-w-md mx-auto">
            {hasActiveFilters
              ? 'No pools match the selected filter criteria. Try adjusting or resetting your filters.'
              : 'There are currently no active group-buy pools. Be the first to publish a pool from your confirmed requirements!'}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            {hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                Clear All Filters
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => navigate('/group-buys/create')}>
                Create First Pool
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Pool Cards Grid ── */}
      {!loading && !error && filteredPools.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPools.map((pool) => {
            const prodId = pool.productId?._id || pool.productId;
            const product = (typeof pool.productId === 'object' && pool.productId !== null ? pool.productId : productMap[prodId]) || productMap[prodId];
            const stateConfig = POOL_STATE_CONFIG[pool.state] || {
              label: pool.state,
              variant: 'neutral',
              description: '',
            };

            const isRecruiting = pool.state === 'RECRUITING';
            const packUnit = pool.packUnit || 'UNIT';
            const targetMoq = pool.targetMoq || 1;
            const pooledQuantity = pool.totalEligibleQuantity || 0;
            const minRetailerQty = pool.minRetailerQuantity || Math.ceil(targetMoq * 0.2);
            const stepMultiple = pool.quantityStepMultiple || Math.max(1, Math.floor(targetMoq * 0.01));
            const currentPrice = pool.currentUnitPriceMinor || pool.baseUnitPriceMinor || 0;
            const currency = pool.currency || 'INR';

            return (
              <div
                key={pool._id} role="button" tabIndex={0} onClick={() => navigate('/group-buys/' + pool._id)}
                className={cn(
                  'rounded-xl border bg-midnight-card text-midnight-text flex flex-col justify-between p-5 space-y-4 shadow-lg transition-all hover:border-slate-500/80 cursor-pointer',
                  isRecruiting ? 'border-midnight-border' : 'border-midnight-border/70 opacity-95'
                )}
              >
                {/* 1. Header: Categories, Status & Provenance */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant={stateConfig.variant} className="text-[11px] font-mono">
                      {stateConfig.label}
                    </Badge>

                    <div className="flex items-center gap-1.5">
                      {product?.category && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-slate-300">
                          {product.category}
                        </Badge>
                      )}
                      {/* Provenance Badge strictly rendered when actual dataSourceType is available */}
                      {pool.dataSourceType && (
                        <ProvenanceBadge type={pool.dataSourceType} className="text-[10px] py-0.5" />
                      )}
                    </div>
                  </div>

                  <h3 className="font-bold text-base text-white line-clamp-2 leading-snug">
                    {pool.title}
                  </h3>

                  {pool.creatorShopName && (
                    <p className="text-xs text-midnight-muted" data-testid="pool-creator-shop">
                      by <span className="text-slate-300">{pool.creatorShopName}</span>
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 text-xs text-midnight-muted">
                    <MapPin className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                    <span>Delivery Area: <strong className="text-slate-200">{pool.deliveryArea}</strong></span>
                  </div>
                </div>

                {/* 2. 72h Authoritative Countdown Timer */}
                <div className="bg-midnight-surface/50 rounded-lg p-2.5 border border-midnight-border/40">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] uppercase tracking-wider text-midnight-muted flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Pool Window:
                    </span>
                    <CountdownTimer
                      deadline={pool.deadline}
                      variant="badge"
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* 3. MOQ Progress & Bulk Tier Progression Bar */}
                <div className="space-y-1">
                  <TierProgressBar
                    totalEligibleQuantity={pooledQuantity}
                    targetMoq={targetMoq}
                    baseUnitPriceMinor={pool.baseUnitPriceMinor}
                    packUnit={packUnit.toLowerCase()}
                    currency={currency}
                    className="p-3 bg-midnight-surface/30 border-midnight-border/40"
                  />
                </div>

                {/* 4. Business & Financial Procurement Specifications */}
                <div className="pt-2 border-t border-midnight-border/50 grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-midnight-muted">
                      Wholesale MOQ (MOQ_W)
                    </span>
                    <p className="font-mono font-semibold text-white">
                      {targetMoq} {packUnit}
                    </p>
                  </div>

                  <div className="space-y-0.5 text-right">
                    <span className="text-[10px] uppercase tracking-wider text-midnight-muted">
                      Current Tier Price
                    </span>
                    <p className="font-mono font-bold text-teal-300">
                      {formatMinorToMajor(currentPrice, currency)}
                      <span className="text-[10px] text-midnight-muted font-normal">/{packUnit}</span>
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-midnight-muted">
                      Buyer Minimum (MOQ_R)
                    </span>
                    <p className="font-mono text-slate-300">
                      {minRetailerQty} {packUnit} <span className="text-[10px] text-midnight-muted">(+{stepMultiple})</span>
                    </p>
                  </div>

                  <div className="space-y-0.5 text-right">
                    <span className="text-[10px] uppercase tracking-wider text-midnight-muted">
                      Participants
                    </span>
                    <p className="font-mono text-slate-300 flex items-center justify-end gap-1">
                      <Users className="h-3 w-3 text-midnight-muted" />
                      <span>{pool.participantCount || 0} shops</span>
                    </p>
                  </div>
                </div>

                {/* 5. Card Action Button */}
                <div className="pt-2">
                  <Button
                    variant={isRecruiting ? 'primary' : 'outline'}
                    size="sm"
                    
                    className="w-full justify-between"
                    onClick={() => {
                      navigate('/group-buys/' + pool._id);
                    }}
                  >
                    <span>{isRecruiting ? 'Contribute to Pool' : 'View Pool Details'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GroupBuyMarketplacePage;
