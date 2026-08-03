import "server-only";
import { createHash } from "node:crypto";
import { env } from "../config/env";

type Bucket = { count: number; resetsAt: number };

export type DemoRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const clientBuckets = new Map<string, Bucket>();
let globalBucket: Bucket | null = null;

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("cf-connecting-ip")?.trim()
    || forwarded
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
  return createHash("sha256").update(address).digest("hex");
}

function currentBucket(bucket: Bucket | undefined | null, now: number, windowMs: number): Bucket {
  return !bucket || bucket.resetsAt <= now ? { count: 0, resetsAt: now + windowMs } : bucket;
}

export function checkDemoRateLimit(request: Request, now = Date.now()): DemoRateLimitResult {
  const clientWindowMs = env.demoRateLimitWindowMinutes * 60_000;
  const dailyWindowMs = 24 * 60 * 60_000;
  const key = clientKey(request);
  const client = currentBucket(clientBuckets.get(key), now, clientWindowMs);
  const global = currentBucket(globalBucket, now, dailyWindowMs);

  const clientBlocked = client.count >= env.demoRateLimitMaxRequests;
  const globalBlocked = global.count >= env.demoGlobalDailyLimit;
  if (clientBlocked || globalBlocked) {
    const retryAt = Math.max(
      clientBlocked ? client.resetsAt : now,
      globalBlocked ? global.resetsAt : now,
    );
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)) };
  }

  client.count += 1;
  global.count += 1;
  clientBuckets.set(key, client);
  globalBucket = global;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetDemoRateLimitForTests(): void {
  clientBuckets.clear();
  globalBucket = null;
}
