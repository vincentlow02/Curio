import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { fixtureResult } from "../src/server/analysis/fixture-result";
import { ResultStage } from "../src/features/analysis/components/result-stage";

function renderResultWithSamples(sampleCount: number): string {
  const result = fixtureResult();
  const samples = result.priceReference.samples.slice(0, sampleCount).map((sample) => ({
    ...sample,
    includedInReferenceRange: true,
  }));
  result.priceReference = {
    ...result.priceReference,
    low: sampleCount ? samples[0]?.price ?? null : null,
    median: sampleCount ? samples[0]?.price ?? null : null,
    high: sampleCount ? samples.at(-1)?.price ?? null : null,
    sampleCount,
    samples,
  };

  return renderToStaticMarkup(createElement(ResultStage, { result, activities: [], locale: "en" }));
}

describe("ResultStage reference price display", () => {
  it("shows one actual listing and a preliminary warning instead of Low/Typical/High", () => {
    const markup = renderResultWithSamples(1);

    expect(markup).toContain("Preliminary reference: only 1 valid comparable listing");
    expect(markup).toContain("Single observed asking price");
    expect(markup).toContain("¥8,000");
    expect(markup).toContain("中古 PSP-3000 本体 ブラック");
    expect(markup).not.toContain(">Low<");
    expect(markup).not.toContain(">Typical<");
    expect(markup).not.toContain(">High<");
  });

  it("warns for two samples but keeps the range, and omits the warning for three", () => {
    const twoSampleMarkup = renderResultWithSamples(2);
    const threeSampleMarkup = renderResultWithSamples(3);

    expect(twoSampleMarkup).toContain("Preliminary reference: only 2 valid comparable listings");
    expect(twoSampleMarkup).toContain(">Low<");
    expect(twoSampleMarkup).toContain(">Typical<");
    expect(twoSampleMarkup).toContain(">High<");
    expect(threeSampleMarkup).not.toContain("Preliminary reference:");
    expect(threeSampleMarkup).toContain(">Low<");
    expect(threeSampleMarkup).toContain(">Typical<");
    expect(threeSampleMarkup).toContain(">High<");
  });
});