import type { ProjectSettings } from "../types";

const VECTOR_PROVIDER_LABELS: Record<string, string> = {
  openai_compatible: "通用 OpenAI 接口",
  azure_openai: "Azure OpenAI",
  google: "Google 接口",
  custom: "自定义接口",
  local_proxy: "本地中转服务",
  sentence_transformers: "本地向量模型",
  external_rerank_api: "外部排序接口",
};

const VECTOR_SOURCE_LABELS: Record<string, string> = {
  default: "系统默认",
  env: "系统默认",
  project: "项目覆盖",
  mixed: "项目覆盖 + 系统默认",
  none: "尚未配置",
};

const VECTOR_CONTENT_SOURCE_LABELS: Record<string, string> = {
  worldbook: "世界书",
  worldbook_entry: "世界书",
  outline: "大纲",
  chapter: "正文草稿",
  story_memory: "剧情记忆",
  character: "角色资料",
  source_document: "导入文档",
  import: "导入文档",
  project_table_row: "数值表格",
  memory_entity: "底层实体",
  memory_relation: "人物关系",
  memory_evidence: "证据摘录",
};

const VECTOR_DISABLED_REASON_LABELS: Record<string, string> = {
  embedding_base_url_missing: "缺少服务地址",
  embedding_model_missing: "缺少模型名",
  embedding_api_key_missing: "缺少访问密钥",
  embedding_api_key_decrypt_failed: "已保存的访问密钥无法解密，请重新保存",
  embedding_sentence_transformers_model_missing: "缺少本地模型名",
  dependency_missing: "本地依赖未安装",
  embedding_provider_unsupported: "当前服务来源暂不支持",
  error: "服务检查失败",
  disabled: "已关闭",
  empty: "还没有可检索内容",
  empty_query: "查询内容为空",
  index_not_built: "索引尚未构建",
  vector_disabled: "资料召回服务未启用",
  chroma_unavailable: "本地索引服务暂不可用",
  status_only: "仅状态检查",
};

const RERANK_METHOD_LABELS: Record<string, string> = {
  auto: "自动选择",
  rapidfuzz_token_set_ratio: "词集相似度",
  token_overlap: "关键词重合度",
  external_rerank_api: "外部排序接口",
};

function humanizeFallback(value: string, emptyLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) return emptyLabel;
  return trimmed.replaceAll("_", " ");
}

export function formatVectorProviderLabel(provider: string, emptyLabel = "系统默认") {
  const trimmed = provider.trim();
  if (!trimmed) return emptyLabel;
  return VECTOR_PROVIDER_LABELS[trimmed] ?? trimmed;
}

export function formatVectorSourceLabel(source: string, emptyLabel = "系统默认") {
  const trimmed = source.trim();
  if (!trimmed) return emptyLabel;
  return VECTOR_SOURCE_LABELS[trimmed] ?? humanizeFallback(trimmed, emptyLabel);
}

export function formatVectorContentSourceLabel(source: string, emptyLabel = "未指定") {
  const trimmed = source.trim();
  if (!trimmed) return emptyLabel;
  return VECTOR_CONTENT_SOURCE_LABELS[trimmed] ?? humanizeFallback(trimmed, emptyLabel);
}

export function formatVectorDisabledReason(reason?: string | null) {
  const trimmed = String(reason || "").trim();
  if (!trimmed) return "可用";
  return VECTOR_DISABLED_REASON_LABELS[trimmed] ?? humanizeFallback(trimmed, "可用");
}

export function formatRerankMethodLabel(method: string, emptyLabel = "自动选择") {
  const trimmed = method.trim();
  if (!trimmed) return emptyLabel;
  return RERANK_METHOD_LABELS[trimmed] ?? trimmed;
}

export function formatRagDisabledReason(reason?: string | null) {
  return formatVectorDisabledReason(reason);
}

export function formatRagBackendLabel(backend?: string | null, emptyLabel = "未返回") {
  const trimmed = String(backend || "").trim();
  if (!trimmed) return emptyLabel;
  if (trimmed === "pgvector") return "PostgreSQL 向量库（pgvector）";
  if (trimmed === "chroma") return "Chroma 本地索引（chroma）";
  if (trimmed === "local") return "本地检索服务（local）";
  return trimmed;
}

export function formatIndexStateLabel(dirty: boolean | null | undefined) {
  if (dirty == null) return "正在确认";
  return dirty ? "需要更新" : "已是最新";
}

type EmbeddingSummarySettings = Pick<
  ProjectSettings,
  "vector_embedding_effective_provider" | "vector_embedding_effective_disabled_reason" | "vector_embedding_effective_source"
>;

type RerankSummarySettings = Pick<
  ProjectSettings,
  | "vector_rerank_effective_enabled"
  | "vector_rerank_effective_method"
  | "vector_rerank_effective_provider"
  | "vector_rerank_effective_top_k"
  | "vector_rerank_effective_source"
>;

export function formatEmbeddingSummary(settings: EmbeddingSummarySettings) {
  return `由${formatVectorProviderLabel(settings.vector_embedding_effective_provider)}负责资料召回；状态：${formatVectorDisabledReason(settings.vector_embedding_effective_disabled_reason)}；配置来源：${formatVectorSourceLabel(settings.vector_embedding_effective_source)}。`;
}

export function formatRerankSummary(settings: RerankSummarySettings) {
  return `${settings.vector_rerank_effective_enabled ? "已启用" : "未启用"}；方式：${formatRerankMethodLabel(settings.vector_rerank_effective_method)}；服务：${formatVectorProviderLabel(settings.vector_rerank_effective_provider)}；候选数：${settings.vector_rerank_effective_top_k}；配置来源：${formatVectorSourceLabel(settings.vector_rerank_effective_source)}。`;
}
