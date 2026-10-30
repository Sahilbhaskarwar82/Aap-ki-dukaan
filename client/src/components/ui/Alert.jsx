import React from 'react';
import { cva } from 'class-variance-authority';
import { Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default:
          'border-midnight-border bg-midnight-card text-midnight-text [&>svg]:text-midnight-muted',
        info:
          'border-cyan-500/30 bg-cyan-950/40 text-cyan-200 [&>svg]:text-cyan-400',
        success:
          'border-emerald-500/30 bg-emerald-950/40 text-emerald-200 [&>svg]:text-emerald-400',
        warning:
          'border-amber-500/30 bg-amber-950/40 text-amber-200 [&>svg]:text-amber-400',
        error:
          'border-rose-500/30 bg-rose-950/40 text-rose-200 [&>svg]:text-rose-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const defaultIcons = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

const Alert = React.forwardRef(
  ({ className, variant = 'default', icon, children, ...props }, ref) => {
    const IconComponent = icon || defaultIcons[variant] || Info;

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {IconComponent && <IconComponent className="h-4 w-4" />}
        {children}
      </div>
    );
  }
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-semibold leading-none tracking-tight text-white', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed text-midnight-muted', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
