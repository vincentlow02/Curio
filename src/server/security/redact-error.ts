import "server-only";

const SAFE_PUBLIC_ERRORS = [
  /^Unsupported image format\./,
  /^The uploaded image is empty\./,
  /^The image exceeds \d+ MB limit\./,
  /^The file content does not match its image format\./,
  /^The request must use multipart\/form-data\./,
  /^Invalid Content-Length header\./,
];

export function publicError(error: unknown, fallback = "The request could not be completed."): string {
  const raw = error instanceof Error ? error.message : String(error);
  return SAFE_PUBLIC_ERRORS.some((pattern) => pattern.test(raw)) ? raw.slice(0, 300) : fallback;
}
