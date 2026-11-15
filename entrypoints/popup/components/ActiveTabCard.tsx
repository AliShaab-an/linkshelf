interface ActiveTabCardProps {
  title: string;
  domain: string;
  isEligible: boolean;
}

export function ActiveTabCard({
  title,
  domain,
  isEligible,
}: ActiveTabCardProps) {
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="line-clamp-2 wrap-anywhere text-sm font-semibold leading-snug" dir="auto" title={title}>{title}</p>
      {isEligible && <p className="mt-0.5 truncate text-xs text-slate-600" title={domain}>{domain}</p>}
      {!isEligible && (
        <p className="mt-1 text-sm text-slate-600">
          Chrome doesn’t allow LinkShelf to park this page.
        </p>
      )}
    </div>
  );
}
