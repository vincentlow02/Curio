import "server-only";

export const MULTIPART_OVERHEAD_BYTES = 512 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("The request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

function declaredLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) throw new Error("Invalid Content-Length header.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new RequestBodyTooLargeError();
  return value;
}

export async function boundedFormData(request: Request, maxPayloadBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new Error("The request must use multipart/form-data.");
  }
  const maxRequestBytes = maxPayloadBytes + MULTIPART_OVERHEAD_BYTES;
  const length = declaredLength(request);
  if (length !== null && length > maxRequestBytes) throw new RequestBodyTooLargeError();
  if (!request.body) return request.formData();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxRequestBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bounded = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total),
  });
  return bounded.formData();
}
