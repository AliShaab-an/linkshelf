import { useEffect, useState } from 'react';
import { RATE_PROMPT_STORAGE_KEY } from '@/domain/rate-prompt';
import { answerRatePrompt, getRatePrompt, type RatePromptAction } from '@/messaging/contracts';
import { Button } from './ui/Button';

/** A one-time, dismissible request to rate LinkShelf. The worker decides when it is due. */
export function RatePromptCard() {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const refresh = () => void getRatePrompt()
      .then(response => { if (active && response.success) setVisible(response.visible); })
      .catch(() => undefined);
    refresh();
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && Object.hasOwn(changes, RATE_PROMPT_STORAGE_KEY)) refresh();
    };
    browser.storage.onChanged.addListener(listener);
    return () => { active = false; browser.storage.onChanged.removeListener(listener); };
  }, []);

  async function answer(action: Exclude<RatePromptAction, 'get'>) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await answerRatePrompt(action);
      if (!response.success) throw new Error(response.error.message);
      setVisible(response.visible);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'LinkShelf could not open the Chrome Web Store.');
    } finally {
      setPending(false);
    }
  }

  if (!visible) return null;
  return <section aria-labelledby="rate-prompt-title" className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
    <h2 id="rate-prompt-title" className="font-semibold text-slate-900">Enjoying LinkShelf?</h2>
    <p className="mt-1">A short review on the Chrome Web Store helps other people find it. It only takes a minute.</p>
    {error && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</p>}
    <Button type="button" variant="primary" className="mt-3 w-full" disabled={pending} onClick={() => void answer('rate')}>Rate LinkShelf</Button>
    <div className="mt-2 flex gap-2">
      <Button type="button" className="flex-1" disabled={pending} onClick={() => void answer('later')}>Maybe later</Button>
      <Button type="button" className="flex-1" disabled={pending} onClick={() => void answer('never')}>Don’t ask again</Button>
    </div>
  </section>;
}
