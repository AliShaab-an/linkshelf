import type { ComponentPropsWithRef } from 'react';

export function Select({ className = '', ...props }: ComponentPropsWithRef<'select'>) {
  return <select {...props}
    className={`min-h-10 min-w-0 truncate rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-800 disabled:opacity-50 ${className}`} />;
}
