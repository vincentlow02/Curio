import { readFile } from "node:fs/promises";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import type { PriceReferenceResult } from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validators = new Map<string, ValidateFunction>();
const FORBIDDEN_INVENTORY = /当前有货|现货|库存充足|一定可以买到|已确认有该商品|available now|in stock/i;

function format(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ");
}

export async function validateSchema<T>(value: unknown, path: string, label: string): Promise<T> {
  let validator = validators.get(path);
  if (!validator) {
    validator = ajv.compile(JSON.parse(await readFile(path, "utf8")) as object);
    validators.set(path, validator);
  }
  if (!validator(value)) throw new Error(`${label} failed JSON Schema validation: ${format(validator.errors)}`);
  return value as T;
}

export function assertSafeResult(result: PriceReferenceResult): void {
  if (FORBIDDEN_INVENTORY.test(JSON.stringify(result))) throw new Error("The result contains a prohibited real-time inventory claim.");
  if (result.samples.some((sample) => !/^https:\/\//.test(sample.url))) throw new Error("Every price-sample URL must use HTTPS.");
  if (new Set(result.samples.map((sample) => `${sample.source}|${sample.title}|${sample.price}`)).size !== result.samples.length) throw new Error("The price samples contain duplicate listings.");
  if (result.observedRange.sampleCount !== result.samples.length) throw new Error("observedRange.sampleCount does not match the samples array.");
  if (result.referenceRange.sampleCount !== result.samples.filter((sample) => sample.includedInReferenceRange).length) throw new Error("referenceRange.sampleCount does not match the included aggregation samples.");
  for (const area of result.recommendedAreas) {
    if (!/^https:\/\/www\.google\.com\/maps\/search\//.test(area.storeSearchUrl)) throw new Error("A store-search link must be a Google Maps search URL.");
    if (area.verifiedStores.some((store) => !/^https:\/\//.test(store.sourceUrl))) throw new Error("Every verified store must retain an HTTPS source URL.");
  }
}
