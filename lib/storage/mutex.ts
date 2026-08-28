interface QueueEntry {
  tail: Promise<void>;
  pending: number;
}

export class KeyedFifoExecutor {
  private readonly queues = new Map<string, QueueEntry>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    let entry = this.queues.get(key);
    if (entry === undefined) {
      entry = { tail: Promise.resolve(), pending: 0 };
      this.queues.set(key, entry);
    }

    const prior = entry.tail.catch(() => undefined);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    entry.tail = prior.then(() => gate);
    entry.pending += 1;

    await prior;
    try {
      return await task();
    } finally {
      entry.pending -= 1;
      release?.();
      if (entry.pending === 0 && this.queues.get(key) === entry) {
        this.queues.delete(key);
      }
    }
  }

  sizeForTesting(): number {
    return this.queues.size;
  }
}
