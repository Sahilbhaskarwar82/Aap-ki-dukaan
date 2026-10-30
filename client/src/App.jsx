/**
 * CoBuy AI — Application Routing & Providers Entry (SUJ-10)
 *
 * Provider Hierarchy:
 *   BrowserRouter
 *     └── AuthProvider
 *           └── NotificationProvider
 *                 ├── Toaster (Global Toast Container)
 *                 └── AppRoutes
 *
 * Route Registry:
 *   Public Routes:
 *     /                     LandingPage (with navigation callbacks)
 *     /login                LoginPage (with authenticated redirect to role home)
 *     /register             RegisterPage (with authenticated redirect to role home)
 *
 *   Protected Routes (AppShellLayout + ProtectedRoute):
 *     SHOP_OWNER:
 *       /dashboard          Retailer Operations Dashboard
 *       /requirements       AI Requirement Intake & Management
 *       /suppliers          Supplier Catalogue & Wholesaler Discovery
 *       /group-buys         Group-Buy Pools Marketplace
 *       /orders             Finalized Group Orders & Fulfillment
 *       /payments           Payments, Refunds & PayPal Sandbox Settlement
 *       /profile            Shop Profile & Delivery Configuration
 *
 *     SUPPLIER:
 *       /supplier-portal    Wholesaler Offer & Quote Management Workspace
 *       /profile            Supplier Business Profile
 *
 *     ADMIN:
 *       /admin              Platform Administration Overview
 *       /admin/suppliers    Wholesaler Verification & Provenance Badges
 *       /admin/offers       Wholesale Catalogue Offer Moderation
 *       /admin/pools        Pool Status Reconciliation & Interventions
 *       /admin/audit        Immutable Audit Logs & AI Execution Traces
 *
 *     REVIEWER:
 *       /reviewer           Redirects to /admin
 *       /admin              Platform Administration (Read-Only Reviewer Mode)
 *       /admin/audit        Audit Logs Inspector
 *
 *     COMMON (Authenticated):
 *       /notifications      Procurement Alerts & Status Updates
 *
 *   Catch-all Route:
 *     *                     404 Not Found Page
 */

import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Store,
  Users,
  Package,
  CreditCard,
  User,
  Shield,
  Bell,
  SlidersHorizontal,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { Toaster } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

import LandingPage from '@/pages/public/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import AppShellLayout from '@/layouts/AppShellLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

// ── Role Landing Destinations ─────────────────────────────────────────────────
export function getRoleHome(role) {
  switch (role) {
    case 'SHOP_OWNER':
      return '/dashboard';
    case 'SUPPLIER':
      return '/supplier-portal';
    case 'ADMIN':
    case 'REVIEWER':
      return '/admin';
    default:
      return '/';
  }
}

// ── Public Auth Route Guard ───────────────────────────────────────────────────
// Redirects authenticated users from /login or /register to their role home
function PublicAuthRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (!loading && isAuthenticated && user) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }
  return children;
}

// ── Protected Shell Route Wrapper ─────────────────────────────────────────────
// Enforces role-based ProtectedRoute and renders inside AppShellLayout
function ProtectedShellRoute({
  allowedRoles,
  title,
  subtitle,
  children,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ProtectedRoute
      allowedRoles={allowedRoles}
      onRedirect={(path) => navigate(path)}
    >
      <AppShellLayout
        currentPath={location.pathname}
        onNavigate={(path) => navigate(path)}
        title={title}
        subtitle={subtitle}
      >
        {children}
      </AppShellLayout>
    </ProtectedRoute>
  );
}

