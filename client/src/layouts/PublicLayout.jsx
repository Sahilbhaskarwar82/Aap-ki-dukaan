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
    { id: 'food', label: 'Food & Beverages' },
    { id: 'grains', label: 'Grains & Pulses' },
    { id: 'cleaning', label: 'Cleaning & Hygiene' },
    { id: 'kitchen', label: 'Commercial Kitchen' },
  ];

  return (
    <div className="min-h-screen bg-[#030307] text-[#EEF0F5] flex flex-col font-sans relative overflow-x-hidden selection:bg-pink-500/30 selection:text-white">
      {/* Background ambient cosmic glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.12),rgba(236,72,153,0.06),transparent_70%)] blur-3xl" />
        <div className="absolute top-[35%] right-[-10%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(129,140,248,0.08),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-[10%] left-[-10%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(236,72,153,0.07),transparent_70%)] blur-3xl" />
      </div>

      <Toaster />

      {/* Primary Sticky Marketplace Header */}
      <header className="sticky top-0 z-40 bg-[#030307]/85 backdrop-blur-xl border-b border-purple-500/20">
        <div className="marketplace-container">
          <div className="flex items-center justify-between h-16 gap-4 lg:gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col">
                <a href="#" className="flex items-center gap-2.5 group">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 via-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-[0_0_15px_rgba(236,72,153,0.4)]">
                    आ
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-display font-semibold text-lg tracking-tight text-white group-hover:text-pink-300 transition-colors">
                      Aap Ki Dukan
                    </span>
                    <span className="text-[11px] text-purple-300/70 font-mono -mt-0.5">
                      B2B Procurement &bull; <span className="text-purple-300/90 font-medium">CoBuy AI</span>
                    </span>
                  </div>
                </a>
              </div>

              {/* Location Badge */}
              <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-950/30 border border-purple-500/20 text-xs text-purple-200/80">
                <MapPin className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-[9px] text-purple-400 font-mono uppercase tracking-wider">Hub</span>
                  <span className="font-medium text-white">{location}</span>
                </div>
              </div>
            </div>

            {/* Global Marketplace Search Bar */}
            <div className="flex-1 min-w-0 max-w-3xl xl:max-w-4xl mx-2 md:mx-4 hidden sm:block">
              <div className="relative flex items-center">
                <div className="relative w-full flex items-center">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search wholesale products, cartons, verified suppliers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-10 pr-24 rounded-full border border-purple-500/25 bg-[#090A14]/90 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-pink-500/60 focus:bg-[#0E1020] focus:shadow-[0_0_20px_rgba(236,72,153,0.25)] transition-all"
                    />
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute right-1 top-1 bottom-1 h-8 px-4 rounded-full font-medium text-xs bg-purple-600/30 hover:bg-purple-600/50 text-white border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.25)] transition-all"
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
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-full hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5 text-purple-400" />
                <span>How It Works</span>
              </button>

              {isAuthenticated && user ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="rounded-full font-semibold text-xs px-4 h-8 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white border border-pink-400/50 shadow-[0_0_15px_rgba(236,72,153,0.35)]"
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
                    className="text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 transition-colors cursor-pointer hidden sm:block"
                    aria-label="Sign in"
                  >
                    Sign In
                  </button>

                  <Button
                    variant="primary"
                    size="sm"
                    className="rounded-full font-semibold text-xs px-4 h-8 bg-gradient-to-r from-pink-500/20 to-purple-600/20 border border-pink-500/70 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:shadow-[0_0_25px_rgba(236,72,153,0.5)] hover:border-pink-400 transition-all cursor-pointer"
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
                className="sm:hidden p-2 text-purple-300 hover:text-white"
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
              className="sm:hidden border-t border-purple-500/20 bg-[#090A14]/95 backdrop-blur-xl py-3 px-2 space-y-2 rounded-b-xl"
            >
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (onOpenHowItWorks) onOpenHowItWorks();
                }}
                className="w-full text-left text-xs font-medium text-purple-200 hover:text-white py-2 px-3 flex items-center gap-1.5 rounded-lg hover:bg-purple-950/40"
              >
                <HelpCircle className="h-3.5 w-3.5 text-purple-400" />
                <span>How It Works</span>
              </button>
              {isAuthenticated && user ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full rounded-full font-semibold text-xs justify-center bg-gradient-to-r from-pink-500 to-purple-600 text-white"
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
                    className="w-full text-left text-xs font-medium text-slate-300 hover:text-white py-2 px-3 rounded-lg hover:bg-purple-950/40"
                  >
                    Sign In
                  </button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full rounded-full font-semibold text-xs justify-center bg-gradient-to-r from-pink-500/20 to-purple-600/20 border border-pink-500/70 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)]"
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
                className="w-full h-9 pl-9 pr-20 rounded-full border border-purple-500/25 bg-[#090A14] text-xs text-white placeholder-slate-400 focus:outline-none focus:border-pink-500/60"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-purple-400" />
              <Button
                variant="primary"
                size="sm"
                className="absolute right-0.5 top-0.5 bottom-0.5 h-8 px-3 rounded-full text-[11px] bg-gradient-to-r from-pink-500 to-purple-600 text-white"
                onClick={() => toast.info(`Searching for "${searchQuery || 'pools'}"`)}
              >
                Go
              </Button>
            </div>
          </div>
        </div>

        {/* Category Navigation Bar */}
        <div className="w-full max-w-full border-t border-purple-500/15 bg-[#05060C]/90 backdrop-blur-md overflow-x-auto scrollbar-none">
          <div className="marketplace-container flex items-center gap-2 py-2.5 min-w-max">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => onCategorySelect && onCategorySelect(cat.id)}
                  className={`text-xs font-medium px-4 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)] border border-pink-400/50'
                      : cat.highlight
                      ? 'border border-pink-500/40 bg-pink-500/10 text-pink-300 hover:border-pink-500/70 hover:bg-pink-500/20 shadow-[0_0_10px_rgba(236,72,153,0.2)]'
                      : 'border border-purple-500/15 bg-white/[0.02] text-slate-400 hover:text-white hover:border-purple-500/35 hover:bg-purple-500/10'
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
      <main className="flex-1 w-full relative z-10">{children}</main>

      {/* Marketplace Comprehensive Footer */}
      <footer className="border-t border-purple-500/15 bg-[#020306] mt-20 pt-14 pb-10 text-left relative z-10">
        <div className="marketplace-container">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 xl:gap-12 mb-12">
            {/* Col 1: Brand Info */}
            <div className="col-span-2 text-left space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-[0_0_10px_rgba(236,72,153,0.4)]">
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
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/30 border border-purple-500/30 text-[11px] text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                  <ShieldCheck className="h-3 w-3 text-pink-400" />
                  Verified Wholesalers Only
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-950/30 border border-purple-500/30 text-[11px] text-slate-300">
                  INR Minor Unit Billing
                </span>
              </div>
            </div>

            {/* Col 2: Product Categories */}
            <div className="text-left space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-300 font-mono">
                Wholesale Categories
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li><a href="#" className="hover:text-pink-300 transition-colors">Packaging &amp; Cups</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Edible Oils &amp; Ghee</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Spices &amp; Condiments</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Bulk Pulses &amp; Rice</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Commercial Cleaning</a></li>
              </ul>
            </div>

            {/* Col 3: For Retailers */}
            <div className="text-left space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-300 font-mono">
                For Retailers
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li>
                  <button onClick={onOpenHowItWorks} className="hover:text-pink-300 transition-colors text-left cursor-pointer">
                    How Group Buying Works
                  </button>
                </li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Wholesale MOQ Rules</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Group Savings Calculator</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Regional Hubs</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Sample Orders</a></li>
              </ul>
            </div>

            {/* Col 4: Trust & Governance */}
            <div className="text-left space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-300 font-mono">
                Trust &amp; Governance
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li><a href="#" className="hover:text-pink-300 transition-colors">Supplier Provenance</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">72h Pool Rules</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">24h Consent Policy</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">Transparent Allocations</a></li>
                <li><a href="#" className="hover:text-pink-300 transition-colors">PayPal Sandbox Test Mode</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-purple-500/15 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>
              &copy; 2026 Aap Ki Dukan &bull; Powered by CoBuy AI. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-slate-400 transition-colors">Terms of Procurement</a>
              <a href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-slate-400 transition-colors">Security Disclosures</a>
              <span className="text-purple-400 font-mono">v1.0.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
