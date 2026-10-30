import React, { useState } from 'react';
import {
  Search,
  MapPin,
  ShoppingCart,
  Building2,
  ChevronDown,
  ShieldCheck,
  Flame,
  Menu,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Toaster, toast } from '@/components/ui/Toast';

export function PublicLayout({
  children,
  onOpenHowItWorks,
  onCategorySelect,
  selectedCategory,
  searchQuery,
  setSearchQuery,
  location = 'Lucknow 226001',
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const categories = [
    { id: 'all', label: 'All Categories' },
    { id: 'group-buys', label: '🔥 Active Group Buys', highlight: true },
    { id: 'packaging', label: 'Packaging & Disposables' },
    { id: 'food', label: 'Food & Beverages' },
    { id: 'grains', label: 'Grains & Pulses' },
    { id: 'cleaning', label: 'Cleaning & Hygiene' },
    { id: 'kitchen', label: 'Commercial Kitchen' },
  ];

  return (
    <div className="min-h-screen bg-midnight-bg text-midnight-text flex flex-col font-sans">
      <Toaster />

      {/* Top Test Environment Announcement Bar */}
      <div className="bg-gradient-to-r from-midnight-red/20 via-midnight-card to-midnight-emerald/20 border-b border-midnight-border/60 py-1.5 px-4 text-center text-xs font-medium text-slate-300 flex items-center justify-center gap-2">
        <Badge variant="warning" className="text-[10px] py-0 px-1.5 uppercase font-bold tracking-wider">
          Demo Environment
        </Badge>
        <span>
          Collective B2B Buying Prototype &bull; Regional Demand Pooling Live in <strong>Lucknow Hub</strong>
        </span>
      </div>

      {/* Primary Sticky Marketplace Header */}
      <header className="sticky top-0 z-40 glass-nav">
        <div className="marketplace-container">
          <div className="flex items-center justify-between h-16 gap-4 lg:gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col">
                <a href="#" className="flex items-center gap-2 group">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-midnight-red to-rose-700 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-red-950/50">
                    आ
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-display font-bold text-lg tracking-tight text-white group-hover:text-red-400 transition-colors">
                      Aap Ki Dukan
                    </span>
                    <span className="text-[10px] text-midnight-muted tracking-wider uppercase -mt-1 font-medium">
                      Powered by <span className="text-midnight-red font-semibold">CoBuy AI</span>
                    </span>
                  </div>
                </a>
              </div>

              {/* Location Badge */}
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-midnight-surface/60 border border-midnight-border/50 text-xs text-midnight-muted hover:border-midnight-border transition-colors cursor-pointer">
                <MapPin className="h-3.5 w-3.5 text-midnight-red shrink-0" />
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-[10px] text-slate-400">Deliver to</span>
                  <span className="font-semibold text-white">{location}</span>
                </div>
              </div>
            </div>

            {/* Global Marketplace Search Bar */}
            <div className="flex-1 min-w-0 max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-2 md:mx-4 xl:mx-8 hidden sm:block">
              <div className="relative flex items-center">
                <div className="relative w-full flex">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search wholesale products, cartons, verified suppliers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-10 pr-24 rounded-lg border border-midnight-border bg-midnight-card text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-midnight-red focus:border-midnight-red transition-all"
                    />
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-midnight-muted" />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="absolute right-1 top-1 bottom-1 h-8 px-4 rounded-md font-semibold text-xs"
                    onClick={() => {
                      toast.info(`Searching for "${searchQuery || 'wholesale pools'}" in Lucknow Region`);
                    }}
                  >
                    Search
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Action Links */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onOpenHowItWorks}
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-midnight-surface transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-midnight-gold" />
                <span>How It Works</span>
              </button>

              <button
                type="button"
                onClick={() => toast.info('Business Sign In will connect with Prakhar’s JWT Auth')}
                className="text-xs font-medium text-midnight-muted hover:text-white px-2 py-1.5 transition-colors cursor-pointer hidden sm:block"
              >
                Sign In
              </button>

              <Button
                variant="primary"
                size="sm"
                className="font-semibold text-xs"
                onClick={() => toast.success('Registration module available in Wave 2')}
              >
                Register Business
              </Button>

              {/* Mobile menu button */}
              <button
                type="button"
                className="sm:hidden p-2 text-midnight-muted hover:text-white"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Search input */}
          <div className="sm:hidden pb-3 pt-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search products or suppliers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-20 rounded-md border border-midnight-border bg-midnight-card text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-midnight-red"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-midnight-muted" />
              <Button
                variant="primary"
                size="sm"
                className="absolute right-0.5 top-0.5 bottom-0.5 h-8 px-2.5 text-[11px]"
                onClick={() => toast.info(`Searching for "${searchQuery || 'pools'}"`)}
              >
                Go
              </Button>
            </div>
          </div>
        </div>

        {/* Category Navigation Bar */}
        <div className="w-full max-w-full border-t border-midnight-border/50 bg-midnight-card/70 overflow-x-auto scrollbar-none">
          <div className="marketplace-container flex items-center gap-1 sm:gap-2 xl:gap-3 py-1.5 min-w-max">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => onCategorySelect && onCategorySelect(cat.id)}
                  className={`text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-midnight-red text-white shadow-sm shadow-red-950/40'
                      : cat.highlight
                      ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 border border-amber-500/20'
                      : 'text-midnight-muted hover:text-white hover:bg-midnight-surface'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full">{children}</main>

      {/* Marketplace Comprehensive Footer */}
      <footer className="border-t border-midnight-border bg-midnight-card/90 mt-20 pt-14 pb-10">
        <div className="marketplace-container">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 xl:gap-12 mb-12">
            {/* Col 1: Brand Info */}
            <div className="col-span-2 text-left space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-midnight-red flex items-center justify-center text-white font-bold text-sm">
                  आ
                </div>
                <span className="font-display font-bold text-lg text-white">
                  Aap Ki Dukan
                </span>
              </div>
              <p className="text-xs text-midnight-muted leading-relaxed max-w-md xl:max-w-lg">
                India’s first Collective B2B Procurement Marketplace. We empower independent kirana stores, cafes, and retailers to aggregate purchasing power, unlock factory bulk tiers, and verify transparent pricing.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <Badge variant="provenance" className="text-[11px]">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Verified Wholesalers Only
                </Badge>
                <Badge variant="payment" className="text-[11px]">
                  INR Minor Unit Billing
                </Badge>
              </div>
            </div>

            {/* Col 2: Product Categories */}
            <div className="text-left space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white font-display">
                Wholesale Categories
              </h4>
              <ul className="space-y-1.5 text-xs text-midnight-muted">
                <li><a href="#" className="hover:text-white transition-colors">Packaging & Cups</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Edible Oils & Ghee</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Spices & Condiments</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Bulk Pulses & Rice</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Commercial Cleaning</a></li>
              </ul>
            </div>

            {/* Col 3: For Retailers */}
            <div className="text-left space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white font-display">
                For Retailers
              </h4>
              <ul className="space-y-1.5 text-xs text-midnight-muted">
                <li>
                  <button onClick={onOpenHowItWorks} className="hover:text-white transition-colors text-left">
                    How Group Buying Works
                  </button>
                </li>
                <li><a href="#" className="hover:text-white transition-colors">Wholesale MOQ Rules</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Group Savings Calculator</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Regional Hubs</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Sample Orders</a></li>
              </ul>
            </div>

            {/* Col 4: Trust & Transparency */}
            <div className="text-left space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white font-display">
                Trust & Governance
              </h4>
              <ul className="space-y-1.5 text-xs text-midnight-muted">
                <li><a href="#" className="hover:text-white transition-colors">Supplier Provenance</a></li>
                <li><a href="#" className="hover:text-white transition-colors">72h Pool Rules</a></li>
                <li><a href="#" className="hover:text-white transition-colors">24h Consent Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Transparent Allocations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">PayPal Sandbox Test Mode</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-midnight-border/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>
              &copy; 2026 Aap Ki Dukan &bull; Powered by CoBuy AI. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-slate-400">Terms of Procurement</a>
              <a href="#" className="hover:text-slate-400">Privacy Policy</a>
              <a href="#" className="hover:text-slate-400">Security Disclosures</a>
              <span className="text-slate-600">v1.0-wave1</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
