import React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(
  (
    {
      className,
      type = 'text',
      label,
      helperText,
      error,
      id,
      disabled,
      leftIcon,
      rightIcon,
      ...props
    },
    ref
  ) => {
    const inputId = id || React.useId();
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'block text-xs font-medium tracking-wide uppercase',
              error ? 'text-midnight-rose' : 'text-midnight-muted',
              disabled && 'opacity-50'
            )}
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 flex items-center text-midnight-muted">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            type={type}
            disabled={disabled}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={cn(
              'flex h-10 w-full rounded-md border border-midnight-border bg-midnight-card px-3 py-2 text-sm text-midnight-text ring-offset-midnight-bg file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red focus-visible:border-midnight-red disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error &&
                'border-midnight-rose focus-visible:ring-midnight-rose focus-visible:border-midnight-rose',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="pointer-events-none absolute right-3 flex items-center text-midnight-muted">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <p id={errorId} className="text-xs text-midnight-rose font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-midnight-muted">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
