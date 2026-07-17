import "server-only";
import { env } from "../config/env";

type Bucket = { timestamps: number[] };
const globalRate = globalThis as typeof globalThis & { __analysisRate?: Map<string, Bucket> };
const buckets = globalRate.__analysisRate ??= new Map();

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function consumeRateLimit(ip: string, now = Date.now()): boolean {
  const cutoff = now - 60 * 60 * 1000;
  const current = buckets.get(ip)?.timestamps.filter((time) => time > cutoff) ?? [];
  if (current.length >= env.maxAnalysesPerIp) return false;
  current.push(now);
  buckets.set(ip, { timestamps: current });
  return true;
}

export function resetRateLimitsForTests(): void { buckets.clear(); }
