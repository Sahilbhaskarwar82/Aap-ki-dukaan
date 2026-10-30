import React from 'react';
import { Database, ShieldCheck, Building2, Globe, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

/**
 * Provenance Type Metadata Definitions
 */
const PROVENANCE_MAP = {
  SEEDED_DEMO: {
    label: 'Demo Sample',
    description: 'Seeded sample data for hackathon demonstration purposes',
    variant: 'provenance',
    icon: Database,
    className: 'border-cyan-500/40 bg-cyan-950/70 text-cyan-300',
  },
  SUPPLIER_SUBMITTED: {
    label: 'Supplier Quote',
    description: 'Submitted directly by registered supplier',
    variant: 'pool',
    icon: Building2,
    className: 'border-teal-500/40 bg-teal-950/70 text-teal-300',
  },
  VERIFIED_LIVE: {
    label: 'Verified Wholesaler',
    description: 'Verified live supplier quote with confirmed pricing & lead time',
    variant: 'success',
    icon: ShieldCheck,
    className: 'border-emerald-500/40 bg-emerald-950/70 text-emerald-300',
  },
  EXTERNAL_API: {
    label: 'External Catalogue',
    description: 'Normalized offer sourced from external provider API',
    variant: 'outline',
    icon: Globe,
    className: 'border-slate-500/40 bg-slate-900/70 text-slate-300',
  },
  UNKNOWN: {
    label: 'Unverified Source',
    description: 'Source provenance has not been verified',
    variant: 'neutral',
    icon: HelpCircle,
    className: 'border-midnight-border bg-midnight-surface text-midnight-muted',
  },
};

/**
 * ProvenanceBadge — Reusable data provenance indicator (SUJ-01)
 *
 * Displays visual badges indicating whether data is a Seeded Demo record,
 * Supplier-Submitted quote, Verified Wholesaler quote, or External API result,
 * satisfying SRS FR-SUP-005, FR-SUP-006, and BR-012.
 *
 * @param {object} props
 * @param {string} [props.type='SEEDED_DEMO'] - SEEDED_DEMO | SUPPLIER_SUBMITTED | VERIFIED_LIVE | EXTERNAL_API
 * @param {string} [props.provenance] - Alias for type
 * @param {string} [props.label] - Optional custom label override
 * @param {boolean} [props.showIcon=true] - Whether to render category icon
 * @param {string} [props.className] - Additional class names
 */
export function ProvenanceBadge({
  type,
  provenance,
  label,
  showIcon = true,
  className,
  ...props
}) {
  const normalizedKey = (type || provenance || 'SEEDED_DEMO').toString().toUpperCase().trim();
  const config = PROVENANCE_MAP[normalizedKey] || PROVENANCE_MAP.UNKNOWN;
  const IconComponent = config.icon;
  const displayText = label || config.label;

  return (
    <Badge
      variant={config.variant}
      title={config.description}
      className={cn(
        'inline-flex items-center gap-1.5 py-0.5 px-2.5 font-medium text-xs shadow-sm transition-colors',
        config.className,
        className
      )}
      {...props}
    >
      {showIcon && IconComponent && (
        <IconComponent className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span>{displayText}</span>
    </Badge>
  );
}

export default ProvenanceBadge;

