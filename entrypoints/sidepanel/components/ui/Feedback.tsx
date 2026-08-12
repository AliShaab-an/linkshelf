import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-center"><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-blue-50 text-xl">✓</div><h3 className="mt-3 font-bold text-slate-800">{title}</h3>{children && <div className="mt-1 text-sm leading-6 text-slate-500">{children}</div>}</div>;
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return <div className="space-y-3" aria-label="Loading"><span className="sr-only">Loading</span>{Array.from({ length: count }, (_, index) => <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4"><div className="h-4 w-2/3 rounded bg-slate-200"/><div className="mt-3 h-3 w-1/3 rounded bg-slate-100"/><div className="mt-5 h-9 rounded-xl bg-slate-100"/></div>)}</div>;
}
