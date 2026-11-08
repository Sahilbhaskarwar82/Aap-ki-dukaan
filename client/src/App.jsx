/**
 * CoBuy AI — Integrated Application Routing & Providers Entry (SUJ-10)
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
 *       /dashboard          Retailer Operations Dashboard (HIM-06)
 *       /requirements       AI Requirement Intake & Management (HIM-07)
 *       /requirements/new   Create Requirement (HIM-07)
 *       /requirements/:id   Requirement Detail & Extraction Review (HIM-08)
 *       /suppliers          Supplier Catalogue & Wholesaler Discovery (HIM-09)
 *       /suppliers/:id      Supplier Detail & Quote Request (HIM-10)
 *       /group-buys         Group-Buy Pools Marketplace (SUJ-02)
 *       /group-buys/create  Create Group-Buy Pool (SUJ-02)
 *       /group-buys/:poolId Group-Buy Pool Detail, Join, Edit & Withdraw (SUJ-03 / SUJ-04 / SUJ-05)
 *       /orders             Finalized Group Orders (SUJ-07)
 *       /orders/:orderId    Order Detail & PO Download (SUJ-07)
 *       /payments           Payments & Settlement Ledger (SUJ-06)
 *       /refunds            Refunds & Savings Tracker (SUJ-06)
 *       /profile            Shop Profile & Delivery Configuration (HIM-06)
 *
 *     SUPPLIER:
 *       /supplier-portal    Wholesaler Offer & Quote Management Workspace (SUJ-08)
 *       /profile            Supplier Business Profile (HIM-06)
 *
 *     ADMIN:
 *       /admin              Platform Administration Overview (SUJ-09 / SRU-10)
 *       /admin/suppliers    Wholesaler Verification & Provenance Badges (SUJ-09 / SRU-10)
 *       /admin/offers       Wholesale Catalogue Offer Moderation (SUJ-09 / SRU-10)
 *       /admin/pools        Pool Status Reconciliation & Interventions (SUJ-09 / SRU-10)
 *       /admin/audit        Immutable Audit Logs & AI Execution Traces (SUJ-09 / SRU-10)
 *
 *     REVIEWER:
 *       /reviewer           Redirects to /admin
 *       /admin              Platform Administration (Read-Only Reviewer Mode)
 *       /admin/audit        Audit Logs Inspector
 *
 *     COMMON (Authenticated):
 *       /notifications      Procurement Alerts & Status Updates (SUJ-07 / SRU-08)
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
import { AlertCircle } from 'lucide-react';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { Toaster } from '@/components/ui/Toast';
import KiranaChatbot from '@/components/common/KiranaChatbot';
import { Button } from '@/components/ui/Button';

// Public & Auth Pages
import LandingPage from '@/pages/public/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import AppShellLayout from '@/layouts/AppShellLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

// Dashboard & Profile (HIM-06)
import BuyerDashboardPage from '@/pages/dashboard/BuyerDashboardPage';
import ProfilePage from '@/pages/dashboard/ProfilePage';

// Requirement Intake (HIM-07 & HIM-08)
import RequirementsListPage from '@/pages/requirements/RequirementsListPage';
import RequirementCreatePage from '@/pages/requirements/RequirementCreatePage';
import RequirementDetailPage from '@/pages/requirements/RequirementDetailPage';

// Supplier Catalogue (HIM-09 & HIM-10)
import SupplierCataloguePage from '@/pages/suppliers/SupplierCataloguePage';
import SupplierDetailPage from '@/pages/suppliers/SupplierDetailPage';

// Group-Buy Pools (SUJ-02 & SUJ-03 / SUJ-04 / SUJ-05)
import GroupBuyMarketplacePage from '@/pages/groupBuys/GroupBuyMarketplacePage';
import GroupBuyCreatePage from '@/pages/groupBuys/GroupBuyCreatePage';
import GroupBuyDetailPage from '@/pages/groupBuys/GroupBuyDetailPage';
import PoolApprovalPage from '@/pages/groupBuys/PoolApprovalPage';
import UnderMOQDecisionPage from '@/pages/groupBuys/UnderMOQDecisionPage';
// Payments & Refunds (SUJ-06)
import PaymentsPage from '@/pages/payments/PaymentsPage';
import RefundsPage from '@/pages/payments/RefundsPage';

// Orders & PO Summary (SUJ-07)
import OrdersListPage from '@/pages/orders/OrdersListPage';
import OrderDetailPage from '@/pages/orders/OrderDetailPage';

// Notification Center (SUJ-07 / SRU-08)
import NotificationsPage from '@/pages/notifications/NotificationsPage';

// Wholesaler Supplier Portal (SUJ-08)
import SupplierPortalPage from '@/pages/supplierPortal/SupplierPortalPage';

// Platform Administrator Workspace (SUJ-09 / SRU-10)
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import AdminSuppliersPage from '@/pages/admin/AdminSuppliersPage';
import AdminOffersPage from '@/pages/admin/AdminOffersPage';
import AdminPoolsOrdersPage from '@/pages/admin/AdminPoolsOrdersPage';
import AdminAuditLogsPage from '@/pages/admin/AdminAuditLogsPage';

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
              onNavigateToForgotPassword={() => navigate('/forgot-password')}
            />
          </PublicAuthRoute>
        }
      />

      <Route
        path="/forgot-password"
        element={
          <PublicAuthRoute>
            <ForgotPasswordPage
              onNavigateToLogin={() => navigate('/login')}
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
            <BuyerDashboardPage />
          </ProtectedShellRoute>
        }
      />

      {/* ── HIM-07: Requirement Intake ──────────────────────────────────────── */}
      <Route
        path="/requirements"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Procurement Requirements"
            subtitle="AI-assisted requirement intake and itemization engine"
          >
            <RequirementsListPage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/requirements/new"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Create Requirement"
            subtitle="Submit a new purchasing requirement via AI, upload or form"
          >
            <RequirementCreatePage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/requirements/:requirementId"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Requirement Details"
            subtitle="AI extraction review, attribute confirmation and supplier matching"
          >
            <RequirementDetailPage />
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
            <SupplierCataloguePage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/suppliers/:supplierId"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Supplier Details"
            subtitle="Wholesale supplier business profile, verification status, and active catalogue offers"
          >
            <SupplierDetailPage />
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
            <GroupBuyMarketplacePage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/group-buys/create"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Create Group-Buy Pool"
            subtitle="Publish a 72-hour collective buying pool from a confirmed requirement"
          >
            <GroupBuyCreatePage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/group-buys/:poolId/approve"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Review Final Price & Approve"
            subtitle="Review and approve your frozen price snapshot"
          >
            <PoolApprovalPage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/group-buys/:poolId/decision"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="24-Hour Under-MOQ Buyer Decision"
            subtitle="Review AI recommendation and submit your binding decision"
          >
            <UnderMOQDecisionPage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/group-buys/:poolId"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER', 'SUPPLIER', 'ADMIN', 'REVIEWER']}
            title="Group-Buy Pool Details"
            subtitle="Pool progression, member participation, price breakdown and settlement"
          >
            <GroupBuyDetailPage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/orders"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER', 'SUPPLIER', 'ADMIN']}
            title="Orders & Shipments"
            subtitle="Confirmed collective purchase orders, tracking and delivery receipt"
          >
            <OrdersListPage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/orders/:orderId"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER', 'SUPPLIER', 'ADMIN']}
            title="Order Details"
            subtitle="Purchase order allocations, fulfillment tracking and PO download"
          >
            <OrderDetailPage />
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
            <PaymentsPage />
          </ProtectedShellRoute>
        }
      />

      <Route
        path="/refunds"
        element={
          <ProtectedShellRoute
            allowedRoles={['SHOP_OWNER']}
            title="Refunds & Savings"
            subtitle="Multi-state refund tracking, tier-drop savings and order cancellation reversals"
          >
            <RefundsPage />
          </ProtectedShellRoute>
        }
      />

      {/* ── Wholesaler (SUPPLIER) Protected Routes ─────────────────────────── */}
      <Route
        path="/supplier-portal"
        element={
          <ProtectedShellRoute
            allowedRoles={['SUPPLIER', 'ADMIN']}
            title="Supplier Portal"
            subtitle="Catalogue offer management, quote responses and order fulfillment"
          >
            <SupplierPortalPage />
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
            <AdminDashboardPage />
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
            <AdminSuppliersPage />
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
            <AdminOffersPage />
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
            <AdminPoolsOrdersPage />
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
            <AdminAuditLogsPage />
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
            <ProfilePage />
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
            <NotificationsPage />
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
          <KiranaChatbot />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
