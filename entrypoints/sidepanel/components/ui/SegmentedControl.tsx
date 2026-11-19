import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange(value: T): void;
  disabled?: boolean;
  /** Settings that are temporarily locked stay focusable but do not change. */
  'aria-disabled'?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
}

/**
 * A short set of choices shown side by side: a radio group with one tab stop
 * where the arrow keys move and select, as in the WAI-ARIA APG radio pattern.
 */
export function SegmentedControl<T extends string>({
  value, options, onChange, disabled, className = '',
  'aria-disabled': ariaDisabled, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy,
}: SegmentedControlProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const locked = disabled || ariaDisabled;

  function select(index: number) {
    const option = options[index];
    if (!option || locked) return;
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next > last ? 0 : next < 0 ? last : next);
  }

  return <div ref={group} role="radiogroup" data-value={value}
    aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy}
    aria-disabled={ariaDisabled || disabled || undefined}
    className={`segmented-control grid min-h-10 gap-1 rounded-lg border border-slate-300 bg-slate-100 p-1 ${locked ? 'opacity-60' : ''} ${className}`}
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((option, index) => {
      const checked = index === selectedIndex;
      return <button key={option.value} type="button" role="radio" aria-checked={checked} data-value={option.value}
        tabIndex={checked ? 0 : -1} disabled={disabled}
        className={`min-h-8 min-w-0 rounded-md px-2 text-sm font-semibold leading-tight ${checked ? 'segmented-selected bg-white text-blue-800 shadow-sm ring-1 ring-slate-300' : 'text-slate-600 hover:text-slate-900'} ${locked ? 'cursor-not-allowed' : ''}`}
        onClick={() => select(index)} onKeyDown={event => onKeyDown(event, index)}>
        {option.label}
      </button>;
    })}
  </div>;
}
