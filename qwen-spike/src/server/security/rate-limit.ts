import "server-only";
import { isIP } from "node:net";
import { env } from "../config/env";

type Bucket = { timestamps: number[] };
const globalRate = globalThis as typeof globalThis & { __analysisRate?: Map<string, Bucket> };
const buckets = globalRate.__analysisRate ??= new Map();

function validIp(value: string | null): string | null {
  const candidate = value?.trim() ?? "";
  return isIP(candidate) ? candidate : null;
}

export function clientIp(request: Request, production = process.env.NODE_ENV === "production"): string {
  const railwayIp = validIp(request.headers.get("x-real-ip"));
  if (railwayIp) return railwayIp;
  if (production) return "unknown";
  return validIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? null) ?? "unknown";
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
