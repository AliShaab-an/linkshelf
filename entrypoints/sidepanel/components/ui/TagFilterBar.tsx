import { useState } from 'react';

export const TAG_FILTER_INITIAL = 8;
export const TAG_FILTER_MAX = 50;

interface TagFilterBarProps {
  tags: Array<{ tag: string; count: number }>;
  /** Normalized tags currently applied as filters. */
  selected: readonly string[];
  label?: string;
  onToggle(tag: string): void;
}

/** Bounded, keyboard-reachable tag filter. Selected tags always stay visible. */
export function TagFilterBar({ tags, selected, label = 'Filter by tag', onToggle }: TagFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const all = [
    ...selected.filter((tag) => !tags.some((entry) => entry.tag === tag)).map((tag) => ({ tag, count: 0 })),
    ...tags,
  ];
  if (all.length === 0) return null;
  const limit = expanded ? TAG_FILTER_MAX : TAG_FILTER_INITIAL;
  const shown = all.filter((entry, index) => index < limit || selected.includes(entry.tag));
  const hidden = Math.min(all.length, TAG_FILTER_MAX) - shown.length;

  return <div role="group" aria-label={label} className="mb-3 flex flex-wrap items-center gap-1.5">
    {shown.map(({ tag, count }) => {
      const active = selected.includes(tag);
      return <button key={tag} type="button" aria-pressed={active} title={tag}
        className={`inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border px-2.5 text-xs font-semibold ${active ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
        onClick={() => onToggle(tag)}>
        <span className="truncate" dir="auto">{tag}</span>
        {count > 0 && <span className={active ? 'text-blue-100' : 'text-slate-600'} aria-label={`, ${count} ${count === 1 ? 'link' : 'links'}`}>{count}</span>}
      </button>;
    })}
    {(hidden > 0 || (expanded && all.length > TAG_FILTER_INITIAL)) && <button type="button" aria-expanded={expanded}
      className="min-h-8 rounded px-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800"
      onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show fewer' : `Show ${hidden} more`}</button>}
  </div>;
}
