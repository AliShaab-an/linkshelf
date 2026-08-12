import type { ReactNode } from 'react';

export type IconName = 'archive' | 'bookmark' | 'check' | 'clock' | 'folder' | 'more' | 'park' | 'search' | 'settings' | 'today' | 'trash' | 'undo';

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    archive: <><path d="M4 7h16v12H4z"/><path d="M3 3h18v4H3zM9 11h6"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    folder: <path d="M3 6h7l2 2h9v11H3z"/>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    park: <><path d="M6 4v16M18 4v16M6 12h12"/><path d="M3 20h18"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2.1-.7-.7-1.7 1-2-2.1-2.1-2 1-1.7-.7L10.5 2h-3l-.7 2.1-1.7.7-2-1L1 5.9l1 2-.7 1.7L-1 10.5v3l2.1.7.7 1.7-1 2L3 20l2-1 1.7.7.8 2.3h3l.7-2.1 1.7-.7 2 1 2.1-2.1-1-2 .7-1.7z" transform="translate(2) scale(.83)"/></>,
    today: <><path d="M4 5h16v15H4zM8 3v4M16 3v4M4 9h16"/><path d="m8 14 2 2 5-5"/></>,
    trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    undo: <><path d="m9 7-5 5 5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
