export function OperationWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return <div role="status" className="my-3 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
    {warnings.map((warning, index) => <p key={index}>{warning}</p>)}
  </div>;
}
