import { ACCOUNT_STORAGE_KEY, AccountStateSchema, SIGNED_OUT, type AccountState } from '@/domain/account';
import type { StorageAdapter } from './storage-adapter';

/**
 * Serialized reads and writes of the account record. A missing or invalid record
 * means signed out, so a damaged record can never break the rest of LinkShelf.
 */
export class AccountStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: StorageAdapter) {}

  private async read(): Promise<AccountState> {
    const parsed = AccountStateSchema.safeParse(await this.storage.get(ACCOUNT_STORAGE_KEY));
    return parsed.success ? parsed.data : SIGNED_OUT;
  }

  /** Run one read-change-write step at a time; the change may return the same state to skip writing. */
  update<T>(change: (state: AccountState) => Promise<{ state: AccountState; result: T }>): Promise<T> {
    const action = async () => {
      const current = await this.read();
      const { state, result } = await change(current);
      if (state !== current) await this.storage.set(ACCOUNT_STORAGE_KEY, AccountStateSchema.parse(state));
      return result;
    };
    const run = this.tail.then(action, action);
    this.tail = run.catch(() => undefined);
    return run;
  }

  get(): Promise<AccountState> {
    return this.update(async state => ({ state, result: state }));
  }
}
