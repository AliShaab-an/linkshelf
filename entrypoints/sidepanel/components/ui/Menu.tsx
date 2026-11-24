import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface MenuItem {
  label: string;
  onSelect(): void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A "⋯" button with a short list of actions. It closes on Escape, on a click outside, or when focus
 * leaves it, and opens downward unless there is no room below.
 */
export function Menu({ label, items, className = '' }: { label: string; items: readonly (MenuItem | false | undefined)[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const actions = items.filter((item): item is MenuItem => Boolean(item));

  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const rect = button.current.getBoundingClientRect();
    const below = innerHeight - rect.bottom;
    setUpward(below < panel.current.offsetHeight + 16 && rect.top > below);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && (button.current?.contains(event.target) || panel.current?.contains(event.target))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('focusin', close);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('focusin', close);
    };
  }, [open]);

  function choose(item: MenuItem) {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
    item.onSelect();
  }

  return <div className={`relative shrink-0 ${className}`} onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    button.current?.focus();
  }}>
    <button ref={button} type="button" aria-label={label} aria-expanded={open} aria-controls={id} disabled={actions.length === 0}
      className="inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
      onClick={() => setOpen(current => !current)}>
      <Icon name="more" className="size-4" />
    </button>
    <div id={id} ref={panel} hidden={!open} role="group" aria-label={label}
      className={`dropdown-panel absolute right-0 z-30 min-w-44 space-y-1 ${upward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
      {open && actions.map(item => <MenuButton key={item.label} item={item} onChoose={choose} />)}
    </div>
  </div>;
}

function MenuButton({ item, onChoose }: { item: MenuItem; onChoose(item: MenuItem): void }): ReactNode {
  return <button type="button" disabled={item.disabled}
    className={`dropdown-action disabled:opacity-50 ${item.danger ? 'text-red-700 hover:bg-red-50' : ''}`}
    onClick={() => onChoose(item)}>{item.label}</button>;
}
