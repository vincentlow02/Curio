import { describe, expect, it } from "vitest";
import { isSpecificDescription } from "../src/core/profile/input-routing";

describe("text input routing", () => {
  it("rejects empty and vague descriptions before Qwen is called", () => {
    for (const value of ["", "toy", "figure", "game", "card", "record", "这个", "不知道"]) {
      expect(isSpecificDescription(value), value).toBe(false);
    }
  });

  it("accepts concrete names, models and descriptive phrases", () => {
    for (const value of ["Sony PSP-3000", "Pokemon Charizard card", "Beatles Abbey Road LP", "鉄腕アトム ソフビ"]) {
      expect(isSpecificDescription(value), value).toBe(true);
    }
  });
});
