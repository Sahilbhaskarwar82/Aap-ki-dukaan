import React from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  User,
  Shield,
  Layers,
  FileCheck,
  AlertTriangle,
  RotateCcw,
  Package,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

/**
 * Returns an appropriate icon and color theme for a specific audit action.
 * @param {string} action
 */
function getActionIcon(action = '') {
  const upper = action.toUpperCase();

  if (upper.includes('PAY') || upper.includes('CAPTURE')) {
    return { icon: CreditCard, color: 'text-amber-400 bg-amber-950/60 border-amber-500/40' };
  }
  if (upper.includes('APPROV') || upper.includes('CONFIRM')) {
    return { icon: FileCheck, color: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40' };
  }
  if (upper.includes('JOIN') || upper.includes('CONTRIBUT')) {
    return { icon: Layers, color: 'text-teal-400 bg-teal-950/60 border-teal-500/40' };
  }
  if (upper.includes('ORDER') || upper.includes('FULFILL')) {
    return { icon: Package, color: 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40' };
  }
  if (upper.includes('REFUND') || upper.includes('WITHDRAW')) {
    return { icon: RotateCcw, color: 'text-rose-400 bg-rose-950/60 border-rose-500/40' };
  }
  if (upper.includes('UNDER_MOQ') || upper.includes('CANCEL') || upper.includes('EXPIRE')) {
    return { icon: AlertTriangle, color: 'text-yellow-400 bg-yellow-950/60 border-yellow-500/40' };
  }

  return { icon: CheckCircle2, color: 'text-slate-300 bg-slate-900 border-slate-700' };
}

/**
 * Maps actor role to badge variant and label.
 * @param {string} role
 */
function getActorBadge(role = '') {
  const upper = role.toUpperCase();
  switch (upper) {
    case 'ADMIN':
      return { variant: 'error', label: 'Admin', icon: Shield };
    case 'SUPPLIER':
      return { variant: 'provenance', label: 'Wholesaler', icon: Package };
    case 'SYSTEM_SCHEDULER':
      return { variant: 'outline', label: 'System', icon: Clock };
    case 'WEBHOOK':
      return { variant: 'neutral', label: 'Provider Hook', icon: Clock };
    case 'SHOP_OWNER':
    default:
      return { variant: 'pool', label: 'Buyer', icon: User };
  }
}

/**
 * Formats timestamps into a readable date + time string.
 * @param {string|Date|number} timestamp
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Just now';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(timestamp);
  }
}

/**
 * ActivityTimeline (SUJ-01)
 *
 * Chronological audit & lifecycle event timeline for group pools and finalized orders.
 * Satisfies SRS FR-NOTIF-003 and NFR-OBS-001.
 *
 * @param {object} props
 * @param {Array<object>} props.events - List of activity log events
 * @param {string} [props.emptyMessage='No activity recorded yet']
 * @param {'asc'|'desc'} [props.order='desc'] - Sort order by timestamp
 * @param {number} [props.maxItems] - Optional maximum items to display
 * @param {string} [props.className]
 */
export function ActivityTimeline({
  events = [],
  emptyMessage = 'No activity recorded yet',
  order = 'desc',
  maxItems,
  className,
  ...props
}) {
  const sortedEvents = React.useMemo(() => {
    if (!Array.isArray(events)) return [];
    const copy = [...events];
    copy.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
      const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
      return order === 'desc' ? timeB - timeA : timeA - timeB;
    });
    return maxItems && maxItems > 0 ? copy.slice(0, maxItems) : copy;
  }, [events, order, maxItems]);

  if (!sortedEvents.length) {
    return (
      <div className={cn('p-6 text-center text-xs text-midnight-muted rounded-lg border border-midnight-border bg-midnight-card/40', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('relative pl-6 space-y-6', className)} {...props}>
      {/* Vertical connector line */}
      <div
        className="absolute top-2 bottom-2 left-2.5 w-0.5 bg-midnight-border/70 -translate-x-1/2"
        aria-hidden="true"
      />

      {sortedEvents.map((event, index) => {
        const actionText = event.action || event.title || 'Platform Event';
        const actorRole = event.actorRole || event.role || 'SHOP_OWNER';
        const actorInfo = getActorBadge(actorRole);
        const actionVisual = getActionIcon(actionText);
        const ActionIcon = actionVisual.icon;
        const ActorIcon = actorInfo.icon;
        const timeDisplay = formatTimestamp(event.createdAt || event.timestamp);

        return (
          <div key={event.id || event._id || index} className="relative group">
            {/* Timeline icon node */}
            <div
              className={cn(
                'absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-transform group-hover:scale-110',
                actionVisual.color
              )}
            >
              <ActionIcon className="h-2.5 w-2.5" aria-hidden="true" />
            </div>

            {/* Event content box */}
            <div className="flex flex-col gap-1 rounded-md border border-midnight-border/40 bg-midnight-card/60 p-3 hover:border-midnight-border transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-midnight-text tracking-wide">
                  {actionText.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] font-mono text-midnight-muted tabular-nums">
                  {timeDisplay}
                </span>
              </div>

              {/* Actor Badge & Description */}
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={actorInfo.variant}
                  className="text-[10px] py-0 px-2 flex items-center gap-1 font-medium"
                >
                  <ActorIcon className="h-2.5 w-2.5" />
                  {actorInfo.label}
                </Badge>

                {event.description && (
                  <p className="text-xs text-midnight-muted line-clamp-2">
                    {event.description}
                  </p>
                )}
              </div>

              {/* Metadata Details (if present) */}
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <div className="mt-2 text-[11px] font-mono text-midnight-muted/80 bg-midnight-surface/50 rounded px-2 py-1 border border-midnight-border/30">
                  {Object.entries(event.metadata).map(([k, v]) => {
                    if (typeof v === 'object' && v !== null) return null;
                    return (
                      <span key={k} className="mr-3 inline-block">
                        <strong className="text-slate-400 font-normal">{k}:</strong> {String(v)}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ActivityTimeline;

