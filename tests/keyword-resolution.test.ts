import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmedIdentity, DetectionResult, PokemonCardIdentity } from "../src/core/profile/types";
import { toPriceItemProfile } from "../src/core/profile/to-price-profile";
import { buildMarketplaceKeywordForProfile } from "../src/server/providers/marketplaces/shared/keyword";
import { createRecognitionSnapshot, resolveResearchKeyword, verifyRecognitionSnapshot } from "../src/server/analysis/keyword-resolution";

const original: DetectionResult = {
  itemName: "ソニー PSP-3000", version: "PSP-3000", productType: "携帯ゲーム機本体",
  category: "Cards & Game Collectibles", priceSearchKeywordJa: "PSP-3000 本体 中古",
};
const initialQwen = { provider: "Qwen" as const, status: "succeeded" as const, calls: 1, durationMs: 100, model: "vision-model", inputTokens: 100, outputTokens: 20 };

function snapshot(runId = randomUUID()) {
  const token = createRecognitionSnapshot(runId, original, initialQwen);
  return verifyRecognitionSnapshot(token, runId);
}

function confirmed(overrides: Partial<ConfirmedIdentity> = {}): ConfirmedIdentity {
  return { itemName: original.itemName, version: original.version, productType: original.productType,
    category: original.category, ...overrides };
}

beforeEach(() => vi.stubEnv("RECOGNITION_SNAPSHOT_SECRET", "test-recognition-snapshot-secret-with-high-entropy"));
afterEach(() => vi.unstubAllEnvs());

describe("server-owned research keyword resolution", () => {
  it("reuses the original Qwen keyword when unchanged or edited back to the same identity", async () => {
    const base = snapshot();
    const generate = vi.fn(async () => ({ keyword: "PSP-2000 本体 中古", model: "keyword-model", inputTokens: 40, outputTokens: 8 }));
    const edited = await resolveResearchKeyword({ snapshot: base, confirmed: confirmed({ version: "PSP-2000" }), generate });
    expect(edited.identification.priceSearchKeywordJa).toBe("PSP-2000 本体 中古");
    const restored = await resolveResearchKeyword({ snapshot: base, confirmed: confirmed({ itemName: "ソニー　PSP-3000 " }), generate });
    expect(restored).toMatchObject({ identification: { priceSearchKeywordJa: original.priceSearchKeywordJa }, generated: false });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("regenerates on name, type and category changes without overwriting the confirmed identity", async () => {
    for (const overrides of [
      { itemName: "ソニー PSP-2000" },
      { productType: "ゲームソフト" },
      { category: "Toys & Character Collectibles" as const },
    ]) {
      const generate = vi.fn(async () => ({ keyword: "PSP-2000 ソニー 中古", model: "keyword-model", inputTokens: 40, outputTokens: 8 }));
      const final = confirmed(overrides);
      const result = await resolveResearchKeyword({ snapshot: snapshot(), confirmed: final, generate });
      expect(result.identification).toMatchObject(final);
      expect(result.identification.priceSearchKeywordJa).toBe("PSP-2000 ソニー 中古");
      expect(generate).toHaveBeenCalledOnce();
      expect(buildMarketplaceKeywordForProfile(toPriceItemProfile(result.identification))).toBe("PSP-2000 ソニー 中古");
      expect(result.qwenActivity).toMatchObject({ calls: 2, inputTokens: 140, outputTokens: 28 });
    }
  });

  it("resolves edited Pokémon card fields with the existing deterministic card keyword", async () => {
    const card: PokemonCardIdentity = {
      cardName: "リザードンex", cardNumber: "201/165", setCode: "SV2a", setName: "151", rarity: "SAR",
      language: "Japanese", edition: "unknown", gradingCompany: "ungraded", grade: "unknown",
    };
    const originalCard: DetectionResult = { ...original, itemName: "リザードンex 201/165", productType: "トレーディングカード", pokemonCard: card };
    const runId = randomUUID();
    const signed = verifyRecognitionSnapshot(createRecognitionSnapshot(runId, originalCard, initialQwen), runId);
    const generate = vi.fn(async () => ({ keyword: "unused", model: "keyword-model", inputTokens: 1, outputTokens: 1 }));
    const result = await resolveResearchKeyword({ snapshot: signed, confirmed: {
      itemName: originalCard.itemName, version: originalCard.version, category: originalCard.category,
      productType: originalCard.productType, pokemonCard: { ...card, cardNumber: "202/165" },
    }, generate });
    expect(result.identification.priceSearchKeywordJa).toContain("202/165");
    expect(result.identification.priceSearchKeywordJa).not.toContain("201/165");
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects tampered, mismatched and expired signed snapshots", () => {
    const runId = randomUUID();
    const token = createRecognitionSnapshot(runId, original, initialQwen);
    const [payload, mac] = token.split(".") as [string, string];
    expect(() => verifyRecognitionSnapshot(`${payload}.${mac[0] === "A" ? "B" : "A"}${mac.slice(1)}`, runId)).toThrow("invalid");
    expect(() => verifyRecognitionSnapshot(token, randomUUID())).toThrow("invalid");
    const old = createRecognitionSnapshot(runId, original, initialQwen, Date.now() - 25 * 60 * 60 * 1000);
    expect(() => verifyRecognitionSnapshot(old, runId)).toThrow("expired");
  });

  it("coalesces repeated text generation in one process and retries after failure", async () => {
    const signed = snapshot();
    const final = confirmed({ itemName: "ソニー PSP-2000" });
    let finish!: (value: { keyword: string; model: string; inputTokens: number; outputTokens: number }) => void;
    const generate = vi.fn(() => new Promise<{ keyword: string; model: string; inputTokens: number; outputTokens: number }>((resolve) => { finish = resolve; }));
    const first = resolveResearchKeyword({ snapshot: signed, confirmed: final, generate });
    const second = resolveResearchKeyword({ snapshot: signed, confirmed: final, generate });
    expect(generate).toHaveBeenCalledOnce();
    finish({ keyword: "PSP-2000 本体 中古", model: "keyword-model", inputTokens: 40, outputTokens: 8 });
    const [a, b] = await Promise.all([first, second]);
    expect(a.identification.priceSearchKeywordJa).toBe(b.identification.priceSearchKeywordJa);
    expect([a.generated, b.generated]).toEqual([true, false]);
    expect(a.qwenActivity).toMatchObject({ calls: 2, inputTokens: 140, outputTokens: 28 });
    expect(b.qwenActivity).toEqual(a.qwenActivity);

    const failedIdentity = confirmed({ itemName: "ソニー PSP-1000" });
    const bad = vi.fn().mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValueOnce({ keyword: "PSP-1000 本体 中古", model: "keyword-model", inputTokens: 40, outputTokens: 8 });
    await expect(resolveResearchKeyword({ snapshot: signed, confirmed: failedIdentity, generate: bad })).rejects.toThrow("temporary failure");
    expect((await resolveResearchKeyword({ snapshot: signed, confirmed: failedIdentity, generate: bad })).identification.priceSearchKeywordJa).toContain("PSP-1000");
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
