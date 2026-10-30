import React, { createContext, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

const TabsContext = createContext({
  value: '',
  onValueChange: () => {},
});

const Tabs = ({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  className,
  children,
  ...props
}) => {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const activeValue = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = (val) => {
    if (!isControlled) {
      setUncontrolledValue(val);
    }
    if (onValueChange) {
      onValueChange(val);
    }
  };

  return (
    <TabsContext.Provider value={{ value: activeValue, onValueChange: handleValueChange }}>
      <div className={cn('w-full', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-lg bg-midnight-surface p-1 text-midnight-muted border border-midnight-border',
      className
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef(
  ({ className, value, disabled, children, ...props }, ref) => {
    const { value: activeValue, onValueChange } = useContext(TabsContext);
    const isSelected = activeValue === value;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isSelected}
        disabled={disabled}
        onClick={() => onValueChange(value)}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ring-offset-midnight-bg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
          isSelected
            ? 'bg-midnight-card text-white shadow-sm border border-midnight-border/80'
            : 'text-midnight-muted hover:text-midnight-text hover:bg-midnight-surface/60',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef(
  ({ className, value, children, ...props }, ref) => {
    const { value: activeValue } = useContext(TabsContext);
    const isSelected = activeValue === value;

    if (!isSelected) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        tabIndex={0}
        className={cn(
          'mt-2 ring-offset-midnight-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
