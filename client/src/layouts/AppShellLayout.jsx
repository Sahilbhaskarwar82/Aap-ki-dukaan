/**
 * CoBuy AI — AppShellLayout (HIM-05)
 *
 * Authenticated application shell:
 *  - Responsive sidebar with role-tailored navigation
 *  - Top header bar with branding, role badge, notification bell & user menu
 *  - Interactive notification popover with real-time unread count
 *  - Mobile sliding drawer with backdrop overlay
 *  - Accessible keyboard navigation & ARIA landmarks
 *  - Renders children (or router Outlet)
 *
 * Midnight Commerce Design System:
 *  - Background: #080A0F (bg-midnight-bg)
 *  - Card/Surface: #111620 / #202938
 *  - Border: #293241
 *  - Text: #F5F5F7 / #A1A8B3
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  ShoppingBag,
  LayoutDashboard,
  FileText,
  Store,
  Users,
  Package,
  CreditCard,
  Bell,
  User,
  LogOut,
  Menu,
  X,
  CheckCheck,
  ChevronDown,
  Shield,
  Eye,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { Badge } from '@/components/ui/Badge';

// ── Role navigation definitions ───────────────────────────────────────────────
export const ROLE_NAVIGATION = {
  SHOP_OWNER: [
    { label: 'Marketplace',         path: '/',              icon: ShoppingBag },
    { label: 'Dashboard',           path: '/dashboard',     icon: LayoutDashboard },
    { label: 'Requirements',        path: '/requirements',  icon: FileText },
    { label: 'Supplier Catalogue',  path: '/suppliers',     icon: Store },
    { label: 'Group Buys',          path: '/group-buys',    icon: Users },
    { label: 'Orders',              path: '/orders',        icon: Package },
    { label: 'Payments & Refunds',  path: '/payments',      icon: CreditCard },
    { label: 'Notifications',       path: '/notifications', icon: Bell },
    { label: 'Shop Profile',        path: '/profile',       icon: User },
  ],
  SUPPLIER: [
    { label: 'Marketplace',         path: '/',                icon: ShoppingBag },
    { label: 'Supplier Portal',     path: '/supplier-portal', icon: Store },
    { label: 'Notifications',       path: '/notifications',   icon: Bell },
    { label: 'Profile',             path: '/profile',         icon: User },
  ],
  ADMIN: [
    { label: 'Marketplace',             path: '/',                icon: ShoppingBag },
    { label: 'Admin Overview',          path: '/admin',           icon: LayoutDashboard },
    { label: 'Manage Suppliers',        path: '/admin/suppliers', icon: Store },
    { label: 'Manage Offers',           path: '/admin/offers',    icon: SlidersHorizontal },
    { label: 'Pools & Reconciliation',  path: '/admin/pools',     icon: Users },
    { label: 'Audit & AI Logs',         path: '/admin/audit',     icon: Shield },
    { label: 'Notifications',           path: '/notifications',   icon: Bell },
  ],
  REVIEWER: [
    { label: 'Marketplace',     path: '/',                icon: ShoppingBag },
    { label: 'Admin Overview',  path: '/admin',           icon: LayoutDashboard },
    { label: 'Audit & AI Logs', path: '/admin/audit',     icon: Eye },
    { label: 'Notifications',   path: '/notifications',   icon: Bell },
  ],
};

/**
 * Returns navigation links for a given user role.
 */
export function getNavItemsForRole(role) {
  return ROLE_NAVIGATION[role] || [];
}

const ROLE_BADGE_VARIANT = {
  SHOP_OWNER: 'success',
  SUPPLIER:   'pool',
  ADMIN:      'warning',
  REVIEWER:   'neutral',
};

const ROLE_DISPLAY_NAMES = {
  SHOP_OWNER: 'Shop Owner',
  SUPPLIER:   'Wholesaler',
  ADMIN:      'Admin',
  REVIEWER:   'Reviewer',
};