// ── Feature Placeholder for Unimplemented Future Routes ───────────────────────
function FeaturePlaceholder({
  title,
  description,
  wave,
  owner,
  roles = [],
  icon: Icon = Sparkles,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const homePath = user ? getRoleHome(user.role) : '/';

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6" data-testid="feature-placeholder">
      <div className="bg-midnight-card border border-midnight-border rounded-xl p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-midnight-border/70 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-midnight-red/10 border border-midnight-red/20 text-midnight-red">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <Badge variant="warning">{wave}</Badge>
              </div>
              <p className="text-xs text-midnight-muted mt-1">Lead: {owner}</p>
            </div>
          </div>
          <Badge variant="neutral" className="self-start sm:self-auto">
            Protected Route
          </Badge>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">
          {description}
        </p>

        <div className="bg-midnight-surface/60 border border-midnight-border/50 rounded-lg p-4 space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-midnight-emerald" />
            Authorized Roles
          </div>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <Badge key={r} variant="pool">
                {r}
              </Badge>
            ))}
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(homePath)}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 404 Not Found Page ────────────────────────────────────────────────────────
function NotFoundPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  return (
    <div
      role="main"
      aria-label="404 Not Found"
      className="min-h-screen bg-midnight-bg text-midnight-text flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="max-w-md w-full bg-midnight-card border border-midnight-border rounded-xl p-8 space-y-4 shadow-2xl">
        <div className="inline-flex p-3 rounded-full bg-midnight-red/10 border border-midnight-red/20 text-midnight-red mx-auto">
          <AlertCircle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">404 — Page Not Found</h1>
        <p className="text-sm text-midnight-muted">
          The requested page does not exist or may have been moved.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            Public Home
          </Button>
          {isAuthenticated && user && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(getRoleHome(user.role))}
            >
              Return to Dashboard
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Application Routes Definition ─────────────────────────────────────────────
export function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>
      {/* ── Public Routes ──────────────────────────────────────────────────── */}
      <Route
        path="/"
        element={
          <LandingPage
            onNavigateToLogin={() => navigate('/login')}
            onNavigateToRegister={() => navigate('/register')}
            onNavigate={(path) => navigate(path)}
          />
        }
      />

      <Route
        path="/login"
        element={
          <PublicAuthRoute>
            <LoginPage
              onNavigateToRegister={() => navigate('/register')}
              onLoginSuccess={(user) => navigate(getRoleHome(user?.role))}
            />
          </PublicAuthRoute>
        }
      />

      <Route
        path="/register"
        element={
          <PublicAuthRoute>
            <RegisterPage
              onNavigateToLogin={() => navigate('/login')}
              onRegisterSuccess={(user) => navigate(getRoleHome(user?.role))}
            />
          </PublicAuthRoute>
        }
      />

      {/* ── Retailer (SHOP_OWNER) Protected Routes ─────────────────────────── */}
      <Route
        path="/dashboard"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Retailer Dashboard"
            subtitle="Procurement operations overview and active collective buys"
          >
            <FeaturePlaceholder
              title="Retailer Dashboard & Analytics"
              description="Central operations hub for independent shops and kiranas. Features aggregated spending metrics, active requirement summaries, nearby group-buy opportunities, and quick reorder shortcuts."
              wave="Wave 3 (HIM-06)"
              owner="Himanshu"
              roles={['SHOP_OWNER']}
              icon={LayoutDashboard}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/requirements"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Procurement Requirements"
            subtitle="AI-assisted requirement intake and itemization engine"
          >
            <FeaturePlaceholder
              title="Requirements Management"
              description="AI-assisted requirement intake and itemization engine. Submit purchase requirements via plain text or invoice upload, verify extracted SKUs and quantities, and convert directly into collective group-buy pools."
              wave="Wave 3 (HIM-07 / HIM-08)"
              owner="Himanshu"
              roles={['SHOP_OWNER']}
              icon={FileText}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/suppliers"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Supplier Catalogue"
            subtitle="Verified regional wholesalers, MOQ tiers and catalogue pricing"
          >
            <FeaturePlaceholder
              title="Supplier Catalogue & Offers"
              description="Direct verified wholesaler directory with wholesale MOQ thresholds, quantity price breaks, tier progression rules, and fulfillment SLAs across regional micro-distribution hubs."
              wave="Wave 3 (HIM-09)"
              owner="Himanshu"
              roles={['SHOP_OWNER']}
              icon={Store}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/group-buys"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Group-Buy Pools"
            subtitle="Active regional collective buying pools and tier progression"
          >
            <FeaturePlaceholder
              title="Group-Buy Pools Marketplace"
              description="72-hour collective buying pools uniting regional demand. Track live Q_pool progress toward wholesaler MOQs, watch bulk price tiers unlock, and join with guaranteed 20% retailer minimums."
              wave="Wave 4 (SUJ-02 / SUJ-03)"
              owner="Suraj"
              roles={['SHOP_OWNER']}
              icon={Users}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/orders"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Orders & Shipments"
            subtitle="Confirmed collective purchase orders, tracking and delivery receipt"
          >
            <FeaturePlaceholder
              title="Finalized Group Orders"
              description="Purchase order tracking, dispatch milestones, delivery verification, and itemized allocation breakdown for all confirmed group buying pools."
              wave="Wave 4 (SUJ-07)"
              owner="Suraj"
              roles={['SHOP_OWNER']}
              icon={Package}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/payments"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Payments & Refunds"
            subtitle="Paise-accurate transaction history and PayPal Sandbox settlement"
          >
            <FeaturePlaceholder
              title="Payments & Refunds Ledger"
              description="Paise-accurate transaction history with PayPal Sandbox settlement tracking, tier savings refund processing, and under-MOQ balance reconciliations."
              wave="Wave 4 (SUJ-06)"
              owner="Suraj"
              roles={['SHOP_OWNER']}
              icon={CreditCard}
            />
          </ProtectedShellRoute>
        }
      />

      {/* ── Wholesaler (SUPPLIER) Protected Routes ─────────────────────────── */}
      <Route
        path="/supplier-portal"
        element={
          <ProtectedShellRoute
            allowedRoles={['SUPPLIER']}
            title="Supplier Portal"
            subtitle="Catalogue offer management, quote responses and order fulfillment"
          >
            <FeaturePlaceholder
              title="Wholesaler Supplier Workspace"
              description="Dedicated workspace for regional distributors and manufacturers. Publish wholesale offers with MOQ_W and tier matrices, respond to incoming buyer quotes, and process finalized group purchase orders."
              wave="Wave 4 (SUJ-08)"
              owner="Suraj"
              roles={['SUPPLIER']}
              icon={Store}
            />
          </ProtectedShellRoute>
        }
      />

      {/* ── Admin & Reviewer Protected Routes ──────────────────────────────── */}
      <Route
        path="/admin"
        element={
          <ProtectedShellRoute
            allowedRoles={['ADMIN', 'REVIEWER']}
            title="Platform Administration"
            subtitle="Platform operational health, pool lifecycle and exceptions"
          >
            <FeaturePlaceholder
              title="Platform Administration Overview"
              description="Platform-wide health metrics, pool lifecycle monitoring, transaction exception review, and manual 72h/24h decision trigger controls for evaluation demonstrations."
              wave="Wave 4 (SUJ-09)"
              owner="Suraj"
              roles={['ADMIN', 'REVIEWER']}
              icon={LayoutDashboard}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/admin/suppliers"
        element={
          <ProtectedShellRoute
            allowedRoles={['ADMIN']}
            title="Manage Suppliers"
            subtitle="Supplier verification and provenance badges"
          >
            <FeaturePlaceholder
              title="Supplier Verification & Moderation"
              description="Review supplier onboarding credentials, inspect fulfillment track records, and manage live vs. seeded demo provenance badges."
              wave="Wave 4 (SUJ-09)"
              owner="Suraj"
              roles={['ADMIN']}
              icon={Store}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/admin/offers"
        element={
          <ProtectedShellRoute
            allowedRoles={['ADMIN']}
            title="Manage Offers"
            subtitle="Wholesale catalogue offers and tier pricing validation"
          >
            <FeaturePlaceholder
              title="Catalogue Offer Moderation"
              description="Moderate wholesale product listings, inspect tier pricing matrices, and verify quote validity expirations."
              wave="Wave 4 (SUJ-09)"
              owner="Suraj"
              roles={['ADMIN']}
              icon={SlidersHorizontal}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/admin/pools"
        element={
          <ProtectedShellRoute
            allowedRoles={['ADMIN']}
            title="Pools & Reconciliation"
            subtitle="Active pool exceptions, under-MOQ resolutions and manual overrides"
          >
            <FeaturePlaceholder
              title="Pools & Reconciliation Workspace"
              description="Inspect stalled or expired group pools, review under-MOQ participant decisions, and execute administrative adjustments."
              wave="Wave 4 (SUJ-09)"
              owner="Suraj"
              roles={['ADMIN']}
              icon={Users}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/admin/audit"
        element={
          <ProtectedShellRoute
            allowedRoles={['ADMIN', 'REVIEWER']}
            title="Audit & AI Logs"
            subtitle="Immutable operational audit trail and AI execution traces"
          >
            <FeaturePlaceholder
              title="Audit & AI Execution Logs"
              description="Immutable chronological audit trail recording all monetary captures, pool status transitions, and AI model extraction results."
              wave="Wave 4 (SUJ-09)"
              owner="Suraj"
              roles={['ADMIN', 'REVIEWER']}
              icon={Shield}
            />
          </ProtectedShellRoute>
        }
      />

      {/* Reviewer shortcut */}
      <Route path="/reviewer" element={<Navigate to="/admin" replace />} />

      {/* ── Common Authenticated Routes ────────────────────────────────────── */}
      <Route
        path="/profile"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER', 'SUPPLIER']}
            title="Business Profile"
            subtitle="Account details, delivery configuration and trade settings"
          >
            <FeaturePlaceholder
              title="Business Profile & Settings"
              description="Manage business identity, GST details, verified delivery drop locations, contact preferences, and team permissions."
              wave="Wave 3 (HIM-06)"
              owner="Himanshu"
              roles={['SHOP_OWNER', 'SUPPLIER']}
              icon={User}
            />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER', 'SUPPLIER', 'ADMIN', 'REVIEWER']}
            title="Notifications"
            subtitle="Procurement alerts, pool status changes and order updates"
          >
            <FeaturePlaceholder
              title="Notification Center"
              description="All real-time procurement alerts, pool milestone updates, tier discount unlocks, and order dispatch notices."
              wave="Wave 4 (SUJ-07)"
              owner="Suraj"
              roles={['SHOP_OWNER', 'SUPPLIER', 'ADMIN', 'REVIEWER']}
              icon={Bell}
            />
          </ProtectedShellRoute>
        }
      />

      {/* ── 404 Catch-All Route ────────────────────────────────────────────── */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

// ── Application Entry Component ───────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <Toaster />
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
