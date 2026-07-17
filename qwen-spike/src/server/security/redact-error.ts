import "server-only";

export function publicError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/(?:sk|tvly|dtn)[-_][A-Za-z0-9._-]+/gi, "[redacted]")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[local path]")
    .slice(0, 300);
}
