import { OperationWarnings } from './OperationWarnings';

interface OperationFeedbackProps {
  pending?: string;
  message?: string | null;
  error?: string | null;
  warnings?: string[];
  partial?: boolean;
}

export function OperationFeedback({ pending, message, error, warnings = [], partial = false }: OperationFeedbackProps) {
  const caution = partial || warnings.length > 0;
  return <>
    <div role="status" aria-atomic="true">
      {pending && <p className="my-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{pending}</p>}
      {!pending && message && <p className={`my-3 rounded-lg p-3 text-sm ${caution ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
      <OperationWarnings warnings={warnings} announce={false} />
    </div>
    <div role="alert" aria-atomic="true">
      {error && <p className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  </>;
}
