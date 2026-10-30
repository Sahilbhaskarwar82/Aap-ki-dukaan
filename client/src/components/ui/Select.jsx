import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const Select = React.forwardRef(
  (
    {
      className,
      label,
      helperText,
      error,
      id,
      disabled,
      options = [],
      placeholder = 'Select an option',
      children,
      ...props
    },
    ref
  ) => {
    const selectId = id || React.useId();
    const helperId = `${selectId}-helper`;
    const errorId = `${selectId}-error`;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={selectId}
            className={cn(
              'block text-xs font-medium tracking-wide uppercase',
              error ? 'text-midnight-rose' : 'text-midnight-muted',
              disabled && 'opacity-50'
            )}
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            disabled={disabled}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={cn(
              'flex h-10 w-full appearance-none rounded-md border border-midnight-border bg-midnight-card px-3 py-2 pr-9 text-sm text-midnight-text ring-offset-midnight-bg placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red focus-visible:border-midnight-red disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer',
              error &&
                'border-midnight-rose focus-visible:ring-midnight-rose',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {options.length > 0
              ? options.map((opt) => (
                  <option
                    key={opt.value ?? opt}
                    value={opt.value ?? opt}
                    disabled={opt.disabled}
                    className="bg-midnight-card text-midnight-text py-1"
                  >
                    {opt.label ?? opt}
                  </option>
                ))
              : children}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-midnight-muted">
            <ChevronDown className="h-4 w-4" />
          </div>
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

Select.displayName = 'Select';

export { Select };
