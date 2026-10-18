import { describe, expect, it } from "vitest";
import { pickLanguage } from "../../src/core/content/language";

const supported = ["en", "zh-CN"];

describe("pickLanguage", () => {
  it("prefers an exact match, case-insensitively", () => {
    expect(pickLanguage(supported, ["zh-cn", "en"])).toBe("zh-CN");
  });

  it("falls back to the same base language", () => {
    expect(pickLanguage(supported, ["zh-TW"])).toBe("zh-CN");
    expect(pickLanguage(supported, ["en-GB"])).toBe("en");
  });

  it("walks the preference list in order", () => {
    expect(pickLanguage(supported, ["fr", "de", "zh"])).toBe("zh-CN");
  });

  it("uses the first supported language when nothing matches", () => {
    expect(pickLanguage(supported, ["fr"])).toBe("en");
    expect(pickLanguage(supported, [])).toBe("en");
  });

  it("refuses an empty supported list", () => {
    expect(() => pickLanguage([], ["en"])).toThrow();
  });
});
