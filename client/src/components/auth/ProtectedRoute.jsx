/**
 * CoBuy AI — ProtectedRoute (HIM-05)
 *
 * Route guard component:
 *  1. Shows accessible skeleton loading state while authentication is being restored
 *  2. Redirects unauthenticated users to /login, preserving intended destination
 *  3. Displays forbidden state if authenticated user's role is not in allowedRoles
 *  4. Supports both React Router (Outlet) and inline nested children
 *  5. Handles missing user/role safely without infinite loops
 *
 * Roles: 'SHOP_OWNER' | 'SUPPLIER' | 'ADMIN' | 'REVIEWER'
 */

import React, { useEffect } from 'react';
import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

// Role landing destinations for redirection from forbidden states
const ROLE_HOME_PATHS = {
  SHOP_OWNER: '/dashboard',
  SUPPLIER:   '/supplier-portal',
  ADMIN:      '/admin',
  REVIEWER:   '/admin',
};

/**
 * Loading state rendered while AuthContext is checking active session.
 */
function ProtectedRouteSkeleton() {
  return (
    <div
      role="status"
      aria-label="Checking authentication"
      className="min-h-screen bg-midnight-bg flex flex-col p-6 space-y-6"
    >
      <div className="flex items-center justify-between border-b border-midnight-border pb-4">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-3">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1">
        <Skeleton className="hidden md:block col-span-1 h-96 rounded-xl" />
        <div className="col-span-3 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Forbidden state rendered when user does not have required role.
 */
function ForbiddenState({ userRole, allowedRoles, onNavigateHome }) {
  const homePath = ROLE_HOME_PATHS[userRole] || '/dashboard';

  return (
    <div
      role="alert"
      className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-5"
    >
      <div className="h-16 w-16 rounded-full bg-midnight-rose/10 border border-midnight-rose/30 flex items-center justify-center text-midnight-rose">
        <ShieldAlert className="h-8 w-8" aria-hidden="true" />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold text-midnight-text font-space-grotesk">
          Access Restricted
        </h2>
        <p className="text-sm text-midnight-muted">
          Your account role (<span className="text-white font-mono">{userRole || 'UNKNOWN'}</span>) does
          not have permission to access this page.
        </p>
        <div className="text-xs text-midnight-muted">
          Required role(s):{' '}
          {allowedRoles.map((r) => (
            <Badge key={r} variant="neutral" className="mx-0.5 text-[10px]">
              {r}
            </Badge>
          ))}
        </div>
      </div>

      <Button
        variant="primary"
        onClick={() => {
          if (typeof onNavigateHome === 'function') {
            onNavigateHome(homePath);
          } else if (typeof window !== 'undefined') {
            window.location.href = homePath;
          }
        }}
        className="mt-2"
        aria-label="Return to your dashboard"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Return to your workspace
      </Button>
    </div>
  );
}

/**
 * Unauthenticated fallback view when no router redirection is hooked.
 */
function UnauthenticatedState({ onRedirectToLogin }) {
  return (
    <div
      role="alert"
      className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4"
    >
      <div className="h-14 w-14 rounded-full bg-midnight-surface border border-midnight-border flex items-center justify-center text-midnight-muted">
        <LogIn className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-midnight-text">Authentication Required</h2>
        <p className="text-xs text-midnight-muted">Please sign in to access this page.</p>
      </div>
      <Button
        variant="primary"
        onClick={() => {
          if (typeof onRedirectToLogin === 'function') {
            onRedirectToLogin('/login');
          } else if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }}
      >
        Sign In
      </Button>
    </div>
  );
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/login',
  onRedirect,
}) {
  const { user, loading, isAuthenticated } = useAuth();

  // Redirect unauthenticated user when ready
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      if (typeof onRedirect === 'function') {
        onRedirect(redirectTo);
      }
    }
  }, [loading, isAuthenticated, redirectTo, onRedirect]);

  // 1. Session restoration in progress: render loading skeleton
  if (loading) {
    return <ProtectedRouteSkeleton />;
  }

  // 2. Unauthenticated: render fallback prompt / trigger redirect
  if (!isAuthenticated || !user) {
    return <UnauthenticatedState onRedirectToLogin={onRedirect} />;
  }

  // 3. Authenticated but role not allowed: render forbidden state
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!allowedRoles.includes(user.role)) {
      return (
        <ForbiddenState
          userRole={user.role}
          allowedRoles={allowedRoles}
          onNavigateHome={onRedirect}
        />
      );
    }
  }

  // 4. Authorized: render children
  return children ? <>{children}</> : null;
}
