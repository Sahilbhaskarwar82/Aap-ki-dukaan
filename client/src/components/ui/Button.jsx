import React from 'react';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red focus-visible:ring-offset-2 focus-visible:ring-offset-midnight-bg disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-midnight-red text-white hover:bg-midnight-red-hover active:bg-[#9B050D] shadow-sm shadow-red-950/40',
        secondary:
          'bg-midnight-surface text-midnight-text hover:bg-[#2A3649] active:bg-[#1C2432] border border-midnight-border',
        outline:
          'border border-midnight-border bg-transparent text-midnight-text hover:bg-midnight-card hover:border-slate-500 active:bg-midnight-surface',
        ghost:
          'text-midnight-muted hover:bg-midnight-surface hover:text-midnight-text active:bg-midnight-card',
        danger:
          'bg-midnight-rose text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm shadow-rose-950/40',
        emerald:
          'bg-midnight-emerald text-white hover:bg-emerald-600 active:bg-emerald-700 shadow-sm shadow-emerald-950/40',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-6 text-base font-semibold',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
