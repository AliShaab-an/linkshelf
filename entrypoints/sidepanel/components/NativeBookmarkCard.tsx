import type { NativeBookmarkResult } from '@/messaging/contracts';

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
      <div className="flex items-start justify-between gap-3">
        <h3 className="break-words font-semibold leading-snug" dir="auto">{bookmark.title}</h3>
        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-800">
          Chrome bookmark
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-slate-500">{domain}</p>
      <button
        type="button"
        className="mt-3 w-full rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={isOpening}
        onClick={onOpen}
      >
        {isOpening ? 'Opening...' : 'Open bookmark'}
      </button>
    </article>
  );
}