export default function AppShellLayout({
  children,
  currentPath = '/dashboard',
  onNavigate,
  title,
  subtitle,
  actions,
}) {
  const { user, shop, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const [mobileOpen, setMobileOpen]       = useState(false);
  const [notifOpen, setNotifOpen]         = useState(false);
  const [userMenuOpen, setUserMenuOpen]   = useState(false);

  const notifRef   = useRef(null);
  const userRef    = useRef(null);

  const navItems = getNavItemsForRole(user?.role);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleNav(path) {
    setMobileOpen(false);
    if (typeof onNavigate === 'function') {
      onNavigate(path);
    }
  }

  return (
    <div className="min-h-screen bg-midnight-bg text-midnight-text flex flex-col">

      {/* ── Top Header Bar ── */}
      <header
        className="sticky top-0 z-30 h-16 border-b border-midnight-border bg-midnight-card/90 backdrop-blur px-4 lg:px-6 flex items-center justify-between"
        role="banner"
      >
        {/* Left: Mobile hamburger & Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 rounded-md text-midnight-muted hover:text-midnight-text hover:bg-midnight-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onClick={() => handleNav('/')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleNav('/');
              }
            }}
            aria-label="CoBuy AI Marketplace Home"
          >
            <div className="h-9 w-9 rounded-lg bg-midnight-red/10 border border-midnight-red/30 flex items-center justify-center text-midnight-red">
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="hidden sm:block">
              <span className="font-space-grotesk font-bold text-base tracking-tight text-white">
                CoBuy AI
              </span>
              <span className="block text-[10px] text-midnight-muted uppercase tracking-wider">
                Aap Ki Dukan
              </span>
            </div>
          </div>
        </div>

        {/* Right: Role Badge, Notifications Bell, User Menu */}
        <div className="flex items-center gap-3">

          {/* Role badge */}
          {user?.role && (
            <Badge
              variant={ROLE_BADGE_VARIANT[user.role] || 'neutral'}
              className="hidden sm:inline-flex text-xs px-2.5 py-0.5 font-medium"
            >
              {ROLE_DISPLAY_NAMES[user.role] || user.role}
            </Badge>
          )}

          {/* ── Notification Bell Dropdown ── */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              aria-label={`Notifications (${unreadCount} unread)`}
              aria-haspopup="true"
              aria-expanded={notifOpen}
              onClick={() => setNotifOpen((v) => !v)}
              className="relative p-2 rounded-lg text-midnight-muted hover:text-midnight-text hover:bg-midnight-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red transition-colors"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span
                  data-testid="unread-badge"
                  className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-midnight-red px-1 text-[10px] font-bold text-white shadow"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification popover */}
            {notifOpen && (
              <div
                role="region"
                aria-label="Notification center"
                className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-midnight-border bg-midnight-card shadow-2xl shadow-black/80 z-50 overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-midnight-border px-4 py-3 bg-midnight-surface/50">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-midnight-text">Notifications</span>
                    {unreadCount > 0 && (
                      <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                        {unreadCount} new
                      </Badge>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllAsRead()}
                      className="inline-flex items-center gap-1 text-xs text-midnight-muted hover:text-midnight-text transition-colors"
                    >
                      <CheckCheck className="h-3.5 w-3.5 text-midnight-emerald" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-midnight-border/60">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-midnight-muted">
                      No notifications yet.
                    </div>
                  ) : (
                    notifications.slice(0, 5).map((n) => (
                      <div
                        key={n._id}
                        onClick={() => {
                          if (!n.isRead) markAsRead(n._id);
                          if (n.linkUrl) handleNav(n.linkUrl);
                          setNotifOpen(false);
                        }}
                        className={`p-3 text-left hover:bg-midnight-surface/70 cursor-pointer transition-colors ${
                          !n.isRead ? 'bg-midnight-surface/30' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-midnight-text leading-snug">
                            {n.title}
                          </p>
                          {!n.isRead && (
                            <span className="h-2 w-2 rounded-full bg-midnight-red flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-midnight-muted line-clamp-2 mt-0.5">
                          {n.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-midnight-border p-2 bg-midnight-surface/30 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      handleNav('/notifications');
                      setNotifOpen(false);
                    }}
                    className="text-xs text-midnight-red hover:text-red-400 font-medium inline-flex items-center gap-1 py-1"
                  >
                    View all notifications
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── User Avatar & Dropdown ── */}
          <div className="relative" ref={userRef}>
            <button
              type="button"
              aria-label="User profile menu"
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-midnight-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-midnight-surface border border-midnight-border flex items-center justify-center text-midnight-text font-semibold text-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-medium text-midnight-text leading-tight truncate max-w-[120px]">
                  {user?.name || 'Account'}
                </p>
                <p className="text-[10px] text-midnight-muted truncate max-w-[120px]">
                  {shop?.name || ROLE_DISPLAY_NAMES[user?.role] || ''}
                </p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-midnight-muted hidden sm:block" />
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                aria-label="User account menu"
                className="absolute right-0 mt-2 w-56 rounded-xl border border-midnight-border bg-midnight-card shadow-2xl shadow-black/80 z-50 p-1 divide-y divide-midnight-border/60"
              >
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold text-midnight-text truncate">{user?.name}</p>
                  <p className="text-[10px] text-midnight-muted truncate">{user?.email}</p>
                  {shop && (
                    <p className="text-[10px] text-midnight-emerald truncate mt-0.5">
                      🏪 {shop.name}
                    </p>
                  )}
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleNav('/profile');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-midnight-text hover:bg-midnight-surface rounded-md transition-colors"
                  >
                    <User className="h-3.5 w-3.5 text-midnight-muted" />
                    Manage Profile
                  </button>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-midnight-rose hover:bg-midnight-rose/10 rounded-md transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ── Main Body: Sidebar + Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Desktop Sidebar ── */}
        <aside
          aria-label="Sidebar navigation"
          className="hidden lg:flex w-64 flex-col border-r border-midnight-border bg-midnight-card p-4 space-y-1 overflow-y-auto"
        >
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-midnight-muted">
            {ROLE_DISPLAY_NAMES[user?.role] || 'Menu'}
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/'
                  ? currentPath === '/'
                  : currentPath === item.path || currentPath.startsWith(`${item.path}/`);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => handleNav(item.path)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-midnight-red text-white shadow-sm shadow-red-950/40'
                      : 'text-midnight-muted hover:text-midnight-text hover:bg-midnight-surface'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-4 border-t border-midnight-border/60">
            <button
              type="button"
              onClick={() => logout()}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-midnight-muted hover:text-midnight-rose hover:bg-midnight-rose/10 transition-colors"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        {/* ── Mobile Sliding Drawer ── */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer panel */}
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              className="relative w-72 max-w-[80vw] bg-midnight-card border-r border-midnight-border p-4 flex flex-col z-50 space-y-2"
            >
              <div className="flex items-center justify-between pb-3 border-b border-midnight-border">
                <div
                  className="flex items-center gap-2 cursor-pointer select-none"
                  onClick={() => handleNav('/')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNav('/');
                    }
                  }}
                  aria-label="CoBuy AI Marketplace Home"
                >
                  <ShoppingBag className="h-5 w-5 text-midnight-red" />
                  <span className="font-space-grotesk font-bold text-sm text-white">CoBuy AI</span>
                </div>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-md text-midnight-muted hover:text-midnight-text hover:bg-midnight-surface"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-2 py-1">
                {user?.role && (
                  <Badge variant={ROLE_BADGE_VARIANT[user.role]} className="text-[10px]">
                    {ROLE_DISPLAY_NAMES[user.role]}
                  </Badge>
                )}
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.path === '/'
                      ? currentPath === '/'
                      : currentPath === item.path || currentPath.startsWith(`${item.path}/`);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => handleNav(item.path)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-midnight-red text-white'
                          : 'text-midnight-muted hover:text-midnight-text hover:bg-midnight-surface'
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="pt-3 border-t border-midnight-border">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-midnight-rose hover:bg-midnight-rose/10 rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Content Area ── */}
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
          role="main"
        >
          {/* Optional page header */}
          {(title || actions) && (
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-midnight-border/40 pb-4">
              <div>
                {title && (
                  <h1 className="text-2xl font-bold tracking-tight text-midnight-text font-space-grotesk">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-1 text-xs text-midnight-muted">{subtitle}</p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
          )}

          {/* Child content or router Outlet */}
          {children}
        </main>

      </div>
    </div>
  );
}
