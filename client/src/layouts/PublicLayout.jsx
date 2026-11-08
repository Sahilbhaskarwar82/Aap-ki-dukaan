import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Menu,
  X,
  Sparkles,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Toaster, toast } from '@/components/ui/Toast';
import { useOptionalAuth } from '@/context/AuthContext';

export function PublicLayout({
  children,
  onOpenHowItWorks,
  onCategorySelect,
  selectedCategory,
  searchQuery,
  setSearchQuery,
  location = 'Lucknow 226001',
  onNavigateToLogin,
  onNavigateToRegister,
  onNavigate,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const authContext = useOptionalAuth();
  const user = authContext?.user;
  const isAuthenticated = !!authContext?.isAuthenticated;

  const handleDashboard = () => {
    const roleHome =
      user?.role === 'SUPPLIER'
        ? '/supplier-portal'
        : user?.role === 'ADMIN' || user?.role === 'REVIEWER'
        ? '/admin'
        : '/dashboard';

    if (typeof onNavigate === 'function') {
      onNavigate(roleHome);
    } else if (typeof onNavigateToLogin === 'function') {
      onNavigateToLogin();
    } else if (typeof window !== 'undefined') {
      window.location.href = roleHome;
    }
  };

  const handleSignIn = () => {
    if (typeof onNavigateToLogin === 'function') {
      onNavigateToLogin();
    } else if (typeof onNavigate === 'function') {
      onNavigate('/login');
    } else if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const handleRegister = () => {
    if (typeof onNavigateToRegister === 'function') {
      onNavigateToRegister();
    } else if (typeof onNavigate === 'function') {
      onNavigate('/register');
    } else if (typeof window !== 'undefined') {
      window.location.href = '/register';
    }
  };

  const categories = [
    { id: 'all', label: 'All Categories' },
    { id: 'group-buys', label: 'Active Group Buys', highlight: true },
    { id: 'packaging', label: 'Packaging & Disposables' },
    { id: 'food', label: 'Cooking Oils & Ghee' },
    { id: 'grains', label: 'Grains & Pulses' },
    { id: 'cleaning', label: 'Cleaning & Hygiene' },
    { id: 'spices', label: 'Spices & Condiments' },
    { id: 'kitchen', label: 'Commercial Kitchen' },
  ];

  return (
    <div className="min-h-screen bg-[#080A0F] text-[#EEF0F5] flex flex-col font-sans">
      <Toaster />

      {/* Primary Sticky Marketplace Header */}
      <header className="sticky top-0 z-40 bg-[#080A0F]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="marketplace-container">
          <div className="flex items-center justify-between h-16 gap-4 lg:gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col">
                <a href="#" className="flex items-center gap-2.5 group">
                  <div className="h-8 w-8 rounded-md bg-red-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                    आ
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-display font-semibold text-lg tracking-tight text-white group-hover:text-red-400 transition-colors">
                      Aap Ki Dukan
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono -mt-0.5">
                      B2B Procurement &bull; <span className="text-slate-400">CoBuy AI</span>
                    </span>
                  </div>
                </a>
              </div>

              {/* Location Badge */}
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Hub</span>
                  <span className="font-medium text-slate-200">{location}</span>
                </div>
              </div>
            </div>

            {/* Global Marketplace Search Bar */}
            <div className="flex-1 min-w-0 max-w-3xl xl:max-w-4xl mx-2 md:mx-4 hidden sm:block">
              <div className="relative flex items-center">
                <div className="relative w-full flex">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search wholesale products, cartons, verified suppliers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-10 pr-24 rounded-lg border border-slate-800 bg-slate-900/60 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-700 focus:bg-slate-900 transition-colors"
                    />
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute right-1 top-1 bottom-1 h-8 px-3.5 rounded-md font-medium text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60"
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
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                <span>How It Works</span>
              </button>

              {isAuthenticated && user ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="font-semibold text-xs"
                  onClick={handleDashboard}
                  aria-label="Open Dashboard"
                >
                  Dashboard
                </Button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="text-xs font-medium text-slate-400 hover:text-white px-2.5 py-1.5 transition-colors cursor-pointer hidden sm:block"
                    aria-label="Sign in"
                  >
                    Sign In
                  </button>

                  <Button
                    variant="primary"
                    size="sm"
                    className="font-semibold text-xs"
                    onClick={handleRegister}
                    aria-label="Register business"
                  >
                    Register Business
                  </Button>
                </>
              )}

              {/* Mobile menu button */}
              <button
                type="button"
                className="sm:hidden p-2 text-slate-400 hover:text-white"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile navigation panel */}
          {mobileMenuOpen && (
            <div
              role="region"
              aria-label="Mobile menu"
              className="sm:hidden border-t border-slate-800 bg-slate-900/95 py-3 px-2 space-y-2"
            >
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (onOpenHowItWorks) onOpenHowItWorks();
                }}
                className="w-full text-left text-xs font-medium text-slate-300 hover:text-white py-1.5 px-2 flex items-center gap-1.5 rounded hover:bg-slate-800"
              >
                <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                <span>How It Works</span>
              </button>
              {isAuthenticated && user ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full font-semibold text-xs justify-center"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleDashboard();
                  }}
                  aria-label="Open Dashboard"
                >
                  Return to Dashboard
                </Button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleSignIn();
                    }}
                    className="w-full text-left text-xs font-medium text-midnight-muted hover:text-white py-1.5 px-2 rounded hover:bg-midnight-surface"
                  >
                    Sign In
                  </button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full font-semibold text-xs justify-center"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleRegister();
                    }}
                  >
                    Register Business
                  </Button>
                </>
              )}
            </div>
          )}

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
        <div className="w-full max-w-full border-t border-white/[0.08] bg-[#0B0D14]/80 backdrop-blur-sm overflow-x-auto scrollbar-none">
          <div className="marketplace-container flex items-center gap-1.5 py-2 min-w-max">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => onCategorySelect && onCategorySelect(cat.id)}
                  className={`text-xs font-medium px-3.5 py-1.5 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : cat.highlight
                      ? 'text-red-400 hover:text-white hover:bg-slate-800/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
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
      <footer className="border-t border-white/[0.08] bg-[#07080D] mt-20 pt-14 pb-10 text-left">
        <div className="marketplace-container">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 xl:gap-12 mb-12">
            {/* Col 1: Brand Info */}
            <div className="col-span-2 text-left space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-red-600 flex items-center justify-center text-white font-bold text-sm">
                  आ
                </div>
                <span className="font-display font-semibold text-lg text-white">
                  Aap Ki Dukan
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-md xl:max-w-lg">
                India’s first Collective B2B Procurement Marketplace. We empower independent kirana stores, cafes, and retailers to aggregate purchasing power, unlock factory bulk tiers, and verify transparent pricing.
              </p>
              <div className="flex items-center gap-2 pt-1 text-xs text-slate-400 font-mono">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-emerald-400">
                  <ShieldCheck className="h-3 w-3" />
                  Verified Wholesalers Only
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                  INR Minor Unit Billing
                </span>
              </div>
            </div>

            {/* Col 2: Product Categories */}
            <div className="text-left space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white font-mono">
                Wholesale Categories
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Packaging & Cups</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Edible Oils & Ghee</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Spices & Condiments</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Bulk Pulses & Rice</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Commercial Cleaning</a></li>
              </ul>
            </div>

            {/* Col 3: For Retailers */}
            <div className="text-left space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white font-mono">
                For Retailers
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li>
                  <button onClick={onOpenHowItWorks} className="hover:text-white transition-colors text-left cursor-pointer">
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
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white font-mono">
                Trust & Governance
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Supplier Provenance</a></li>
                <li><a href="#" className="hover:text-white transition-colors">72h Pool Rules</a></li>
                <li><a href="#" className="hover:text-white transition-colors">24h Consent Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Transparent Allocations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">PayPal Sandbox Test Mode</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-slate-800/80 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>
              &copy; 2026 Aap Ki Dukan &bull; Powered by CoBuy AI. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-slate-400 transition-colors">Terms of Procurement</a>
              <a href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-slate-400 transition-colors">Security Disclosures</a>
              <span className="text-slate-600 font-mono">v1.0.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
