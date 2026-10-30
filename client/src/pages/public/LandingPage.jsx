import React, { useState, useId } from 'react';
import {
  Sparkles,
  Flame,
  Clock,
  Users,
  ShieldCheck,
  TrendingDown,
  ArrowRight,
  Package,
  Layers,
  ChevronRight,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Calculator,
  FileText,
  Building,
  Star,
  Info,
} from 'lucide-react';
import { PublicLayout } from '@/layouts/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { toast } from '@/components/ui/Toast';

export function LandingPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [selectedPoolForJoin, setSelectedPoolForJoin] = useState(null);
  const [joinQuantity, setJoinQuantity] = useState(20);

  // ₹4,800 Calculator Interactive State
  const [calcShopA, setCalcShopA] = useState(20);
  const [calcShopB, setCalcShopB] = useState(15);
  const [calcShopC, setCalcShopC] = useState(25);

  // Group Buy Active Deals Mock Data (verified demonstration)
  const initialPools = [
    {
      id: 'pool-1',
      title: '12oz Eco Kraft Paper Cups (Carton of 1,000)',
      category: 'packaging',
      image: 'https://images.unsplash.com/photo-1577937927133-66ef06acdf18?auto=format&fit=crop&w=600&q=80',
      supplier: 'Apex Packaging Ltd (Lucknow)',
      supplierVerified: true,
      supplierRating: 4.9,
      moqW: 1000,
      moqR: 20,
      step: 5,
      unit: 'cartons',
      pooledQuantity: 850,
      targetQuantity: 1000,
      standardPrice: 100,
      currentTierPrice: 80,
      hoursRemaining: 14,
      minutesRemaining: 53,
      participantCount: 18,
      provenance: 'ISO-9001 Certified · Food Grade Paperboard',
    },
    {
      id: 'pool-2',
      title: 'Cold Pressed Pure Mustard Oil (15L Tin)',
      category: 'food',
      image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
      supplier: 'Bharat Agro Mills (Sitapur Hub)',
      supplierVerified: true,
      supplierRating: 4.8,
      moqW: 500,
      moqR: 10,
      step: 2,
      unit: 'tins',
      pooledQuantity: 375,
      targetQuantity: 500,
      standardPrice: 1720,
      currentTierPrice: 1420,
      hoursRemaining: 36,
      minutesRemaining: 10,
      participantCount: 24,
      provenance: 'FSSAI Certified · Agmark Grade I',
    },
    {
      id: 'pool-3',
      title: 'Heavy Duty Kraft Takeaway Bags with Handle (500 pk)',
      category: 'packaging',
      image: 'https://images.unsplash.com/photo-1597484661643-2f5fef640dd1?auto=format&fit=crop&w=600&q=80',
      supplier: 'GreenPack Industries (Kanpur)',
      supplierVerified: true,
      supplierRating: 4.9,
      moqW: 300,
      moqR: 15,
      step: 5,
      unit: 'packs',
      pooledQuantity: 240,
      targetQuantity: 300,
      standardPrice: 580,
      currentTierPrice: 450,
      hoursRemaining: 8,
      minutesRemaining: 40,
      participantCount: 12,
      provenance: '120 GSM Kraft · Biodegradable',
    },
    {
      id: 'pool-4',
      title: 'Premium Sharbati Whole Wheat Atta (50kg Bag)',
      category: 'grains',
      image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
      supplier: 'Kisan Golden Grain Wholesalers',
      supplierVerified: true,
      supplierRating: 4.7,
      moqW: 200,
      moqR: 5,
      step: 1,
      unit: 'bags',
      pooledQuantity: 145,
      targetQuantity: 200,
      standardPrice: 2150,
      currentTierPrice: 1820,
      hoursRemaining: 42,
      minutesRemaining: 20,
      participantCount: 16,
      provenance: 'MP Sharbati Wheat · Zero Additives',
    },
  ];

  // Direct Catalog Products
  const catalogProducts = [
    {
      id: 'cat-1',
      title: 'Corrugated 3-Ply Shipping Boxes (Pack of 50)',
      category: 'packaging',
      supplier: 'Om Packaging Solutions',
      unitPrice: 850,
      directMoq: 20,
      unit: 'packs',
      rating: 4.8,
    },
    {
      id: 'cat-2',
      title: 'Commercial Food Grade Surface Sanitizer (5L Can)',
      category: 'cleaning',
      supplier: 'HygienePro Chemicals',
      unitPrice: 620,
      directMoq: 10,
      unit: 'cans',
      rating: 4.9,
    },
    {
      id: 'cat-3',
      title: 'Stainless Steel Commercial Tea Strainers (Dozen)',
      category: 'kitchen',
      supplier: 'SteelCraft Kitchenware',
      unitPrice: 480,
      directMoq: 5,
      unit: 'dozens',
      rating: 4.6,
    },
    {
      id: 'cat-4',
      title: 'Organic Turmeric Finger Polished (25kg Sack)',
      category: 'food',
      supplier: 'Vedic Spices Consortium',
      unitPrice: 3400,
      directMoq: 4,
      unit: 'sacks',
      rating: 4.8,
    },
  ];

  // Verified Wholesalers
  const verifiedSuppliers = [
    {
      id: 'sup-1',
      name: 'Apex Packaging Ltd',
      hub: 'Transport Nagar Hub, Lucknow',
      rating: 4.9,
      fulfillmentRate: '99.4%',
      categories: ['Paper Cups', 'Corrugated Boxes', 'Containers'],
      activePoolsCount: 6,
    },
    {
      id: 'sup-2',
      name: 'Bharat Agro Mills',
      hub: 'Sitapur Agro Corridor',
      rating: 4.8,
      fulfillmentRate: '98.9%',
      categories: ['Mustard Oil', 'Refined Soy', 'Ghee'],
      activePoolsCount: 4,
    },
    {
      id: 'sup-3',
      name: 'GreenPack Industries',
      hub: 'Panki Industrial Area, Kanpur',
      rating: 4.9,
      fulfillmentRate: '99.7%',
      categories: ['Kraft Bags', 'Pouch Packaging', 'Paper Straws'],
      activePoolsCount: 5,
    },
  ];

  // Filter pools by search & category
  const filteredPools = initialPools.filter((pool) => {
    const matchesCategory =
      selectedCategory === 'all' ||
      selectedCategory === 'group-buys' ||
      pool.category === selectedCategory;
    const matchesSearch =
      pool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pool.supplier.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Dynamic calculations for the ₹4,800 pricing example
  const totalCalcQuantity = Math.max(0, calcShopA) + Math.max(0, calcShopB) + Math.max(0, calcShopC);
  let calcUnitPrice = 100;
  let calcTierName = 'Tier 1 (<30 boxes)';
  if (totalCalcQuantity >= 50) {
    calcUnitPrice = 80;
    calcTierName = 'Tier 3 (50+ boxes: ₹80/box)';
  } else if (totalCalcQuantity >= 30) {
    calcUnitPrice = 90;
    calcTierName = 'Tier 2 (30–49 boxes: ₹90/box)';
  } else {
    calcUnitPrice = 100;
    calcTierName = 'Tier 1 (<30 boxes: ₹100/box)';
  }

  const shopAShare = calcShopA * calcUnitPrice;
  const shopBShare = calcShopB * calcUnitPrice;
  const shopCShare = calcShopC * calcUnitPrice;
  const totalMerchandise = shopAShare + shopBShare + shopCShare;

  const handleOpenJoinModal = (pool) => {
    setSelectedPoolForJoin(pool);
    setJoinQuantity(pool.moqR);
  };

  const handleConfirmJoin = () => {
    if (!selectedPoolForJoin) return;
    toast.success(
      `Joined pool for ${joinQuantity} ${selectedPoolForJoin.unit}! Estimated cost: ₹${(
        joinQuantity * selectedPoolForJoin.currentTierPrice
      ).toLocaleString('en-IN')}`
    );
    setSelectedPoolForJoin(null);
  };

  return (
    <PublicLayout
      onOpenHowItWorks={() => setHowItWorksOpen(true)}
      selectedCategory={selectedCategory}
      onCategorySelect={setSelectedCategory}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
    >
      {/* ── SECTION 1: PROMOTIONAL HERO BANNER ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#111620] via-midnight-bg to-midnight-bg border-b border-midnight-border/70 py-12 md:py-16 xl:py-20">
        {/* Subtle ambient glows */}
        <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-midnight-red/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 top-10 h-96 w-96 rounded-full bg-midnight-emerald/10 blur-3xl" />

        <div className="marketplace-container relative z-10 text-left">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 xl:gap-16 items-center">
            {/* Left Column (Hero Content) */}
            <div className="lg:col-span-7 xl:col-span-7 space-y-5 xl:space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-midnight-red/15 border border-midnight-red/30 text-xs font-semibold text-red-400">
                <Flame className="h-3.5 w-3.5 text-midnight-red animate-pulse" />
                <span>B2B REGIONAL DEMAND AGGREGATION</span>
              </div>

              <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl xl:text-6xl text-white tracking-tight leading-[1.12] xl:leading-[1.08] max-w-3xl">
                WHOLESALE PRICES.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-300 to-amber-300">
                  POWERED BY BUYING TOGETHER.
                </span>
              </h1>

              <p className="text-sm sm:text-base xl:text-lg text-midnight-muted leading-relaxed max-w-2xl">
                Independent retail stores, cafes, and kiranas unite regional purchasing needs. Pool your order volumes, reach wholesale manufacturer MOQs, and unlock true factory-direct pricing.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="font-semibold text-sm"
                  onClick={() => {
                    const groupSection = document.getElementById('trending-group-buys');
                    if (groupSection) groupSection.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Explore Active Group Buys
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  className="font-medium text-sm border-midnight-border hover:border-slate-400"
                  onClick={() => setHowItWorksOpen(true)}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-midnight-gold" />
                  How Collective Buying Works
                </Button>
              </div>

              {/* Real-time Ticker Highlight */}
              <div className="pt-2">
                <div className="inline-flex items-center gap-2 p-2.5 rounded-lg bg-midnight-card border border-midnight-border/80 text-xs text-slate-300 max-w-2xl">
                  <Badge variant="warning" className="text-[10px] py-0 px-1.5 font-bold">
                    POOL CLOSING SOON
                  </Badge>
                  <span>
                    <strong>12oz Paper Cups</strong> &bull; 85% MOQ reached &bull; Unlocked <strong>₹80/carton</strong> (Save 20%)
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column (Hero Featured Card Showcase) */}
            <div className="lg:col-span-5 xl:col-span-5">
              <div className="relative rounded-2xl border border-midnight-border/90 bg-gradient-to-br from-midnight-card via-midnight-card to-midnight-surface/80 p-5 sm:p-6 xl:p-7 shadow-2xl shadow-black/80 space-y-4 xl:space-y-5">
                <div className="flex items-center justify-between border-b border-midnight-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="pool" className="text-xs">
                      <Flame className="h-3 w-3 mr-1 text-teal-300" />
                      Featured Lucknow Pool
                    </Badge>
                    <span className="text-xs text-midnight-muted">AKD-POOL-2026-08</span>
                  </div>
                  <Badge variant="payment" className="text-xs font-mono font-bold">
                    ₹80 / carton
                  </Badge>
                </div>

                <div className="text-left space-y-1">
                  <h3 className="font-display font-semibold text-base sm:text-lg text-white">
                    12oz Eco Kraft Paper Cups (1,000 pk)
                  </h3>
                  <p className="text-xs text-midnight-muted">
                    Apex Packaging Ltd &bull; Lucknow Transport Nagar
                  </p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 text-left">
                  <div className="flex justify-between text-xs">
                    <span className="text-midnight-muted">Wholesaler MOQ Progress</span>
                    <span className="text-midnight-emerald font-semibold">850 / 1,000 cartons (85%)</span>
                  </div>
                  <div className="w-full h-2.5 bg-midnight-surface rounded-full overflow-hidden border border-midnight-border/40">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-midnight-emerald rounded-full transition-all duration-500"
                      style={{ width: '85%' }}
                    />
                  </div>
                </div>

                {/* Participating Shops Chips */}
                <div className="space-y-2 text-left">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Recent Buyer Contributions
                  </span>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="p-2 sm:p-2.5 rounded-md bg-midnight-surface/60 border border-midnight-border/50 text-center">
                      <p className="text-xs font-semibold text-white">Shop A</p>
                      <p className="text-[10px] text-midnight-muted">20 cartons</p>
                    </div>
                    <div className="p-2 sm:p-2.5 rounded-md bg-midnight-surface/60 border border-midnight-border/50 text-center">
                      <p className="text-xs font-semibold text-white">Shop B</p>
                      <p className="text-[10px] text-midnight-muted">15 cartons</p>
                    </div>
                    <div className="p-2 sm:p-2.5 rounded-md bg-midnight-surface/60 border border-midnight-border/50 text-center">
                      <p className="text-xs font-semibold text-white">Shop C</p>
                      <p className="text-[10px] text-midnight-muted">25 cartons</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-midnight-border/60">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span>14h 53m remaining</span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="font-semibold text-xs"
                    onClick={() => handleOpenJoinModal(initialPools[0])}
                  >
                    Join This Pool
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: SHOP BY CATEGORY ── */}
      <section className="py-12 border-b border-midnight-border/50 bg-midnight-bg">
        <div className="marketplace-container text-left space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-xl text-white">
                Shop Wholesale Categories
              </h2>
              <p className="text-xs text-midnight-muted">
                Browse factory-direct bulk lines aggregated across regional commercial hubs
              </p>
            </div>
            <button
              onClick={() => setSelectedCategory('all')}
              className="text-xs font-semibold text-midnight-red hover:underline cursor-pointer"
            >
              View All Categories &rarr;
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 xl:gap-5">
            {[
              {
                id: 'packaging',
                title: 'Packaging & Disposables',
                count: '34 Active Pools',
                icon: Package,
                color: 'from-amber-500/20 to-red-500/10',
              },
              {
                id: 'food',
                title: 'Cooking Oils & Ghee',
                count: '18 Active Pools',
                icon: Layers,
                color: 'from-emerald-500/20 to-teal-500/10',
              },
              {
                id: 'grains',
                title: 'Bulk Grains & Pulses',
                count: '26 Active Pools',
                icon: Building,
                color: 'from-cyan-500/20 to-blue-500/10',
              },
              {
                id: 'cleaning',
                title: 'Commercial Cleaning',
                count: '15 Active Pools',
                icon: Sparkles,
                color: 'from-rose-500/20 to-purple-500/10',
              },
              {
                id: 'spices',
                title: 'Spices & Condiments',
                count: '22 Active Pools',
                icon: Flame,
                color: 'from-orange-500/20 to-red-500/10',
              },
              {
                id: 'kitchen',
                title: 'Commercial Kitchen',
                count: '14 Active Pools',
                icon: Package,
                color: 'from-indigo-500/20 to-blue-500/10',
              },
            ].map((cat) => {
              const IconComp = cat.icon;
              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer group bg-gradient-to-br ${cat.color} ${
                    selectedCategory === cat.id
                      ? 'border-midnight-red shadow-md shadow-red-950/40 bg-midnight-surface'
                      : 'border-midnight-border/70 bg-midnight-card hover:border-slate-400'
                  }`}
                >
                  <IconComp className="h-6 w-6 text-white mb-2 group-hover:scale-110 transition-transform" />
                  <h4 className="font-semibold text-sm text-white">{cat.title}</h4>
                  <p className="text-xs text-midnight-muted mt-1">{cat.count}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: TRENDING GROUP BUYS (THE CORE DIFFERENTIATOR) ── */}
      <section id="trending-group-buys" className="py-14 border-b border-midnight-border/60 bg-midnight-bg">
        <div className="marketplace-container space-y-8 text-left">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-midnight-red" />
                <h2 className="font-display font-bold text-2xl text-white">
                  Trending Group Buys &bull; Collective Orders Closing Soon
                </h2>
              </div>
              <p className="text-xs text-midnight-muted mt-1">
                Participate with regional retailers. When the pool crosses wholesaler MOQ, factory discounts apply automatically.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="provenance" className="text-xs">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Verified Wholesalers
              </Badge>
              <Badge variant="payment" className="text-xs">
                INR Minor Unit Billing
              </Badge>
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 xl:gap-7">
            {filteredPools.map((pool) => {
              const percentReached = Math.round((pool.pooledQuantity / pool.targetQuantity) * 100);
              const savingsPercent = Math.round(
                ((pool.standardPrice - pool.currentTierPrice) / pool.standardPrice) * 100
              );

              return (
                <div
                  key={pool.id}
                  className="group rounded-xl border border-midnight-border/80 bg-midnight-card overflow-hidden hover:border-slate-500 hover:shadow-xl hover:shadow-black/70 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Image Header with Countdown & Badges */}
                    <div className="relative h-48 sm:h-52 w-full bg-midnight-surface overflow-hidden">
                      <img
                        src={pool.image}
                        alt={pool.title}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-midnight-card via-transparent to-black/30" />

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <Badge variant="success" className="text-[11px] font-semibold py-0.5 px-2">
                          Save {savingsPercent}%
                        </Badge>
                        <Badge variant="neutral" className="text-[10px] py-0.5 px-2">
                          MOQ_R: {pool.moqR} {pool.unit}
                        </Badge>
                      </div>

                      <div className="absolute top-2.5 right-2.5">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-amber-500/40 text-[11px] text-amber-300 font-medium">
                          <Clock className="h-3 w-3" />
                          <span>
                            {pool.hoursRemaining}h {pool.minutesRemaining}m
                          </span>
                        </div>
                      </div>

                      {/* Bottom Supplier Overlay */}
                      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs text-slate-300">
                        <span className="truncate font-medium">{pool.supplier}</span>
                        <div className="flex items-center gap-1 text-midnight-gold shrink-0">
                          <Star className="h-3 w-3 fill-current" />
                          <span>{pool.supplierRating}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-3.5 text-left">
                      <h3 className="font-display font-semibold text-base text-white leading-snug line-clamp-2">
                        {pool.title}
                      </h3>

                      {/* Pricing Tier */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold font-display text-white tabular-nums">
                          ₹{pool.currentTierPrice}
                        </span>
                        <span className="text-xs text-midnight-muted">/{pool.unit}</span>
                        <span className="text-xs text-slate-500 line-through">
                          ₹{pool.standardPrice}
                        </span>
                        <span className="text-xs text-midnight-emerald font-semibold ml-auto">
                          Bulk Tier Unlocked
                        </span>
                      </div>

                      {/* MOQ Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-slate-400">Pool Progress</span>
                          <span className="text-midnight-emerald">
                            {pool.pooledQuantity} / {pool.targetQuantity} {pool.unit} ({percentReached}%)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-midnight-surface overflow-hidden border border-midnight-border/40">
                          <div
                            className="h-full bg-gradient-to-r from-teal-500 to-midnight-emerald transition-all duration-300"
                            style={{ width: `${percentReached}%` }}
                          />
                        </div>
                      </div>

                      {/* Specifications Summary */}
                      <div className="text-[11px] text-midnight-muted pt-1 border-t border-midnight-border/50 flex items-center justify-between">
                        <span>Wholesaler MOQ: {pool.moqW} {pool.unit}</span>
                        <span>Step: +{pool.step} {pool.unit}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="p-4 pt-0">
                    <Button
                      variant="primary"
                      className="w-full font-semibold text-xs"
                      onClick={() => handleOpenJoinModal(pool)}
                    >
                      Join Group Buy Pool
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: DIRECT WHOLESALER CATALOG (INSTANT PROCUREMENT) ── */}
      <section className="py-14 border-b border-midnight-border/60 bg-midnight-bg">
        <div className="marketplace-container space-y-6 text-left">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-xl text-white">
                Direct Wholesale Catalog
              </h2>
              <p className="text-xs text-midnight-muted">
                Immediate wholesale ordering or trigger an AI-assisted group buy pool if single-store MOQ is unachievable
              </p>
            </div>
            <button
              onClick={() => toast.info('Full wholesale catalog available in Wave 2')}
              className="text-xs font-semibold text-midnight-red hover:underline cursor-pointer"
            >
              Browse Complete Catalog &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
            {catalogProducts.map((prod) => (
              <div
                key={prod.id}
                className="p-5 rounded-xl border border-midnight-border/70 bg-midnight-card hover:border-slate-500 transition-colors space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-midnight-muted">
                    <span>{prod.supplier}</span>
                    <span className="flex items-center gap-0.5 text-midnight-gold">
                      <Star className="h-3 w-3 fill-current" /> {prod.rating}
                    </span>
                  </div>
                  <h4 className="font-semibold text-sm text-white line-clamp-2">
                    {prod.title}
                  </h4>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-white tabular-nums">
                      ₹{prod.unitPrice}
                    </span>
                    <span className="text-xs text-midnight-muted">/{prod.unit}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Solo Direct MOQ: <strong>{prod.directMoq} {prod.unit}</strong>
                  </p>
                </div>

                <div className="pt-2 space-y-2 border-t border-midnight-border/50">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => toast.info(`Direct order request recorded for ${prod.title}`)}
                  >
                    Direct Wholesale Order
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs text-slate-300 border-dashed"
                    onClick={() => {
                      toast.success(`Pool creation request generated for ${prod.title}!`);
                      setHowItWorksOpen(true);
                    }}
                  >
                    Start Group Buy Pool
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: VERIFIED WHOLESALE SUPPLIERS ── */}
      <section className="py-14 border-b border-midnight-border/60 bg-midnight-bg">
        <div className="marketplace-container space-y-6 text-left">
          <div>
            <h2 className="font-display font-bold text-xl text-white">
              Verified Regional Wholesalers & Distributors
            </h2>
            <p className="text-xs text-midnight-muted">
              Pre-audited wholesale suppliers with guaranteed stock availability, minor-unit price transparency, and fulfillment verification
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 xl:gap-8">
            {verifiedSuppliers.map((sup) => (
              <div
                key={sup.id}
                className="p-6 rounded-xl border border-midnight-border bg-midnight-card hover:border-slate-500 transition-all space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-display font-semibold text-base text-white">
                      {sup.name}
                    </h3>
                    <p className="text-xs text-midnight-muted flex items-center gap-1">
                      <Building className="h-3 w-3 text-midnight-red" />
                      {sup.hub}
                    </p>
                  </div>
                  <Badge variant="provenance" className="text-xs font-semibold">
                    <ShieldCheck className="h-3.5 w-3.5 mr-1 text-cyan-300" />
                    Verified
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2 rounded bg-midnight-surface/60 border border-midnight-border/40">
                    <span className="text-[10px] text-midnight-muted block">Rating</span>
                    <span className="font-bold text-midnight-gold flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" /> {sup.rating} / 5.0
                    </span>
                  </div>
                  <div className="p-2 rounded bg-midnight-surface/60 border border-midnight-border/40">
                    <span className="text-[10px] text-midnight-muted block">Fulfillment</span>
                    <span className="font-bold text-midnight-emerald">{sup.fulfillmentRate}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 block font-medium">Core Product Lines:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {sup.categories.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-0.5 rounded-full bg-midnight-surface text-[11px] text-slate-300 border border-midnight-border/60"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => toast.info(`Viewing all active pools for ${sup.name}`)}
                >
                  View {sup.activePoolsCount} Active Pools
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 6: HOW COLLECTIVE BUYING WORKS BANNER / TEASER ── */}
      <section className="py-14 bg-gradient-to-r from-midnight-card via-[#161C28] to-midnight-card border-b border-midnight-border/70">
        <div className="marketplace-container text-center space-y-6">
          <Badge variant="pool" className="text-xs py-1 px-3">
            <Sparkles className="h-3 w-3 mr-1" />
            The CoBuy AI Collective Engine
          </Badge>

          <h2 className="font-display font-bold text-2xl sm:text-3xl text-white">
            How Collective Procurement Works for Your Business
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 xl:gap-8 text-left w-full max-w-6xl xl:max-w-7xl mx-auto pt-4">
            <div className="p-6 rounded-xl border border-midnight-border/60 bg-midnight-card/80 space-y-3">
              <div className="h-8 w-8 rounded-lg bg-midnight-red/20 text-midnight-red flex items-center justify-center font-bold text-sm font-display">
                1
              </div>
              <h4 className="font-semibold text-sm text-white">Pool Regional Demand</h4>
              <p className="text-xs text-midnight-muted leading-relaxed">
                Join or initiate a group-buy pool. Independent shops contribute small quantities without risking large inventory lockup.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-midnight-border/60 bg-midnight-card/80 space-y-3">
              <div className="h-8 w-8 rounded-lg bg-midnight-emerald/20 text-midnight-emerald flex items-center justify-center font-bold text-sm font-display">
                2
              </div>
              <h4 className="font-semibold text-sm text-white">Hit Factory MOQ</h4>
              <p className="text-xs text-midnight-muted leading-relaxed">
                Combined order volumes hit the wholesaler’s Minimum Order Quantity ($MOQ_W$), automatically unlocking wholesale discount tiers.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-midnight-border/60 bg-midnight-card/80 space-y-3">
              <div className="h-8 w-8 rounded-lg bg-midnight-gold/20 text-midnight-gold flex items-center justify-center font-bold text-sm font-display">
                3
              </div>
              <h4 className="font-semibold text-sm text-white">Unlock Tiered Savings</h4>
              <p className="text-xs text-midnight-muted leading-relaxed">
                Review transparent per-shop itemization. Price snapshots are locked, payments captured securely, and orders dispatched directly.
              </p>
            </div>
          </div>

          <div className="pt-2 px-2">
            <Button
              variant="primary"
              size="lg"
              className="font-semibold text-xs sm:text-sm whitespace-normal text-center h-auto py-3 px-4 sm:px-6"
              onClick={() => setHowItWorksOpen(true)}
            >
              Explore Full Interactive Mechanics (Calculator &amp; Timeline) &rarr;
            </Button>
          </div>
        </div>
      </section>

      {/* ── MODAL: INTERACTIVE HOW IT WORKS EXPERIENCE ── */}
      <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-midnight-red flex items-center justify-center text-white text-xs font-bold">
                आ
              </div>
              <DialogTitle className="text-xl">
                CoBuy AI Engine: Collective Buying Architecture
              </DialogTitle>
            </div>
            <DialogDescription>
              Detailed breakdown of AI invoice parsing, two-level MOQ math, the ₹4,800 group pricing rule, and 72-hour governance.
            </DialogDescription>
          </DialogHeader>

          {/* Modal Tabs */}
          <Tabs defaultValue="calculator" className="w-full mt-4">
            <TabsList className="grid grid-cols-4 w-full h-11">
              <TabsTrigger value="calculator" className="text-xs">
                ₹4,800 Pricing Model
              </TabsTrigger>
              <TabsTrigger value="moq-engine" className="text-xs">
                Two-Level MOQ Engine
              </TabsTrigger>
              <TabsTrigger value="ai-extraction" className="text-xs">
                AI Extraction Demo
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs">
                72h Pool Timeline
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: INTERACTIVE ₹4,800 PRICING CALCULATOR */}
            <TabsContent value="calculator" className="space-y-5 pt-3 text-left">
              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border text-xs text-slate-300">
                <strong>Transparent Group Pricing Rule:</strong> Base Price = ₹100/box. Below 30 boxes = ₹100/box. 30–49 boxes = ₹90/box. 50+ boxes = ₹80/box. Adjust the shop contributions below to verify dynamic rate selection:
              </div>

              {/* Steppers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Shop A */}
                <div className="p-4 rounded-xl border border-midnight-border bg-midnight-surface/40 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-white text-sm">Shop A</span>
                    <Badge variant="neutral">Retailer A</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCalcShopA(Math.max(0, calcShopA - 5))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-lg font-bold text-white tabular-nums">
                      {calcShopA} boxes
                    </span>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCalcShopA(calcShopA + 5)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="text-xs text-midnight-emerald font-semibold pt-1 border-t border-midnight-border/50 flex justify-between">
                    <span>Individual Share:</span>
                    <span>₹{shopAShare.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Shop B */}
                <div className="p-4 rounded-xl border border-midnight-border bg-midnight-surface/40 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-white text-sm">Shop B</span>
                    <Badge variant="neutral">Retailer B</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCalcShopB(Math.max(0, calcShopB - 5))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-lg font-bold text-white tabular-nums">
                      {calcShopB} boxes
                    </span>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCalcShopB(calcShopB + 5)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="text-xs text-midnight-emerald font-semibold pt-1 border-t border-midnight-border/50 flex justify-between">
                    <span>Individual Share:</span>
                    <span>₹{shopBShare.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Shop C */}
                <div className="p-4 rounded-xl border border-midnight-border bg-midnight-surface/40 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-white text-sm">Shop C</span>
                    <Badge variant="neutral">Retailer C</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCalcShopC(Math.max(0, calcShopC - 5))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-lg font-bold text-white tabular-nums">
                      {calcShopC} boxes
                    </span>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCalcShopC(calcShopC + 5)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="text-xs text-midnight-emerald font-semibold pt-1 border-t border-midnight-border/50 flex justify-between">
                    <span>Individual Share:</span>
                    <span>₹{shopCShare.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Output Result Card */}
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-500/30 pb-3">
                  <div>
                    <span className="text-xs text-slate-400 block">Total Pooled Volume:</span>
                    <span className="text-xl font-bold text-white tabular-nums">
                      {totalCalcQuantity} Boxes
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Applicable Discount Tier:</span>
                    <span className="text-sm font-semibold text-emerald-400">
                      {calcTierName}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Group Merchandise Total:</span>
                    <span className="text-2xl font-display font-bold text-midnight-gold tabular-nums">
                      ₹{totalMerchandise.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Standard Cost without Group Buy: ₹{(totalCalcQuantity * 100).toLocaleString('en-IN')}</span>
                  <span className="text-emerald-400 font-semibold">
                    Net Group Savings: ₹{((totalCalcQuantity * 100) - totalMerchandise).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                * Note: Shipping, GST, and hub logistics are separate line items allocated per delivery route. This calculator is a marketing demonstration of collective tier unlock rules.
              </p>
            </TabsContent>

            {/* TAB 2: TWO-LEVEL MOQ ENGINE */}
            <TabsContent value="moq-engine" className="space-y-4 pt-3 text-left">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-white">
                  Mathematical Rules: Two-Level MOQ Engine
                </h4>
                <p className="text-xs text-midnight-muted">
                  Protects wholesalers from unviable order sizes while ensuring individual small retailers never need to buy full factory minimums.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-lg border border-midnight-border bg-midnight-surface/50 space-y-1">
                  <span className="text-xs text-slate-400">Wholesaler Factory MOQ ($MOQ_W$)</span>
                  <p className="text-xl font-bold text-white tabular-nums">1,000 units</p>
                  <p className="text-[11px] text-midnight-muted">
                    Total bulk threshold the group pool must reach collectively.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-midnight-border bg-midnight-surface/50 space-y-1">
                  <span className="text-xs text-slate-400">Retailer Minimum ($MOQ_R$)</span>
                  <p className="text-xl font-bold text-midnight-emerald tabular-nums">200 units (20%)</p>
                  <p className="text-[11px] text-midnight-muted">
                    MOQ_R = max(1, ceil(MOQ_W × 20 / 100))
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-midnight-border bg-midnight-surface/50 space-y-1">
                  <span className="text-xs text-slate-400">Order Increment Step</span>
                  <p className="text-xl font-bold text-midnight-gold tabular-nums">10 units (1%)</p>
                  <p className="text-[11px] text-midnight-muted">
                    Step = max(1, floor(MOQ_W × 1 / 100))
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-midnight-border bg-midnight-card space-y-2">
                <span className="text-xs font-semibold text-white block">
                  Demonstration: Valid Retailer Order Quantities
                </span>
                <div className="flex flex-wrap gap-2">
                  {[200, 210, 220, 230, 240, 250, 300].map((qty) => (
                    <span
                      key={qty}
                      className="px-2.5 py-1 rounded-md bg-midnight-surface border border-emerald-500/30 text-xs font-mono text-emerald-300 font-semibold"
                    >
                      {qty} units &bull; Valid &check;
                    </span>
                  ))}
                  <span className="px-2.5 py-1 rounded-md bg-midnight-surface border border-rose-500/30 text-xs font-mono text-rose-300 line-through">
                    190 units (Below MOQ_R)
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-midnight-surface border border-rose-500/30 text-xs font-mono text-rose-300 line-through">
                    205 units (Invalid Step)
                  </span>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: AI INVOICE EXTRACTION SHOWCASE */}
            <TabsContent value="ai-extraction" className="space-y-4 pt-3 text-left">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-white">
                  AI Invoice &amp; Informal Demand Parsing
                </h4>
                <p className="text-xs text-midnight-muted">
                  Retailers submit invoices, voice notes, or informal WhatsApp text. The AI extracts structured commercial parameters.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                {/* Informal Input Box */}
                <div className="md:col-span-5 p-4 rounded-xl border border-midnight-border bg-midnight-surface/50 space-y-2">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                    Unstructured Buyer Input
                  </span>
                  <div className="p-3 rounded-lg bg-midnight-card border border-midnight-border/60 text-xs font-mono text-slate-300 leading-relaxed italic">
                    "We need 25 boxes of 12-ounce food-safe paper cups for our café."
                  </div>
                  <span className="text-[11px] text-midnight-muted block">
                    Source: Informal Kirana Request &bull; Timestamped
                  </span>
                </div>

                {/* Arrow */}
                <div className="md:col-span-2 flex justify-center text-midnight-red">
                  <ArrowRight className="h-6 w-6 rotate-90 md:rotate-0" />
                </div>

                {/* Structured Fields Output */}
                <div className="md:col-span-5 p-4 rounded-xl border border-emerald-500/30 bg-midnight-card space-y-2">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
                    Parsed Structured Specifications
                  </span>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between py-1 border-b border-midnight-border/40">
                      <span className="text-midnight-muted">Product:</span>
                      <span className="font-semibold text-white">Paper Cups</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-midnight-border/40">
                      <span className="text-midnight-muted">Quantity:</span>
                      <span className="font-semibold text-white">25 boxes</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-midnight-border/40">
                      <span className="text-midnight-muted">Capacity:</span>
                      <span className="font-semibold text-white">12 oz</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-midnight-border/40">
                      <span className="text-midnight-muted">Material:</span>
                      <span className="font-semibold text-white">Paperboard</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-midnight-border/40">
                      <span className="text-midnight-muted">Food Safe:</span>
                      <Badge variant="success" className="text-[10px] py-0 px-1.5">
                        Required &check;
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-midnight-muted">Delivery Area:</span>
                      <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                        Lucknow (Confirm Pin)
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: 72H POOL TIMELINE & GOVERNANCE */}
            <TabsContent value="timeline" className="space-y-4 pt-3 text-left">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-white">
                  72-Hour Pool Recruitment &amp; 24-Hour Consent Matrix
                </h4>
                <p className="text-xs text-midnight-muted">
                  Transparent state machine ensuring silence is never consent and 100% refund safety.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    stage: 'Stage 1: Pool Opens (00:00 - 72:00h)',
                    desc: 'The 72-hour buyer recruitment window opens. Local shops join and deposit their allocation into the PayPal Sandbox escrow.',
                    status: 'RECRUITING',
                    color: 'text-teal-400 border-teal-500/40 bg-teal-950/20',
                  },
                  {
                    stage: 'Stage 2: Early Lock on MOQ',
                    desc: 'If cumulative orders reach MOQ_W before 72h, the pool locks early. Price snapshot is frozen and final confirmation dispatch starts.',
                    status: 'MOQ_LOCKED',
                    color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20',
                  },
                  {
                    stage: 'Stage 3: 72h Window Expires Under-MOQ',
                    desc: 'If pool closes below MOQ_W, pool automatically transitions to decision mode. All participants receive immediate in-app and SMS alerts.',
                    status: 'EXPIRED_UNDER_MOQ',
                    color: 'text-amber-400 border-amber-500/40 bg-amber-950/20',
                  },
                  {
                    stage: 'Stage 4: 24h Buyer Decision Window',
                    desc: 'AI recommends supplier feasibility. Each buyer explicitly chooses: (A) proceed with revised under-MOQ rate, or (B) cancel for 100% refund. Silence is never consent.',
                    status: 'DECISION_WINDOW',
                    color: 'text-rose-400 border-rose-500/40 bg-rose-950/20',
                  },
                ].map((s, idx) => (
                  <div key={idx} className={`p-3.5 rounded-lg border ${s.color} space-y-1`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{s.stage}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-current font-bold">
                        {s.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setHowItWorksOpen(false)}
              className="text-xs"
            >
              Close Guide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: JOIN GROUP BUY POOL ── */}
      <Dialog
        open={Boolean(selectedPoolForJoin)}
        onOpenChange={(val) => !val && setSelectedPoolForJoin(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Join Group Buy Pool
            </DialogTitle>
            <DialogDescription>
              {selectedPoolForJoin?.title}
            </DialogDescription>
          </DialogHeader>

          {selectedPoolForJoin && (
            <div className="space-y-4 pt-2 text-left">
              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-midnight-muted">Supplier:</span>
                  <span className="font-semibold text-white">{selectedPoolForJoin.supplier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-midnight-muted">Applicable Rate:</span>
                  <span className="font-semibold text-midnight-emerald">
                    ₹{selectedPoolForJoin.currentTierPrice} / {selectedPoolForJoin.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-midnight-muted">Retailer Minimum MOQ:</span>
                  <span className="font-semibold text-white">
                    {selectedPoolForJoin.moqR} {selectedPoolForJoin.unit} (Step: +{selectedPoolForJoin.step})
                  </span>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Select Your Order Quantity ({selectedPoolForJoin.unit}):
                </label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() =>
                      setJoinQuantity(
                        Math.max(selectedPoolForJoin.moqR, joinQuantity - selectedPoolForJoin.step)
                      )
                    }
                  >
                    <Minus className="h-4 w-4" />
                  </Button>

                  <div className="flex-1 text-center font-display font-bold text-xl text-white">
                    {joinQuantity} {selectedPoolForJoin.unit}
                  </div>

                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setJoinQuantity(joinQuantity + selectedPoolForJoin.step)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Calculated Cost Share */}
              <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Your Merchandise Share:</span>
                  <span className="text-xl font-display font-bold text-white tabular-nums">
                    ₹{(joinQuantity * selectedPoolForJoin.currentTierPrice).toLocaleString('en-IN')}
                  </span>
                </div>
                <Badge variant="payment" className="text-xs">
                  Pay at Join (Sandbox)
                </Badge>
              </div>

              <p className="text-[11px] text-midnight-muted">
                You will be charged minor integer paise units via PayPal Sandbox adapter. If pool fails to reach MOQ within 72 hours, 100% refund is initiated automatically.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedPoolForJoin(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmJoin}
              className="text-xs font-semibold"
            >
              Confirm Participation &amp; Pay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}

export default LandingPage;
