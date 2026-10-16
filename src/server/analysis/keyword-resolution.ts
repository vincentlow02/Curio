import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { ToolActivity } from "../../core/analysis/types";
import { buildPokemonCardSearchKeyword } from "../../core/profile/pokemon-card";
import { assertConfirmedIdentity, assertDetectionResult, normalizeProductType, UNKNOWN_PRODUCT_TYPE, type ConfirmedIdentity, type DetectionResult } from "../../core/profile/types";
import { generatePriceSearchKeyword } from "../providers/qwen/detect";
import { buildMarketplaceKeyword } from "../providers/marketplaces/shared/keyword";
import { env } from "../config/env";

const SNAPSHOT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const KEYWORD_CACHE_MS = 10 * 60 * 1000;
type GeneratedKeyword = Awaited<ReturnType<typeof generatePriceSearchKeyword>> & { durationMs: number };
const keywordCache = new Map<string, { expiresAt: number; promise: Promise<GeneratedKeyword> }>();

type RecognitionSnapshot = {
  version: 1;
  runId: string;
  issuedAt: number;
  expiresAt: number;
  original: DetectionResult;
  qwenActivity: ToolActivity | null;
};

export class RecognitionSnapshotError extends Error {
  constructor(message: string, readonly status: 400 | 410 | 503) { super(message); }
}

function snapshotSecret(): string {
  const secret = env.recognitionSnapshotSecret;
  if (!secret) throw new RecognitionSnapshotError("Recognition snapshot signing is not configured.", 503);
  if ([...secret].length < 32) throw new RecognitionSnapshotError("Recognition snapshot signing requires a strong secret.", 503);
  // A dedicated secret takes priority. When absent, the existing high-entropy Qwen key is
  // domain-separated for this short-lived token; rotating that key invalidates old snapshots.
  return secret;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", snapshotSecret()).update("curio-recognition-snapshot-v1:").update(payload).digest();
}

