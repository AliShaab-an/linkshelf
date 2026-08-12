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
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="break-words font-semibold leading-snug" dir="auto">{title}</p>
      <p className="mt-1 truncate text-sm text-slate-500">{domain}</p>
      {!isEligible && (
        <p className="mt-2.5 text-sm text-red-700">
          This type of Chrome page cannot be parked.
        </p>
      )}
    </section>
  );
}
