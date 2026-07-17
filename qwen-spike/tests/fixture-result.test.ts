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
    expect(result.cost).toEqual({ qwenCalls: 0, inputTokens: 0, outputTokens: 0, marketplacePages: 0, tavilyCalls: 0, daytonaCalls: 0, totalMs: 0 });
    expect(result.storeSuggestions).toEqual([]);
  });
});
