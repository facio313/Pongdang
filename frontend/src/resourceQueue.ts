/** Keep page fan-out below the backend reader's four simultaneous DB slots. */
export function createReadQueue(limit = 3) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const drain = () => {
    while (active < limit && waiting.length) waiting.shift()!();
  };
  return function queue<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      const cancel = () => {
        const index = waiting.indexOf(start);
        if (index >= 0) waiting.splice(index, 1);
        reject(signal.reason);
      };
      const start = () => {
        signal.removeEventListener("abort", cancel);
        if (signal.aborted) { reject(signal.reason); return; }
        active++;
        Promise.resolve().then(read).then(resolve, reject).finally(() => { active--; drain(); });
      };
      signal.addEventListener("abort", cancel, { once: true });
      waiting.push(start);
      drain();
    });
  };
}

export const queueResourceRead = createReadQueue();
