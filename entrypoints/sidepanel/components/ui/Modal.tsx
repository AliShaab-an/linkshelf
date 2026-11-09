import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ titleId, onClose, children }: { titleId: string; onClose(): void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('button, select, input')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]') ?? [])];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/60 bg-white p-5 shadow-2xl shadow-slate-950/25">{children}</div>
  </div>;
}
