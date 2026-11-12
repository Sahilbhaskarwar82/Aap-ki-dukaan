import {
  ShoppingBag,
  LayoutDashboard,
  Store,
  Users,
  Package,
  CreditCard,
  Bell,
  User,
  Shield,
  Eye,
  SlidersHorizontal,
  Flame,
  Layers,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

export const ROLE_NAVIGATION = {
  SHOP_OWNER: [
    { label: 'Marketplace', path: '/', icon: ShoppingBag },
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Supplier Catalogue', path: '/suppliers', icon: Store },
    { label: 'Group Buys', path: '/group-buys', icon: Users },
    { label: 'Orders', path: '/orders', icon: Package },
    { label: 'Payments & Refunds', path: '/payments', matchPaths: ['/payments', '/refunds'], icon: CreditCard },
    { label: 'Notifications', path: '/notifications', icon: Bell },
    { label: 'Shop Profile', path: '/profile', icon: User },
  ],
  SUPPLIER: [
    { label: 'Marketplace', path: '/', icon: ShoppingBag },
    { label: 'Supplier Portal', path: '/supplier-portal', icon: Store },
    { label: 'Notifications', path: '/notifications', icon: Bell },
    { label: 'Profile', path: '/profile', icon: User },
  ],
  ADMIN: [
    { label: 'Marketplace', path: '/', icon: ShoppingBag },
    { label: 'Admin Overview', path: '/admin', exact: true, icon: LayoutDashboard },
    { label: 'Manage Suppliers', path: '/admin/suppliers', icon: Store },
    { label: 'Manage Offers', path: '/admin/offers', icon: SlidersHorizontal },
    { label: 'Pools & Reconciliation', path: '/admin/pools', icon: Users },
    { label: 'Audit & AI Logs', path: '/admin/audit', icon: Shield },
    { label: 'Notifications', path: '/notifications', icon: Bell },
  ],
  REVIEWER: [
    { label: 'Marketplace', path: '/', icon: ShoppingBag },
    { label: 'Admin Overview', path: '/admin', exact: true, icon: LayoutDashboard },
    { label: 'Audit & AI Logs', path: '/admin/audit', icon: Eye },
    { label: 'Notifications', path: '/notifications', icon: Bell },
  ],
};

// Role-tailored collapsible menu sections (excluding pinned Marketplace root item)
export const ROLE_NAV_GROUPS = {
  SHOP_OWNER: [
    {
      id: 'sourcing',
      label: 'Sourcing & Pools',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Supplier Catalogue', path: '/suppliers', icon: Store },
        { label: 'Group Buys', path: '/group-buys', icon: Users },
        { label: 'Orders', path: '/orders', icon: Package },
      ],
    },
    {
      id: 'finance-account',
      label: 'Finance & Account',
      items: [
        { label: 'Payments & Refunds', path: '/payments', matchPaths: ['/payments', '/refunds'], icon: CreditCard },
        { label: 'Notifications', path: '/notifications', icon: Bell },
        { label: 'Shop Profile', path: '/profile', icon: User },
      ],
    },
  ],
  SUPPLIER: [
    {
      id: 'wholesaler-workspace',
      label: 'Wholesaler Workspace',
      items: [
        { label: 'Supplier Portal', path: '/supplier-portal', icon: Store },
      ],
    },
    {
      id: 'supplier-account',
      label: 'Account & Alerts',
      items: [
        { label: 'Notifications', path: '/notifications', icon: Bell },
        { label: 'Profile', path: '/profile', icon: User },
      ],
    },
  ],
  ADMIN: [
    {
      id: 'platform-ops',
      label: 'Operations',
      items: [
        { label: 'Admin Overview', path: '/admin', exact: true, icon: LayoutDashboard },
        { label: 'Pools & Reconciliation', path: '/admin/pools', icon: Users },
      ],
    },
    {
      id: 'catalogue-trust',
      label: 'Catalogue & Trust',
      items: [
        { label: 'Manage Suppliers', path: '/admin/suppliers', icon: Store },
        { label: 'Manage Offers', path: '/admin/offers', icon: SlidersHorizontal },
      ],
    },
    {
      id: 'governance-alerts',
      label: 'Governance & Alerts',
      items: [
        { label: 'Audit & AI Logs', path: '/admin/audit', icon: Shield },
        { label: 'Notifications', path: '/notifications', icon: Bell },
      ],
    },
  ],
  REVIEWER: [
    {
      id: 'compliance-review',
      label: 'Compliance & Audit',
      items: [
        { label: 'Admin Overview', path: '/admin', exact: true, icon: LayoutDashboard },
        { label: 'Audit & AI Logs', path: '/admin/audit', icon: Eye },
      ],
    },
    {
      id: 'reviewer-alerts',
      label: 'Alerts',
      items: [
        { label: 'Notifications', path: '/notifications', icon: Bell },
      ],
    },
  ],
};

export const MARKETPLACE_CATEGORIES = [
  { id: 'all', label: 'All Categories', icon: ShoppingBag },
  { id: 'group-buys', label: 'Active Group Buys', highlight: true, icon: Flame },
  { id: 'packaging', label: 'Packaging & Disposables', icon: Package },
  { id: 'food', label: 'Cooking Oils & Ghee', icon: Layers },
  { id: 'grains', label: 'Grains & Pulses', icon: Store },
  { id: 'cleaning', label: 'Cleaning & Hygiene', icon: ShieldCheck },
  { id: 'spices', label: 'Spices & Condiments', icon: Sparkles },
  { id: 'kitchen', label: 'Commercial Kitchen', icon: SlidersHorizontal },
];

export const ROLE_BADGE_VARIANT = {
  GUEST: 'neutral',
  SHOP_OWNER: 'success',
  SUPPLIER: 'pool',
  ADMIN: 'warning',
  REVIEWER: 'neutral',
};

export const ROLE_DISPLAY_NAMES = {
  GUEST: 'Guest Browse',
  SHOP_OWNER: 'Shop Owner',
  SUPPLIER: 'Wholesaler',
  ADMIN: 'Admin',
  REVIEWER: 'Reviewer',
};

export const SIDEBAR_COLLAPSED_KEY_PREFIX = 'cobuy_sidebar_collapsed:';
export const SIDEBAR_GROUPS_KEY_PREFIX = 'cobuy_sidebar_groups:';

/**
 * Returns navigation links for a given user role.
 */
export function getNavItemsForRole(role) {
  return ROLE_NAVIGATION[role] || [];
}

/**
 * Returns role-specific collapsible sidebar groups for a given user role.
 */
export function getNavGroupsForRole(role) {
  return ROLE_NAV_GROUPS[role] || [];
}

/**
 * Determines whether a sidebar nav link matches the active route.
 */
export function isNavItemActive(item, currentPath) {
  if (item.path === '/') {
    return currentPath === '/';
  }
  if (item.exact) {
    return currentPath === item.path;
  }
  const paths = item.matchPaths || [item.path];
  return paths.some(
    (p) => currentPath === p || currentPath.startsWith(`${p}/`)
  );
}

export function readStoredBool(key, fallback = false) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

export function writeStoredBool(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage write errors in restricted contexts
  }
}

export function readStoredJson(key, fallback = {}) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write errors in restricted contexts
  }
}

