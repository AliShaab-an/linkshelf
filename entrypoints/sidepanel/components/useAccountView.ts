import { useCallback, useEffect, useState } from 'react';
import { ACCOUNT_STORAGE_KEY, type AccountView } from '@/domain/account';
import { getAccount } from '@/messaging/contracts';

/**
 * The account as the interface may see it, kept current when any page (or the worker)
 * changes the stored account, so every account button shows the same state.
 */
export function useAccountView() {
  const [account, setAccount] = useState<AccountView | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await getAccount();
      setAccount(response.account);
    } catch {
      // Leave the last known state; the Account page reports errors.
    }
  }, []);

  useEffect(() => {
    void reload();
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && Object.hasOwn(changes, ACCOUNT_STORAGE_KEY)) void reload();
    };
    browser.storage.onChanged?.addListener(changed);
    return () => browser.storage.onChanged?.removeListener(changed);
  }, [reload]);

  return { account, setAccount, reload };
}
