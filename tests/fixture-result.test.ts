import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { fixtureResult } from "../src/server/analysis/fixture-result";

describe("web fixture result", () => {
  it("passes the JSON schema and has zero external cost", async () => {
    const ajv = new Ajv2020({ strict: false });
    const detection = JSON.parse(await readFile(resolve("schemas/detection-result.schema.json"), "utf8"));
    const resultSchema = JSON.parse(await readFile(resolve("schemas/analysis-result.schema.json"), "utf8"));
    ajv.addSchema(detection, "detection-result.schema.json");
    const validate = ajv.compile(resultSchema);
    const result = fixtureResult();
    expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
    expect(result.cost).toEqual({ qwenCalls: 0, inputTokens: 0, outputTokens: 0, marketplacePages: 0, auctionPages: 0, tavilyCalls: 0, daytonaCalls: 0, totalMs: 0 });
    expect(result.storeSuggestions).toEqual([]);
    expect(result.identification.itemName).toMatch(/[ぁ-んァ-ヶ]/);
    expect(result.identification.priceSearchKeywordJa).toMatch(/[ぁ-んァ-ヶ一-龠]/);
    expect(result.warnings.join(" ")).not.toMatch(/[\u4e00-\u9fff]/);
    expect(result.recommendedAreas.map((area) => `${area.area} ${area.reason}`).join(" ")).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("keeps collector auction signals separate from the marketplace range", async () => {
    const ajv = new Ajv2020({ strict: false });
    ajv.addSchema(JSON.parse(await readFile(resolve("schemas/detection-result.schema.json"), "utf8")), "detection-result.schema.json");
    const validate = ajv.compile(JSON.parse(await readFile(resolve("schemas/analysis-result.schema.json"), "utf8")));
    const result = fixtureResult({ collectorMode: true });
    expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
    expect(result.collectorEvidence?.visibleIdentifiers).toContain("PSP-3000");
    expect(result.auctionSources.map((source) => source.source)).toEqual(["Yahoo Auctions", "Mandarake Auction"]);
    expect(result.auctionSources.flatMap((source) => source.signals).map((signal) => signal.currentPrice)).toEqual([7200, 9000]);
    expect(result.priceReference).toMatchObject({ low: 8000, median: 12000, high: 16000, sampleCount: 3 });
    expect(result.priceReference.samples.every((sample) => !["Yahoo Auctions", "Mandarake Auction"].includes(sample.source))).toBe(true);
    expect(result.cost.auctionPages).toBe(0);
  });
});
