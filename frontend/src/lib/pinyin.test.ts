import { describe, expect, it } from "vitest";

import {
  containsPinyinMatch,
  hasChineseText,
  preloadPinyinSupport,
  shouldPreloadPinyinSupport,
} from "./pinyin";

describe("pinyin helpers", () => {
  it("detects whether pinyin preload is worth doing", () => {
    expect(shouldPreloadPinyinSupport(["zx"], ["主线设定", "世界书"])).toBe(true);
    expect(shouldPreloadPinyinSupport(["dragon"], ["worldbook", "notes"])).toBe(false);
    expect(shouldPreloadPinyinSupport(["设定"], ["主线设定"])).toBe(false);
    expect(hasChineseText("主线设定")).toBe(true);
    expect(hasChineseText("worldbook")).toBe(false);
  });

  it("matches pinyin after dynamic preload", async () => {
    await preloadPinyinSupport();
    expect(containsPinyinMatch("主线设定", "zhuxian").matched).toBe(true);
    expect(containsPinyinMatch("主线设定", "zx").matched).toBe(true);
  });
});
