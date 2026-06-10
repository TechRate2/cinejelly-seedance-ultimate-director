/**
 * HTTP lifecycle coordination for paid render requests.
 * It propagates client disconnects and deployment shutdowns into AbortSignal-aware provider work.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export interface HttpRequestLifecycle {
  readonly signal: AbortSignal;
  complete(): void;
  abort(reason: Error): void;
  dispose(): void;
}

export class ApiShutdownCoordinator {
  private readonly activeRequests = new Set<HttpRequestLifecycle>();

  public register(lifecycle: HttpRequestLifecycle): () => void {
    this.activeRequests.add(lifecycle);
    return () => {
      this.activeRequests.delete(lifecycle);
    };
  }

  public abortActiveRequests(reason: string): number {
    const error = new Error(reason);
    for (const lifecycle of this.activeRequests) {
      lifecycle.abort(error);
    }
    return this.activeRequests.size;
  }
}

export function createHttpRequestLifecycle(
  request: IncomingMessage,
  response: ServerResponse
): HttpRequestLifecycle {
  const abortController = new AbortController();
  let completed = false;

  const abort = (reason: Error): void => {
    if (!completed && !abortController.signal.aborted) {
      abortController.abort(reason);
    }
  };
  const onRequestAborted = (): void => {
    abort(new Error("HTTP request was aborted by the client."));
  };
  const onResponseClosed = (): void => {
    if (!response.writableEnded) {
      abort(new Error("HTTP connection closed before the response completed."));
    }
  };

  request.once("aborted", onRequestAborted);
  response.once("close", onResponseClosed);

  return {
    signal: abortController.signal,
    complete(): void {
      completed = true;
    },
    abort,
    dispose(): void {
      request.off("aborted", onRequestAborted);
      response.off("close", onResponseClosed);
    }
  };
}
