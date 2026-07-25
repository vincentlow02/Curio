import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env";

export function hasDemoAccess(request: Request): boolean {
  if (!env.demoAccessCode) return process.env.NODE_ENV !== "production";
  const supplied = request.headers.get("x-demo-code") ?? "";
  const expected = Buffer.from(env.demoAccessCode);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
