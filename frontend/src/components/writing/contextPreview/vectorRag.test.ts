import { describe, expect, it } from "vitest";

import {
  formatOverfilter,
  formatRerankSummary,
  formatVectorCandidateLabel,
  formatVectorCountsSummary,
  formatVectorHybridSummary,
  formatVectorQueryStatusSummary,
  formatVectorSourceSummary,
  formatVectorTimingSummary,
} from "./vectorRag";

describe("writing/contextPreview/vectorRag", () => {
  it("formats source summary with author-facing labels", () => {
    expect(formatVectorSourceSummary(["worldbook", "chapter"])).toBe("本次会优先检查：世界书、正文草稿");
  });

  it("formats rerank summary with runtime details", () => {
    const summary = formatRerankSummary({
      enabled: true,
      applied: true,
      requested_method: "auto",
      method: "external_rerank_api",
      provider: "external_rerank_api",
      model: "rerank-v1",
      top_k: 6,
      hybrid_alpha: 0.25,
      hybrid_applied: true,
      reason: "status_only",
      error_type: null,
      before: ["a", "b", "c"],
      after: ["b", "a", "c"],
      timing_ms: 33,
      errors: [],
    });

    expect(summary).toContain("实际方式:外部排序接口");
    expect(summary).toContain("服务:外部排序接口");
    expect(summary).toContain("模型:rerank-v1");
    expect(summary).toContain("混合权重:0.25");
  });

  it("formats count and timing summaries for quick inspection", () => {
    expect(
      formatVectorCountsSummary({
        counts: {
          candidates_total: 20,
          candidates_returned: 12,
          unique_sources: 3,
          final_selected: 5,
          dropped_total: 7,
          dropped_by_reason: { duplicate_chunk: 3 },
        },
        candidates: [],
        final: { chunks: [], text_md: "", truncated: false },
        dropped: [],
      }),
    ).toContain("主要舍弃原因:duplicate chunk 3");

    expect(formatVectorTimingSummary({ total: 120, rerank: 18 })).toBe("总耗时 120ms | 重排 18ms");
  });

  it("formats hybrid, status and candidate labels with author-facing copy", () => {
    expect(
      formatVectorHybridSummary(
        {
          enabled: true,
          counts: { vector: 4, fts: 2, union: 5 },
          overfilter: { enabled: true, actions: ["relax_sources"], used_sources: ["worldbook"], vector_k: 12 },
        },
        "pgvector",
      ),
    ).toContain("保护动作:放宽资料来源限制");

    expect(
      formatVectorQueryStatusSummary({
        enabled: false,
        disabled_reason: "index_not_built",
        error: "missing index",
        final: { chunks: [], text_md: "", truncated: false },
      }),
    ).toBe("资料召回暂不可用，原因：索引尚未构建；附加信息：missing index");

    expect(formatVectorCandidateLabel("chapter", 2, "冲突升级", "chapter-1")).toBe(
      "正文草稿 | 片段 #2 | 冲突升级 | chapter-1",
    );
    expect(formatOverfilter({ enabled: true, actions: ["expand_candidates"], used_sources: ["chapter"], fts_k: 8 })).toBe(
      "已启用 | 保护动作:扩大候选范围 | 实际来源:正文草稿 | 关键词候选:8",
    );
  });
});
