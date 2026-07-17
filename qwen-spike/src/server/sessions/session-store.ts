import "server-only";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AnalysisResult, AnalysisSessionView, AnalysisStage } from "../../core/analysis/types";
import { env } from "../config/env";

type InternalSession = AnalysisSessionView & { imagePath: string; mimeType: string };
const ROOT = resolve(process.cwd(), ".tmp", "sessions");
const globalSessions = globalThis as typeof globalThis & { __analysisSessions?: Map<string, InternalSession> };
const sessions = globalSessions.__analysisSessions ??= new Map();

async function persist(session: InternalSession): Promise<void> {
  const directory = resolve(ROOT, session.id);
  await mkdir(directory, { recursive: true });
  const { imagePath: _imagePath, mimeType: _mimeType, ...safe } = session;
  await writeFile(resolve(directory, "session.json"), `${JSON.stringify(safe, null, 2)}\n`, "utf8");
  if (session.result) await writeFile(resolve(directory, "result.json"), `${JSON.stringify(session.result, null, 2)}\n`, "utf8");
}

export async function createSession(id: string, imagePath: string, mimeType: string): Promise<InternalSession> {
  const now = new Date().toISOString();
  const session: InternalSession = { id, status: "queued", queuePosition: null, progress: 4, message: "等待分析", createdAt: now, updatedAt: now, result: null, error: null, imagePath, mimeType };
  sessions.set(id, session);
  await persist(session);
  return session;
}

export function internalSession(id: string): InternalSession | null { return sessions.get(id) ?? null; }

export async function updateSession(id: string, patch: Partial<Pick<InternalSession, "queuePosition" | "progress" | "message" | "result" | "error">> & { status?: AnalysisStage }): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  if (["completed", "failed", "needs_review"].includes(session.status) && patch.status && patch.status !== session.status) return;
  Object.assign(session, patch, { updatedAt: new Date().toISOString() });
  await persist(session);
}

export async function publicSession(id: string): Promise<AnalysisSessionView | null> {
  const session = sessions.get(id);
  if (session) {
    const { imagePath: _imagePath, mimeType: _mimeType, ...safe } = session;
    return safe;
  }
  try {
    const disk = JSON.parse(await readFile(resolve(ROOT, id, "session.json"), "utf8")) as AnalysisSessionView;
    if (Date.now() - Date.parse(disk.createdAt) > env.sessionTtlMinutes * 60_000) return null;
    return disk;
  } catch { return null; }
}

export async function deleteImage(id: string): Promise<void> {
  const session = sessions.get(id);
  if (session?.imagePath) await rm(session.imagePath, { force: true });
}

export async function cleanupExpiredSessions(now = Date.now()): Promise<void> {
  for (const [id, session] of sessions) {
    if (now - Date.parse(session.createdAt) > env.sessionTtlMinutes * 60_000) {
      sessions.delete(id);
      await rm(resolve(ROOT, id), { recursive: true, force: true });
    }
  }
  try {
    for (const entry of await readdir(ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory() || sessions.has(entry.name)) continue;
      const directory = resolve(ROOT, entry.name);
      try {
        const info = await stat(resolve(directory, "session.json"));
        if (now - info.mtimeMs > env.sessionTtlMinutes * 60_000) await rm(directory, { recursive: true, force: true });
      } catch { await rm(directory, { recursive: true, force: true }); }
    }
  } catch { /* Root does not exist yet. */ }
}

export function sessionRoot(id: string): string { return resolve(ROOT, id); }
export async function saveCost(id: string, cost: AnalysisResult["cost"]): Promise<void> {
  await writeFile(resolve(ROOT, id, "cost.json"), `${JSON.stringify(cost, null, 2)}\n`, "utf8");
}
