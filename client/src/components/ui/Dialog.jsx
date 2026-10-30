import React, { createContext, useContext, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DialogContext = createContext({
  open: false,
  setOpen: () => {},
});

const Dialog = ({ children, open: controlledOpen, onOpenChange }) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = (val) => {
    if (!isControlled) {
      setUncontrolledOpen(val);
    }
    if (onOpenChange) {
      onOpenChange(val);
    }
  };

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
};

const DialogTrigger = React.forwardRef(
  ({ children, asChild = false, onClick, ...props }, ref) => {
    const { setOpen } = useContext(DialogContext);

    const handleClick = (e) => {
      if (onClick) onClick(e);
      setOpen(true);
    };

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ref,
        onClick: handleClick,
        ...props,
      });
    }

    return (
      <button ref={ref} type="button" onClick={handleClick} {...props}>
        {children}
      </button>
    );
  }
);
DialogTrigger.displayName = 'DialogTrigger';

const DialogClose = React.forwardRef(
  ({ children, asChild = false, onClick, ...props }, ref) => {
    const { setOpen } = useContext(DialogContext);

    const handleClick = (e) => {
      if (onClick) onClick(e);
      setOpen(false);
    };

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ref,
        onClick: handleClick,
        ...props,
      });
    }

    return (
      <button ref={ref} type="button" onClick={handleClick} {...props}>
        {children}
      </button>
    );
  }
);
DialogClose.displayName = 'DialogClose';

const DialogContent = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useContext(DialogContext);
    const contentRef = useRef(null);

    // Escape key handling & body scroll locking
    useEffect(() => {
      if (!open) return;

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setOpen(false);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = originalOverflow;
      };
    }, [open, setOpen]);

    if (!open) return null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
      >
        {/* Backdrop overlay */}
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />

        {/* Modal Window */}
        <div
          ref={(node) => {
            contentRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          className={cn(
            'relative z-50 w-full max-w-lg rounded-xl border border-midnight-border bg-midnight-card p-6 shadow-2xl shadow-black/80 transition-all text-midnight-text max-h-[90vh] overflow-y-auto',
            className
          )}
          {...props}
        >
          {children}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close dialog"
            className="absolute right-4 top-4 rounded-sm text-midnight-muted opacity-70 transition-opacity hover:opacity-100 hover:text-white focus:outline-none focus:ring-2 focus:ring-midnight-red"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-left mb-4', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6 gap-2',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight text-white font-display', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-midnight-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
