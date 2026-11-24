import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  id?: string;
  value: T;
  options: readonly DropdownOption<T>[];
  onChange(value: T): void;
  disabled?: boolean;
  /** Settings that are temporarily locked stay focusable but do not open. */
  'aria-disabled'?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  /** Shown when no option matches `value`, such as while options are loading. */
  placeholder?: string;
  title?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  /** Marks the control a Modal focuses first. */
  'data-modal-initial'?: boolean;
}

interface Position { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

const TYPEAHEAD_RESET_MS = 600;
const MAX_LIST_HEIGHT = 288;

/**
 * A select-only combobox (WAI-ARIA APG pattern). Focus stays on the button and the
 * active option is announced through `aria-activedescendant`. The list is fixed
 * to the viewport so dialogs and menus with hidden overflow never clip it.
 */
export function Dropdown<T extends string>({
  id, value, options, onChange, disabled, placeholder, title, className = '', ref,
  'aria-disabled': ariaDisabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy, 'data-modal-initial': modalInitial,
}: DropdownProps<T>) {
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;
  const optionId = (index: number) => `${listId}-option-${index}`;
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<Position>();
  const [labelText, setLabelText] = useState<string>();
  const matchedIndex = options.findIndex(option => option.value === value);
  // Like a native <select>, an unmatched value shows the first option unless a placeholder is given.
  const selectedIndex = matchedIndex >= 0 || placeholder !== undefined ? matchedIndex : 0;
  const selected = options[selectedIndex];
  const unavailable = disabled || ariaDisabled || options.length === 0;

  const place = useCallback(() => {
    const element = trigger.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    // Outside a dialog, the sidebar's sticky header stacks above the list, so never place it there.
    const header = element.closest('dialog') ? 0
      : Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-shell-height')) || 0;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - header - 8;
    const width = Math.min(Math.max(rect.width, 176), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const flip = below < 160 && above > below;
    setPosition(flip
      ? { left, width, bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(MAX_LIST_HEIGHT, above) }
      : { left, width, top: rect.bottom + 4, maxHeight: Math.min(MAX_LIST_HEIGHT, Math.max(below, 120)) });
  }, []);

  function show(index = selectedIndex) {
    if (unavailable) return;
    // A <label for> names the button; give the list the same name, not the chosen value.
    if (!ariaLabel && !ariaLabelledBy) setLabelText(trigger.current?.labels?.[0]?.textContent?.trim() || undefined);
    place();
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  }

  const close = useCallback(() => setOpen(false), []);

  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    if (option && option.value !== value) onChange(option.value);
  }

  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' });
  });

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) close();
    };
    const reposition = (event: Event) => { if (!list.current?.contains(event.target as Node)) place(); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', place);
    };
  }, [open, close, place]);

  useEffect(() => { if (unavailable) setOpen(false); }, [unavailable]);

  function matchTypeahead(key: string, from: number) {
    const now = Date.now();
    const state = typeahead.current;
    state.text = now - state.at > TYPEAHEAD_RESET_MS ? key : state.text + key;
    state.at = now;
    const query = state.text.toLocaleLowerCase();
    const repeated = query.length > 1 && [...query].every(character => character === query[0]);
    const needle = repeated ? query[0] : query;
    const start = repeated || query.length === 1 ? from + 1 : from;
    for (let step = 0; step < options.length; step++) {
      const index = (start + step) % options.length;
      if (options[index].label.toLocaleLowerCase().startsWith(needle)) return index;
    }
    return -1;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (unavailable) return;
    const last = options.length - 1;
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        show();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        show(event.key === 'Home' ? 0 : last);
      } else if (printable) {
        const match = matchTypeahead(event.key, selectedIndex);
        if (match >= 0) { event.preventDefault(); show(match); }
      }
      return;
    }
    const move = (index: number) => { event.preventDefault(); setActive(Math.max(0, Math.min(last, index))); };
    switch (event.key) {
      case 'ArrowDown': if (event.altKey) { event.preventDefault(); choose(active); } else move(active + 1); return;
      case 'ArrowUp': if (event.altKey) { event.preventDefault(); choose(active); } else move(active - 1); return;
      case 'Home': move(0); return;
      case 'End': move(last); return;
      case 'PageDown': move(active + 10); return;
      case 'PageUp': move(active - 10); return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        return;
      case 'Escape':
        // Close only this list; a surrounding menu or dialog stays open.
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case 'Tab':
        close();
        return;
      default:
        if (printable) {
          const match = matchTypeahead(event.key, active);
          if (match >= 0) move(match);
        }
    }
  }

  return <>
    <button
      ref={element => {
        trigger.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
      id={id} type="button" role="combobox" data-value={value} data-modal-initial={modalInitial || undefined}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
      aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy}
      aria-disabled={ariaDisabled || undefined} disabled={disabled}
      title={title ?? selected?.label}
      className={`linkshelf-select flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-start text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed ${className}`}
      onClick={() => (open ? close() : show())}
      onKeyDown={onKeyDown}>
      <span className="min-w-0 truncate">{selected?.label ?? placeholder ?? ''}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && position && <ul ref={list} id={listId} role="listbox" tabIndex={-1}
      aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : labelText)} aria-labelledby={ariaLabel ? undefined : ariaLabelledBy}
      className="dropdown-panel fixed z-50 overflow-y-auto overscroll-contain p-1"
      style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}>
      {options.map((option, index) => {
        const isSelected = index === selectedIndex;
        return <li key={option.value} id={optionId(index)} role="option" aria-selected={isSelected} data-value={option.value}
          className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${index === active ? 'bg-blue-50 text-blue-900' : 'text-slate-800'} ${isSelected ? 'font-semibold' : ''}`}
          onPointerDown={event => event.preventDefault()}
          onPointerMove={() => { if (active !== index) setActive(index); }}
          onClick={() => { choose(index); trigger.current?.focus(); }}>
          <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-4 shrink-0 ${isSelected ? 'text-blue-700' : 'invisible'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>
          <span className="min-w-0 wrap-anywhere">{option.label}</span>
        </li>;
      })}
    </ul>}
  </>;
}
