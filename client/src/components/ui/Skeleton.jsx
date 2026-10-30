import React from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-midnight-surface/80 border border-midnight-border/30',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
