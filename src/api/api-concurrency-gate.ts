/**
 * In-process concurrency gate for long-running synchronous API work.
 * It protects the API process from accepting too many request-bound render pipelines at once.
 */

export interface ApiConcurrencyGateSettings {
  readonly maxConcurrent?: number;
  readonly retryAfterSeconds?: number;
}

export type ApiConcurrencyDecision =
  | {
      readonly allowed: true;
      readonly release: () => void;
    }
  | {
      readonly allowed: false;
      readonly statusCode: 503;
      readonly retryAfterSeconds: number;
      readonly message: string;
    };

export class ApiConcurrencyGate {
  private readonly maxConcurrent: number;
  private readonly retryAfterSeconds: number;
  private activeCount = 0;

  public constructor(settings: ApiConcurrencyGateSettings = {}) {
    this.maxConcurrent = positiveOrDefault(settings.maxConcurrent, 1);
    this.retryAfterSeconds = positiveOrDefault(settings.retryAfterSeconds, 30);
  }

  public tryAcquire(): ApiConcurrencyDecision {
    if (this.activeCount >= this.maxConcurrent) {
      return {
        allowed: false,
        statusCode: 503,
        retryAfterSeconds: this.retryAfterSeconds,
        message: "Synchronous render capacity is full. Retry later or use /v1/render-jobs for long-running work."
      };
    }

    this.activeCount += 1;
    let released = false;
    return {
      allowed: true,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.activeCount = Math.max(0, this.activeCount - 1);
      }
    };
  }
}

function positiveOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}
