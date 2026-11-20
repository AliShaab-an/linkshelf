import type { NativeBookmarkResult } from '@/messaging/contracts';
import { buttonClass } from './ui/styles';

interface NativeBookmarkCardProps {
  cardId?: string;
  bookmark: NativeBookmarkResult;
  isOpening: boolean;
  onOpen: () => void;
}

export function NativeBookmarkCard({
  cardId,
  bookmark,
  isOpening,
  onOpen,
}: NativeBookmarkCardProps) {
  let domain = bookmark.url;
  try {
    domain = new URL(bookmark.url).hostname;
  } catch {
    // Chrome supplied the URL; showing it unchanged is the safest fallback.
  }

  return (
    <article id={cardId} className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold leading-snug" dir="auto">{bookmark.title}</h3>
        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-800">
          Chrome bookmark
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-slate-500">{domain}</p>
      <button
        type="button"
        className={buttonClass('primary', 'mt-3 w-full')}
        disabled={isOpening}
        onClick={onOpen}
      >
        {isOpening ? 'Opening...' : 'Open Chrome bookmark'}
      </button>
    </article>
  );
}