export function createRecognitionSnapshot(runId: string, original: DetectionResult, qwenActivity: ToolActivity | null, now = Date.now()): string {
  assertDetectionResult(original);
  const payload: RecognitionSnapshot = { version: 1, runId, issuedAt: now, expiresAt: now + SNAPSHOT_LIFETIME_MS, original, qwenActivity };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded).toString("base64url")}`;
}

export function verifyRecognitionSnapshot(token: unknown, runId: string, now = Date.now()): RecognitionSnapshot {
  if (typeof token !== "string" || token.length > 16_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new RecognitionSnapshotError("A valid original recognition snapshot is required. Start a new recognition if this is an older saved analysis.", 400);
  }
  const [encoded, mac] = token.split(".") as [string, string];
  const received = Buffer.from(mac, "base64url");
  const expected = signature(encoded);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new RecognitionSnapshotError("The recognition snapshot is invalid.", 400);
  }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new RecognitionSnapshotError("The recognition snapshot is invalid.", 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new RecognitionSnapshotError("The recognition snapshot is invalid.", 400);
  const value = payload as Record<string, unknown>;
  if (value.version !== 1 || value.runId !== runId || typeof value.issuedAt !== "number" || typeof value.expiresAt !== "number"
    || !Number.isFinite(value.issuedAt) || !Number.isFinite(value.expiresAt)
    || value.issuedAt > now + 60_000 || value.expiresAt !== value.issuedAt + SNAPSHOT_LIFETIME_MS) {
    throw new RecognitionSnapshotError("The recognition snapshot is invalid.", 400);
  }
  if (value.expiresAt <= now) throw new RecognitionSnapshotError("The recognition snapshot expired. Start a new recognition.", 410);
  try { assertDetectionResult(value.original); }
  catch { throw new RecognitionSnapshotError("The recognition snapshot is invalid.", 400); }
  const activity = value.qwenActivity;
  if (activity !== null && (!activity || typeof activity !== "object" || (activity as ToolActivity).provider !== "Qwen")) {
    throw new RecognitionSnapshotError("The recognition snapshot is invalid.", 400);
  }
  return value as RecognitionSnapshot;
}

function identityKey(identity: ConfirmedIdentity): string {
  const normalize = (value: string): string => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
  const card = identity.pokemonCard;
  return JSON.stringify({
    itemName: normalize(identity.itemName), version: normalize(identity.version),
    productType: normalize(normalizeProductType(identity.productType ?? UNKNOWN_PRODUCT_TYPE)),
    category: identity.category,
    pokemonCard: card ? {
      cardName: normalize(card.cardName), cardNumber: normalize(card.cardNumber), setCode: normalize(card.setCode),
      setName: normalize(card.setName), rarity: normalize(card.rarity), language: card.language,
      edition: normalize(card.edition), gradingCompany: card.gradingCompany, grade: normalize(card.grade),
    } : null,
  });
}

function resolvedKeyword(keyword: string): string {
  const normalized = keyword.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const meaningful = buildMarketplaceKeyword(normalized).replace(/(?:中古|価格|店舗|専門店)/gu, " ").trim();
  if (!meaningful || /^unknown$/i.test(normalized) || [...normalized].length > 120 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error("A reliable marketplace search keyword is unavailable.");
  }
  return normalized;
}

export async function resolveResearchKeyword(args: {
  snapshot: RecognitionSnapshot;
  confirmed: unknown;
  generate?: typeof generatePriceSearchKeyword;
}): Promise<{ identification: DetectionResult; qwenActivity: ToolActivity | null; generated: boolean; cacheHit: boolean }> {
  assertConfirmedIdentity(args.confirmed);
  const confirmed = args.confirmed;
  const originalActivity = args.snapshot.qwenActivity;
  if (identityKey(confirmed) === identityKey(args.snapshot.original)) {
    return { identification: { ...confirmed, priceSearchKeywordJa: resolvedKeyword(args.snapshot.original.priceSearchKeywordJa) }, qwenActivity: originalActivity, generated: false, cacheHit: false };
  }

  // The existing exact-card builder is deterministic and avoids a paid text call.
  const originalCard = args.snapshot.original.pokemonCard;
  const onlyCardIdentityChanged = Boolean(originalCard && confirmed.pokemonCard
    && identityKey({ ...confirmed, pokemonCard: originalCard }) === identityKey(args.snapshot.original));
  if (onlyCardIdentityChanged && confirmed.pokemonCard && confirmed.pokemonCard.cardNumber.trim().toLowerCase() !== "unknown") {
    return { identification: { ...confirmed, priceSearchKeywordJa: resolvedKeyword(buildPokemonCardSearchKeyword(confirmed.pokemonCard)) }, qwenActivity: originalActivity, generated: false, cacheHit: false };
  }

  if (env.fixtureMode && !args.generate) throw new Error("Keyword regeneration is unavailable in fixture mode. Use an unchanged fixture identity.");

  const key = createHash("sha256").update(args.snapshot.runId).update(identityKey(confirmed)).update(env.qwenKeywordModel).digest("hex");
  const now = Date.now();
  for (const [entryKey, entry] of keywordCache) if (entry.expiresAt <= now) keywordCache.delete(entryKey);
  const existing = keywordCache.get(key);
  const generate = args.generate ?? generatePriceSearchKeyword;
  const entry = existing ?? {
    expiresAt: now + KEYWORD_CACHE_MS,
    promise: (async (): Promise<GeneratedKeyword> => {
      const startedAt = Date.now();
      const result = await generate(confirmed);
      return { ...result, durationMs: Math.max(0, Date.now() - startedAt) };
    })(),
  };
  if (!existing) {
    keywordCache.set(key, entry);
    if (keywordCache.size > 128) keywordCache.delete(keywordCache.keys().next().value!);
  }
  let result: GeneratedKeyword;
  try { result = await entry.promise; }
  catch (error) { if (keywordCache.get(key) === entry) keywordCache.delete(key); throw error; }
  let keyword: string;
  try { keyword = resolvedKeyword(result.keyword); }
  catch (error) {
    if (keywordCache.get(key) === entry) keywordCache.delete(key);
    throw error;
  }
  const generated = !existing;
  const qwenActivity: ToolActivity = {
    provider: "Qwen", status: "succeeded", calls: (originalActivity?.calls ?? 0) + 1,
    durationMs: (originalActivity?.durationMs ?? 0) + result.durationMs,
    model: [originalActivity?.model, result.model].filter(Boolean).join(" + "),
    inputTokens: (originalActivity?.inputTokens ?? 0) + result.inputTokens,
    outputTokens: (originalActivity?.outputTokens ?? 0) + result.outputTokens,
  };
  return { identification: { ...confirmed, priceSearchKeywordJa: keyword }, qwenActivity, generated, cacheHit: Boolean(existing) };
}
