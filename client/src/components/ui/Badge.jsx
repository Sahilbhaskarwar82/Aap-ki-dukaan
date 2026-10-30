import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-midnight-red focus:ring-offset-2',
  {
    variants: {
      variant: {
        neutral:
          'border-midnight-border bg-midnight-surface text-midnight-text',
        success:
          'border-emerald-500/30 bg-emerald-950/60 text-emerald-400',
        warning:
          'border-amber-500/30 bg-amber-950/60 text-amber-400',
        error:
          'border-rose-500/30 bg-rose-950/60 text-rose-400',
        pool:
          'border-teal-500/30 bg-teal-950/60 text-teal-300',
        requirement:
          'border-red-500/30 bg-red-950/60 text-red-300',
        payment:
          'border-amber-400/30 bg-yellow-950/60 text-yellow-300',
        provenance:
          'border-cyan-500/30 bg-cyan-950/60 text-cyan-300',
        outline:
          'border-midnight-border text-midnight-muted bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
