import { describe, expect, it } from "vitest";

import { formatHybridCounts, formatOverfilter, formatRerankSummary, formatSuperSortSummary } from "./utils";

describe("rag/utils", () => {
  it("formats rerank summaries with author-facing labels", () => {
    const summary = formatRerankSummary({
      enabled: true,
      applied: true,
      requested_method: "auto",
      method: "external_rerank_api",
      provider: "external_rerank_api",
      model: "rerank-v1",
      top_k: 8,
      hybrid_alpha: 0.3,
      hybrid_applied: true,
      reason: "status_only",
      error_type: null,
      before: ["a", "b", "c"],
      after: ["b", "a", "c"],
      timing_ms: 42,
      errors: [],
    });

    expect(summary).toContain("已启用");
    expect(summary).toContain("实际方式:外部排序接口");
    expect(summary).toContain("服务:外部排序接口");
    expect(summary).toContain("耗时:42ms");
  });

  it("formats hybrid count summaries with readable labels", () => {
    expect(formatHybridCounts({ vector: 4, fts: 2, union: 5 })).toBe("向量 4 | 关键词 2 | 合并后 5");
  });

  it("formats overfilter summaries with author-facing labels", () => {
    expect(formatOverfilter({ enabled: true, actions: ["raise_vector"], used_sources: ["chapter"], vector_k: 20 })).toBe(
      "已启用 | 动作:raise vector | 实际来源:正文草稿 | 向量候选:20",
    );
  });

  it("formats super sort summaries with readable labels", () => {
    expect(
      formatSuperSortSummary({
        enabled: true,
        applied: false,
        reason: "disabled",
        source_order_effective: ["worldbook", "chapter"],
        by_source: { worldbook: 2, chapter: 1 },
      }),
    ).toBe("已启用 | 本次未应用 | 原因:已关闭 | 来源顺序:世界书、正文草稿 | 各来源命中:世界书 2 | 正文草稿 1");
  });
});
