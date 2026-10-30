import React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { cn } from '@/lib/utils';

const BANNER_CONFIG = {
  TEST_TRANSACTION: {
    title: 'TEST TRANSACTION — PAYPAL SANDBOX',
    description:
      'This checkout is running in PayPal Developer Sandbox mode. No real bank accounts or live funds are charged. Use sandbox buyer credentials only.',
    variant: 'warning',
    icon: AlertTriangle,
  },
  SIMULATED_SETTLEMENT: {
    title: 'SIMULATED SUPPLIER SETTLEMENT',
    description:
      'Supplier payout records are simulated for hackathon evaluation (BR-009 / FR-PAY-016). Platform does not execute real-money automated disbursements.',
    variant: 'info',
    icon: ShieldAlert,
  },
  DEMO_ENVIRONMENT: {
    title: 'PROTOTYPE DEMONSTRATION MODE',
    description:
      'You are interacting with a prototype procurement workspace. Seeded suppliers and test transactions are strictly isolated from production services.',
    variant: 'default',
    icon: Info,
  },
};

/**
 * SandboxDisclosureBanner (SUJ-01)
 *
 * Mandatory transparency banner for simulated actions and sandbox checkouts,
 * fulfilling SRS FR-PAY-011, FR-PAY-016, and BR-012.
 *
 * @param {object} props
 * @param {'TEST_TRANSACTION'|'SIMULATED_SETTLEMENT'|'DEMO_ENVIRONMENT'} [props.type='TEST_TRANSACTION']
 * @param {string} [props.title] - Override title
 * @param {string|React.ReactNode} [props.description] - Override description / children
 * @param {string} [props.variant] - Visual variant ('warning' | 'info' | 'error' | 'default')
 * @param {string} [props.className]
 */
export function SandboxDisclosureBanner({
  type = 'TEST_TRANSACTION',
  title,
  description,
  variant,
  className,
  children,
  ...props
}) {
  const config = BANNER_CONFIG[type] || BANNER_CONFIG.TEST_TRANSACTION;
  const alertVariant = variant || config.variant;
  const displayTitle = title || config.title;
  const displayDescription = children || description || config.description;
  const IconComponent = config.icon;

  return (
    <Alert
      variant={alertVariant}
      icon={IconComponent}
      className={cn('shadow-sm transition-all', className)}
      {...props}
    >
      <AlertTitle className="tracking-wide uppercase text-xs font-bold">
        {displayTitle}
      </AlertTitle>
      <AlertDescription className="text-xs leading-relaxed mt-0.5">
        {displayDescription}
      </AlertDescription>
    </Alert>
  );
}

export default SandboxDisclosureBanner;

