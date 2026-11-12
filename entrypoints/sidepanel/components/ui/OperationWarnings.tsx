export function OperationWarnings({ warnings, announce = true }: { warnings: string[]; announce?: boolean }) {
  if (warnings.length === 0) return null;
  return <div role={announce ? 'status' : undefined} className="my-3 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
    {warnings.map((warning, index) => <p key={index}>{warning}</p>)}
  </div>;
}
