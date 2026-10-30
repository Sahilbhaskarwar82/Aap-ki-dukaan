import React from 'react';
import { Toaster as SonnerToaster, toast } from 'sonner';

const Toaster = ({ ...props }) => {
  return (
    <SonnerToaster
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-midnight-card group-[.toaster]:text-midnight-text group-[.toaster]:border-midnight-border group-[.toaster]:shadow-xl group-[.toaster]:shadow-black/70 rounded-lg p-4 border',
          description: 'group-[.toast]:text-midnight-muted text-xs',
          actionButton:
            'group-[.toast]:bg-midnight-red group-[.toast]:text-white font-medium text-xs',
          cancelButton:
            'group-[.toast]:bg-midnight-surface group-[.toast]:text-midnight-muted text-xs',
          success:
            'group-[.toast]:border-emerald-500/40 group-[.toast]:text-emerald-300',
          error:
            'group-[.toast]:border-rose-500/40 group-[.toast]:text-rose-300',
          warning:
            'group-[.toast]:border-amber-500/40 group-[.toast]:text-amber-300',
          info:
            'group-[.toast]:border-cyan-500/40 group-[.toast]:text-cyan-300',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
