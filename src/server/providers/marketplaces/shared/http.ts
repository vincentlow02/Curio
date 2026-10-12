import "server-only";

export type HttpRequestMetricHooks = {
  onRequest?: () => void;
  onHttpRequestStarted?: () => void;
  onHttpRequestCompleted?: (status: number | null, elapsedMs: number, blockingRelevant?: boolean) => void;
};

export function createTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

export async function fetchWithHttpMetrics(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  hooks: HttpRequestMetricHooks = {},
): Promise<Response> {
  const startedAt = performance.now();
  hooks.onRequest?.();
  hooks.onHttpRequestStarted?.();
  try {
    const response = await fetchImpl(input, init);
    hooks.onHttpRequestCompleted?.(response.status, performance.now() - startedAt, true);
    return response;
  } catch (error) {
    hooks.onHttpRequestCompleted?.(null, performance.now() - startedAt, true);
    throw error;
  }
}