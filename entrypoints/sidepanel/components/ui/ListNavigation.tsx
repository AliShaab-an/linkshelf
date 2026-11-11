import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { listRange } from '../../list-range';

const buttonStyle = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold aria-disabled:opacity-50';

export function ListNavigation({ label, range, count, onPage, children }: {
  label: string;
  range: ReturnType<typeof listRange>;
  count: number;
  onPage(page: number): void;
  children?: ReactNode;
}) {
  const inputId = useId();
  const pageInput = useRef<HTMLInputElement>(null);
  const { page, pages, start, end } = range;
  useLayoutEffect(() => {
    if (pageInput.current) pageInput.current.value = String(page + 1);
  }, [page, pages]);
  if (pages === 1 && !children) return null;
  return <nav aria-label={label} className="mb-3 mt-2 flex flex-wrap items-center gap-2">
    {pages > 1 && <>
      <button type="button" className={buttonStyle} aria-disabled={page === 0} onClick={() => { if (page > 0) onPage(page - 1); }}>Previous page</button>
      <button type="button" className={buttonStyle} aria-disabled={page === pages - 1} onClick={() => { if (page + 1 < pages) onPage(page + 1); }}>Next page</button>
      <form className="flex items-center gap-1.5" onSubmit={event => {
        event.preventDefault();
        const target = Number(new FormData(event.currentTarget).get('page')) - 1;
        if (Number.isInteger(target) && target >= 0 && target < pages) onPage(target);
      }}>
        <label className="sr-only" htmlFor={inputId}>Page number</label>
        <input ref={pageInput} id={inputId} name="page" type="number" min={1} max={pages} required defaultValue={page + 1} className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <button className={buttonStyle} type="submit">Go</button>
      </form>
      <p role="status" className="basis-full text-xs text-slate-500">Showing {start + 1}–{end} of {count} · Page {page + 1} of {pages}</p>
    </>}
    {children}
  </nav>;
}
