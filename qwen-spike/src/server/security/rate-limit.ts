import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { env } from "../config/env";

type UsageStore = Record<string, number>;
const storePath = resolve(process.env.IP_USAGE_STORE_PATH?.trim() || ".data/ip-usage.json");
const globalRate = globalThis as typeof globalThis & { __analysisUsageWrite?: Promise<void> };

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

function ipKey(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

async function readUsage(): Promise<UsageStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, count]) => Number.isInteger(count) && Number(count) >= 0)) as UsageStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function incrementUsage(ip: string): Promise<boolean> {
  const usage = await readUsage();
  const key = ipKey(ip);
  const current = usage[key] ?? 0;
  if (current >= env.maxAnalysesPerIp) return false;
  usage[key] = current + 1;
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(usage), "utf8");
  await rename(temporaryPath, storePath);
  return true;
}

export async function consumeRateLimit(ip: string): Promise<boolean> {
  const previous = globalRate.__analysisUsageWrite ?? Promise.resolve();
  let allowed = false;
  const next = previous.then(async () => { allowed = await incrementUsage(ip); });
  globalRate.__analysisUsageWrite = next.catch(() => undefined);
  await next;
  return allowed;
}

export async function resetRateLimitsForTests(): Promise<void> {
  await (globalRate.__analysisUsageWrite ?? Promise.resolve());
  await unlink(storePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
