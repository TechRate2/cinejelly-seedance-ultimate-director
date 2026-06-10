/**
 * Time helpers used for latency tracking and polling without leaking provider details.
 */

export function now(): Date {
  return new Date();
}

export function elapsedMs(startedAt: Date, endedAt: Date = now()): number {
  return Math.max(0, endedAt.getTime() - startedAt.getTime());
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason instanceof Error ? signal.reason : new Error("Sleep aborted."));
      },
      { once: true }
    );
  });
}
