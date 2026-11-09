export class OperationInProgressError extends Error {
  constructor() {
    super('Another action is already using this link or tab. Wait for it to finish before trying again.');
    this.name = 'OperationInProgressError';
  }
}

/** Worker-local reservations for conflicting actions and FIFO queues for shared destinations. */
export class OperationCoordinator {
  private readonly reserved = new Set<string>();
  private readonly queues = new Map<string, Promise<void>>();

  async reserve<T>(keys: string[], action: () => Promise<T>): Promise<T> {
    const unique = [...new Set(keys)];
    if (unique.some((key) => this.reserved.has(key))) throw new OperationInProgressError();
    unique.forEach((key) => this.reserved.add(key));
    try {
      return await action();
    } finally {
      unique.forEach((key) => this.reserved.delete(key));
    }
  }

  async enqueue<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const result = previous.then(action);
    const tail = result.then(() => undefined, () => undefined);
    this.queues.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    }
  }
}
