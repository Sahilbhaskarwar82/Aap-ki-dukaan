import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Calculates remaining days, hours, minutes, seconds from milliseconds difference.
 * @param {number} totalMs
 */
function calculateTimeUnits(totalMs) {
  if (totalMs <= 0) {
    return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    totalMs,
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
  };
}

/**
 * Formats numbers with zero-padding (e.g. 5 -> '05')
 * @param {number} num
 */
function pad(num) {
  return String(Math.max(0, num)).padStart(2, '0');
}

/**
 * CountdownTimer (SUJ-01)
 *
 * Authoritative server-synced countdown timer supporting 72-hour MOQ recruit
 * windows and 24-hour under-MOQ decision deadlines.
 *
 * @param {object} props
 * @param {string|Date|number} props.deadline - Target timestamp
 * @param {string} [props.label='Time Remaining'] - Display label
 * @param {number} [props.serverTimeOffset=0] - Clock offset in ms: (serverNow - Date.now())
 * @param {function} [props.onExpire] - Callback invoked once upon expiration
 * @param {'card'|'inline'|'badge'} [props.variant='card'] - Display layout
 * @param {string} [props.className]
 */
export function CountdownTimer({
  deadline,
  label = 'Time Remaining',
  serverTimeOffset = 0,
  onExpire,
  variant = 'card',
  className,
  ...props
}) {
  const targetTimestamp = useMemo(() => {
    if (!deadline) return null;
    const ms = new Date(deadline).getTime();
    return Number.isFinite(ms) ? ms : null;
  }, [deadline]);

  const [remaining, setRemaining] = useState(() => {
    if (!targetTimestamp) return calculateTimeUnits(0);
    const now = Date.now() + (serverTimeOffset || 0);
    return calculateTimeUnits(targetTimestamp - now);
  });

  const onExpireRef = useRef(onExpire);
  const hasTriggeredExpire = useRef(false);

  // Keep ref up to date without triggering re-renders (avoids render-body mutation warning)
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    // When there is no deadline, no interval is needed — state is initialised
    // to calculateTimeUnits(0) by useState and will never need updating.
    if (!targetTimestamp) return;

    const checkTime = () => {
      const now = Date.now() + (serverTimeOffset || 0);
      const diff = targetTimestamp - now;
      const units = calculateTimeUnits(diff);
      setRemaining(units);

      if (units.isExpired && !hasTriggeredExpire.current) {
        hasTriggeredExpire.current = true;
        if (typeof onExpireRef.current === 'function') {
          onExpireRef.current();
        }
      }
    };

    checkTime();
    const intervalId = setInterval(checkTime, 1000);
    return () => clearInterval(intervalId);
  }, [targetTimestamp, serverTimeOffset]);

  // Urgency styling calculation
  const urgencyStatus = useMemo(() => {
    if (remaining.isExpired) return 'expired';
    const hoursRemaining = remaining.totalMs / (1000 * 60 * 60);
    if (hoursRemaining <= 6) return 'critical'; // < 6 hours
    if (hoursRemaining <= 24) return 'warning';  // < 24 hours
    return 'normal';                           // > 24 hours
  }, [remaining]);

  // Color tokens based on urgency
  const colorMap = {
    normal: {
      text: 'text-teal-300',
      border: 'border-teal-500/30',
      bg: 'bg-teal-950/30',
      pulse: false,
    },
    warning: {
      text: 'text-amber-400',
      border: 'border-amber-500/40',
      bg: 'bg-amber-950/30',
      pulse: false,
    },
    critical: {
      text: 'text-rose-400',
      border: 'border-rose-500/60',
      bg: 'bg-rose-950/40',
      pulse: true,
    },
    expired: {
      text: 'text-midnight-muted',
      border: 'border-midnight-border',
      bg: 'bg-midnight-card/50',
      pulse: false,
    },
  };

  const style = colorMap[urgencyStatus];

  if (!targetTimestamp) {
    return (
      <div className={cn('text-xs text-midnight-muted flex items-center gap-1.5', className)}>
        <Clock className="h-3.5 w-3.5" />
        <span>No deadline set</span>
      </div>
    );
  }

  // Variant: Badge
  if (variant === 'badge') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border tabular-nums',
          style.border,
          style.bg,
          style.text,
          style.pulse && 'animate-pulse',
          className
        )}
        {...props}
      >
        <Clock className="h-3 w-3 shrink-0" />
        {remaining.isExpired ? (
          <span>EXPIRED</span>
        ) : (
          <span>
            {remaining.days > 0 ? `${remaining.days}d ` : ''}
            {pad(remaining.hours)}:{pad(remaining.minutes)}:{pad(remaining.seconds)}
          </span>
        )}
      </span>
    );
  }

  // Variant: Inline
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2 text-sm tabular-nums', style.text, className)} {...props}>
        <Clock className="h-4 w-4 shrink-0" />
        <span className="text-xs text-midnight-muted">{label}:</span>
        {remaining.isExpired ? (
          <span className="font-semibold text-rose-400">EXPIRED</span>
        ) : (
          <span className="font-mono font-bold tracking-tight">
            {remaining.days > 0 && `${remaining.days}d `}
            {pad(remaining.hours)}:{pad(remaining.minutes)}:{pad(remaining.seconds)}
          </span>
        )}
      </div>
    );
  }

  // Variant: Card (Default)
  return (
    <div
      className={cn(
        'rounded-lg border p-3.5 bg-midnight-card text-midnight-text flex flex-col gap-2 transition-all',
        style.border,
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-midnight-muted flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {label}
        </span>
        {urgencyStatus === 'critical' && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1 animate-pulse">
            <AlertCircle className="h-3 w-3" />
            Closing Soon
          </span>
        )}
      </div>

      {remaining.isExpired ? (
        <div className="py-1 text-center font-bold text-rose-400 tracking-wide text-sm bg-rose-950/20 rounded border border-rose-900/30">
          DEADLINE EXPIRED
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 text-center font-mono tabular-nums">
          <div className="bg-midnight-surface/80 rounded py-1.5 px-1 border border-midnight-border/50">
            <div className={cn('text-base font-bold leading-tight', style.text)}>
              {pad(remaining.days)}
            </div>
            <div className="text-[10px] text-midnight-muted uppercase tracking-tighter">Days</div>
          </div>
          <div className="bg-midnight-surface/80 rounded py-1.5 px-1 border border-midnight-border/50">
            <div className={cn('text-base font-bold leading-tight', style.text)}>
              {pad(remaining.hours)}
            </div>
            <div className="text-[10px] text-midnight-muted uppercase tracking-tighter">Hours</div>
          </div>
          <div className="bg-midnight-surface/80 rounded py-1.5 px-1 border border-midnight-border/50">
            <div className={cn('text-base font-bold leading-tight', style.text)}>
              {pad(remaining.minutes)}
            </div>
            <div className="text-[10px] text-midnight-muted uppercase tracking-tighter">Mins</div>
          </div>
          <div className="bg-midnight-surface/80 rounded py-1.5 px-1 border border-midnight-border/50">
            <div className={cn('text-base font-bold leading-tight', style.text)}>
              {pad(remaining.seconds)}
            </div>
            <div className="text-[10px] text-midnight-muted uppercase tracking-tighter">Secs</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CountdownTimer;

