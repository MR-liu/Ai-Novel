import { describe, expect, it } from "vitest";

import {
  formatEmbeddingSummary,
  formatIndexStateLabel,
  formatRagBackendLabel,
  formatRagDisabledReason,
  formatVectorContentSourceLabel,
  formatRerankMethodLabel,
  formatRerankSummary,
  formatVectorDisabledReason,
  formatVectorProviderLabel,
  formatVectorSourceLabel,
} from "./vectorRagCopy";

describe("vectorRagCopy", () => {
  it("humanizes provider, source and disabled reason labels", () => {
    expect(formatVectorProviderLabel("sentence_transformers")).toBe("本地向量模型");
    expect(formatVectorSourceLabel("mixed")).toBe("项目覆盖 + 系统默认");
    expect(formatVectorContentSourceLabel("worldbook")).toBe("世界书");
    expect(formatVectorDisabledReason("embedding_api_key_missing")).toBe("缺少访问密钥");
    expect(formatRagDisabledReason("index_not_built")).toBe("索引尚未构建");
  });

  it("summarizes embedding state with author-facing language", () => {
    const summary = formatEmbeddingSummary({
      vector_embedding_effective_provider: "azure_openai",
      vector_embedding_effective_disabled_reason: "embedding_model_missing",
      vector_embedding_effective_source: "project",
    });

    expect(summary).toBe("由Azure OpenAI负责资料召回；状态：缺少模型名；配置来源：项目覆盖。");
  });

  it("summarizes rerank state with author-facing language", () => {
    const summary = formatRerankSummary({
      vector_rerank_effective_enabled: true,
      vector_rerank_effective_method: "rapidfuzz_token_set_ratio",
      vector_rerank_effective_provider: "external_rerank_api",
      vector_rerank_effective_top_k: 12,
      vector_rerank_effective_source: "env",
    });

    expect(summary).toBe("已启用；方式：词集相似度；服务：外部排序接口；候选数：12；配置来源：系统默认。");
  });

  it("keeps unknown methods readable", () => {
    expect(formatRerankMethodLabel("custom_ranker")).toBe("custom_ranker");
  });

  it("formats backend and index state labels for research pages", () => {
    expect(formatRagBackendLabel("pgvector")).toBe("PostgreSQL 向量库（pgvector）");
    expect(formatIndexStateLabel(true)).toBe("需要更新");
    expect(formatIndexStateLabel(false)).toBe("已是最新");
  });
});
