import {
  formatRagBackendLabel,
  formatRagDisabledReason,
  formatRerankMethodLabel,
  formatVectorContentSourceLabel,
  formatVectorProviderLabel,
} from "../../../lib/vectorRagCopy";

export type VectorSource = "worldbook" | "outline" | "chapter";

export type VectorCandidate = {
  id: string;
  distance: number;
  text: string;
  metadata: Record<string, unknown>;
};

export type VectorRagCounts = {
  candidates_total: number;
  candidates_returned: number;
  unique_sources: number;
  final_selected: number;
  dropped_total: number;
  dropped_by_reason: Record<string, number>;
};

export type VectorRerankObs = {
  enabled: boolean;
  applied: boolean;
  requested_method: string;
  method: string | null;
  provider: string | null;
  model: string | null;
  top_k: number;
  hybrid_alpha: number | null;
  hybrid_applied?: boolean;
  after_rerank?: string[];
  reason: string | null;
  error_type: string | null;
  before: string[];
  after: string[];
  timing_ms: number;
  errors: Array<Record<string, unknown>>;
};

export type VectorHybridObs = {
  enabled: boolean;
  ranks?: unknown;
  counts?: unknown;
  overfilter?: unknown;
};

export type VectorRagQueryResult = {
  enabled: boolean;
  disabled_reason: string | null;
  query_text: string;
  filters: { project_id: string; sources: VectorSource[] };
  timings_ms: Record<string, number>;
  rerank: VectorRerankObs | null;
  backend: string | null;
  hybrid: VectorHybridObs | null;
  candidates: VectorCandidate[];
  final: { chunks: VectorCandidate[]; text_md: string; truncated: boolean };
  dropped: Array<{ id?: string; reason: string }>;
  counts?: VectorRagCounts;
  prompt_block: { identifier: string; role: string; text_md: string };
  error?: string;
};

function humanizeDebugLabel(value: string, emptyLabel = "未返回") {
  const trimmed = value.trim();
  if (!trimmed) return emptyLabel;
  return trimmed.replaceAll("_", " ");
}

function hasOwn<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return typeof obj === "object" && obj !== null && Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeRerankObs(raw: unknown): VectorRerankObs | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const before = Array.isArray(o.before) ? o.before.map((v) => String(v)) : [];
  const after = Array.isArray(o.after) ? o.after.map((v) => String(v)) : [];
  const afterRerank = Array.isArray(o.after_rerank) ? o.after_rerank.map((v) => String(v)) : undefined;
  const topK = typeof o.top_k === "number" ? o.top_k : Number(o.top_k);
  const timingMs = typeof o.timing_ms === "number" ? o.timing_ms : Number(o.timing_ms);
  const hybridAlpha = typeof o.hybrid_alpha === "number" ? o.hybrid_alpha : Number(o.hybrid_alpha);

  return {
    enabled: Boolean(o.enabled),
    applied: Boolean(o.applied),
    requested_method: typeof o.requested_method === "string" ? o.requested_method : "",
    method: typeof o.method === "string" ? o.method : null,
    provider: typeof o.provider === "string" ? o.provider : null,
    model: typeof o.model === "string" ? o.model : null,
    top_k: Number.isFinite(topK) ? topK : 0,
    hybrid_alpha: Number.isFinite(hybridAlpha) ? hybridAlpha : null,
    hybrid_applied: typeof o.hybrid_applied === "boolean" ? o.hybrid_applied : undefined,
    after_rerank: afterRerank,
    reason: typeof o.reason === "string" ? o.reason : null,
    error_type: typeof o.error_type === "string" ? o.error_type : null,
    before,
    after,
    timing_ms: Number.isFinite(timingMs) ? timingMs : 0,
    errors: Array.isArray(o.errors) ? (o.errors as Array<Record<string, unknown>>) : [],
  };
}

function rerankDelta(obs: VectorRerankObs): {
  compared: number;
  changedPositions: number;
  entered: number;
  left: number;
} {
  const compared = Math.min(obs.top_k || 0, obs.before.length, obs.after.length);
  if (compared <= 0) return { compared: 0, changedPositions: 0, entered: 0, left: 0 };
  let changedPositions = 0;
  for (let i = 0; i < compared; i++) {
    if (obs.before[i] !== obs.after[i]) changedPositions++;
  }
  const beforeSet = new Set(obs.before.slice(0, compared));
  const afterSet = new Set(obs.after.slice(0, compared));
  let entered = 0;
  for (const id of afterSet) {
    if (!beforeSet.has(id)) entered++;
  }
  let left = 0;
  for (const id of beforeSet) {
    if (!afterSet.has(id)) left++;
  }
  return { compared, changedPositions, entered, left };
}

export function formatRerankSummary(obs: VectorRerankObs): string {
  const delta = rerankDelta(obs);
  const comparedText = delta.compared ? `${delta.changedPositions}/${delta.compared}` : "-";
  const methodText = formatRerankMethodLabel(obs.method ?? "", "未返回");
  const reqText = formatRerankMethodLabel(obs.requested_method || "", "未返回");
  const reasonText = formatRagDisabledReason(obs.reason);
  const providerText = obs.provider ? ` | 服务:${formatVectorProviderLabel(obs.provider, obs.provider)}` : "";
  const modelText = obs.model ? ` | 模型:${obs.model}` : "";
  const hybridText = typeof obs.hybrid_alpha === "number" ? ` | 混合权重:${obs.hybrid_alpha}` : "";
  const hybridAppliedText =
    typeof obs.hybrid_applied === "boolean" ? ` | 本次混合:${obs.hybrid_applied ? "已参与" : "未参与"}` : "";
  const errText = obs.error_type ? ` | 错误类型:${obs.error_type}` : "";
  const changesText = delta.compared
    ? ` | 前 ${delta.compared} 条中有 ${comparedText} 处顺序变化 | 新进入:${delta.entered} | 被替换:${delta.left}`
    : "";
  return `${obs.enabled ? "已启用" : "未启用"} | ${obs.applied ? "本次已参与排序" : "本次未参与排序"} | 原因:${reasonText} | 请求方式:${reqText} | 实际方式:${methodText}${providerText}${modelText}${hybridText}${hybridAppliedText} | 候选数:${obs.top_k} | 耗时:${obs.timing_ms}ms${changesText}${errText}`;
}

export function formatHybridCounts(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "-";
  const o = raw as Record<string, unknown>;
  const parts: string[] = [];
  const labels: Record<string, string> = { vector: "向量", fts: "关键词", union: "合并后" };
  for (const key of ["vector", "fts", "union"] as const) {
    const v = o[key];
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) parts.push(`${labels[key]} ${n}`);
  }
  if (parts.length) return parts.join(" | ");
  const fallback = Object.entries(o)
    .map(([k, v]) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? `${humanizeDebugLabel(k, k)} ${n}` : null;
    })
    .filter((v): v is string => Boolean(v));
  return fallback.length ? fallback.join(" | ") : "-";
}

const OVERFILTER_ACTION_LABELS: Record<string, string> = {
  relax_sources: "放宽资料来源限制",
  expand_candidates: "扩大候选范围",
};

export function formatOverfilter(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "-";
  const o = raw as Record<string, unknown>;
  const enabled = Boolean(o.enabled);
  const actions = Array.isArray(o.actions) ? o.actions.map((v) => String(v)).filter((v) => Boolean(v)) : [];
  const usedSources = Array.isArray(o.used_sources)
    ? o.used_sources
        .map((v) => formatVectorContentSourceLabel(String(v), String(v)))
        .filter((v) => Boolean(v))
    : [];
  const vectorK = typeof o.vector_k === "number" ? o.vector_k : Number(o.vector_k);
  const ftsK = typeof o.fts_k === "number" ? o.fts_k : Number(o.fts_k);

  const parts = [enabled ? "已启用" : "未启用"];
  if (actions.length) {
    parts.push(
      `保护动作:${actions
        .map((value) => OVERFILTER_ACTION_LABELS[value] ?? humanizeDebugLabel(value, value))
        .join("、")}`,
    );
  }
  if (usedSources.length) parts.push(`实际来源:${usedSources.join("、")}`);
  if (Number.isFinite(vectorK)) parts.push(`向量候选:${vectorK}`);
  if (Number.isFinite(ftsK)) parts.push(`关键词候选:${ftsK}`);
  return parts.join(" | ");
}

export function formatVectorSourceSummary(sources: VectorSource[]) {
  if (!sources.length) return "本次还没有选择资料来源";
  return `本次会优先检查：${sources.map((source) => formatVectorContentSourceLabel(source, source)).join("、")}`;
}

function formatDroppedReasonSummary(droppedByReason: Record<string, number>) {
  const parts = Object.entries(droppedByReason)
    .map(([reason, count]) => `${humanizeDebugLabel(reason, reason)} ${count}`)
    .slice(0, 3);
  return parts.length ? ` | 主要舍弃原因:${parts.join("、")}` : "";
}

export function formatVectorCountsSummary(result: Pick<VectorRagQueryResult, "counts" | "candidates" | "final" | "dropped">) {
  if (result.counts) {
    return `候选 ${result.counts.candidates_total} 条 | 返回 ${result.counts.candidates_returned} 条 | 覆盖 ${result.counts.unique_sources} 类资料 | 最终入选 ${result.counts.final_selected} 条 | 舍弃 ${result.counts.dropped_total} 条${formatDroppedReasonSummary(result.counts.dropped_by_reason)}`;
  }
  return `候选 ${result.candidates.length} 条 | 最终入选 ${result.final.chunks.length} 条 | 舍弃 ${result.dropped.length} 条`;
}

const TIMING_LABELS: Record<string, string> = {
  total: "总耗时",
  vector: "向量检索",
  fts: "关键词检索",
  rerank: "重排",
  hybrid: "混合召回",
  preprocess: "整理检索语句",
  normalize_query: "整理检索语句",
  query_normalize: "整理检索语句",
  format_prompt: "整理提示词片段",
};

export function formatVectorTimingSummary(timingsMs: Record<string, number>) {
  const entries = Object.entries(timingsMs)
    .filter(([, value]) => Number.isFinite(value))
    .slice(0, 5);
  if (!entries.length) return "耗时明细暂未返回";
  return entries
    .map(([key, value]) => `${TIMING_LABELS[key] ?? humanizeDebugLabel(key, key)} ${value}ms`)
    .join(" | ");
}

export function formatVectorHybridSummary(hybrid: VectorHybridObs | null, backend: string | null) {
  const backendText = formatRagBackendLabel(backend, "未返回检索后端");
  if (!hybrid) return `混合召回信息暂未返回 | 检索后端:${backendText}`;
  return `${hybrid.enabled ? "混合召回已启用" : "混合召回未启用"} | 命中规模:${formatHybridCounts(hybrid.counts)} | 过筛保护:${formatOverfilter(hybrid.overfilter)} | 检索后端:${backendText}`;
}

export function formatVectorQueryStatusSummary(result: Pick<VectorRagQueryResult, "enabled" | "disabled_reason" | "error" | "final">) {
  if (result.enabled) {
    return `资料召回可用，本次带回了 ${result.final.chunks.length} 条可注入的参考片段。`;
  }
  const reasonText = formatRagDisabledReason(result.disabled_reason);
  const errorText = result.error ? `；附加信息：${result.error}` : "";
  return `资料召回暂不可用，原因：${reasonText}${errorText}`;
}

export function formatVectorCandidateLabel(source: string, chunkIndex: number | null, title: string, sourceId: string) {
  const parts = [formatVectorContentSourceLabel(source, "片段")];
  if (chunkIndex != null && Number.isFinite(chunkIndex)) parts.push(`片段 #${chunkIndex}`);
  if (title) parts.push(title);
  if (sourceId) parts.push(sourceId);
  return parts.join(" | ");
}

export function normalizeVectorResult(raw: unknown): VectorRagQueryResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled !== "boolean") return null;
  if (typeof o.query_text !== "string") return null;
  if (!hasOwn(o, "filters") || typeof o.filters !== "object" || o.filters === null) return null;
  if (!hasOwn(o, "final") || typeof o.final !== "object" || o.final === null) return null;
  if (!hasOwn(o, "prompt_block") || typeof o.prompt_block !== "object" || o.prompt_block === null) return null;

  const filters = o.filters as Record<string, unknown>;
  const final = o.final as Record<string, unknown>;
  const promptBlock = o.prompt_block as Record<string, unknown>;

  const sources = Array.isArray(filters.sources)
    ? (filters.sources.filter((v) => v === "worldbook" || v === "outline" || v === "chapter") as VectorSource[])
    : [];

  const candidatesRaw = Array.isArray(o.candidates) ? o.candidates : [];
  const candidates: VectorCandidate[] = candidatesRaw
    .map((c): VectorCandidate | null => {
      if (!c || typeof c !== "object") return null;
      const cc = c as Record<string, unknown>;
      const id = typeof cc.id === "string" ? cc.id : "";
      const distance = typeof cc.distance === "number" ? cc.distance : Number(cc.distance);
      const text = typeof cc.text === "string" ? cc.text : "";
      const metadata =
        typeof cc.metadata === "object" && cc.metadata !== null ? (cc.metadata as Record<string, unknown>) : {};
      if (!id) return null;
      if (!Number.isFinite(distance)) return null;
      return { id, distance, text, metadata };
    })
    .filter((v): v is VectorCandidate => Boolean(v));

  const finalChunksRaw = Array.isArray(final.chunks) ? final.chunks : [];
  const finalChunks: VectorCandidate[] = finalChunksRaw
    .map((c): VectorCandidate | null => {
      if (!c || typeof c !== "object") return null;
      const cc = c as Record<string, unknown>;
      const id = typeof cc.id === "string" ? cc.id : "";
      const distance = typeof cc.distance === "number" ? cc.distance : Number(cc.distance);
      const text = typeof cc.text === "string" ? cc.text : "";
      const metadata =
        typeof cc.metadata === "object" && cc.metadata !== null ? (cc.metadata as Record<string, unknown>) : {};
      if (!id) return null;
      if (!Number.isFinite(distance)) return null;
      return { id, distance, text, metadata };
    })
    .filter((v): v is VectorCandidate => Boolean(v));

  const timings =
    typeof o.timings_ms === "object" && o.timings_ms !== null ? (o.timings_ms as Record<string, unknown>) : {};
  const timingsMs: Record<string, number> = Object.fromEntries(
    Object.entries(timings)
      .map(([k, v]) => [k, typeof v === "number" ? v : Number(v)] as const)
      .filter(([, v]) => Number.isFinite(v)),
  );

  const droppedRaw = Array.isArray(o.dropped) ? o.dropped : [];
  const dropped: Array<{ id?: string; reason: string }> = droppedRaw
    .map((d): { id?: string; reason: string } | null => {
      if (!d || typeof d !== "object") return null;
      const dd = d as Record<string, unknown>;
      const reason = typeof dd.reason === "string" ? dd.reason : "";
      if (!reason) return null;
      const id = typeof dd.id === "string" ? dd.id : undefined;
      return { id, reason };
    })
    .filter((v): v is { id?: string; reason: string } => Boolean(v));

  const countsRaw =
    hasOwn(o, "counts") && typeof o.counts === "object" && o.counts !== null
      ? (o.counts as Record<string, unknown>)
      : null;
  let counts: VectorRagCounts | undefined = undefined;
  if (countsRaw) {
    const candidatesTotal =
      typeof countsRaw.candidates_total === "number" ? countsRaw.candidates_total : Number(countsRaw.candidates_total);
    const candidatesReturned =
      typeof countsRaw.candidates_returned === "number"
        ? countsRaw.candidates_returned
        : Number(countsRaw.candidates_returned);
    const uniqueSources =
      typeof countsRaw.unique_sources === "number" ? countsRaw.unique_sources : Number(countsRaw.unique_sources);
    const finalSelected =
      typeof countsRaw.final_selected === "number" ? countsRaw.final_selected : Number(countsRaw.final_selected);
    const droppedTotal =
      typeof countsRaw.dropped_total === "number" ? countsRaw.dropped_total : Number(countsRaw.dropped_total);

    const droppedByReasonRaw =
      typeof countsRaw.dropped_by_reason === "object" && countsRaw.dropped_by_reason !== null
        ? (countsRaw.dropped_by_reason as Record<string, unknown>)
        : {};
    const droppedByReason: Record<string, number> = Object.fromEntries(
      Object.entries(droppedByReasonRaw)
        .map(([k, v]) => [k, typeof v === "number" ? v : Number(v)] as const)
        .filter(([, v]) => Number.isFinite(v) && v >= 0),
    );

    if (
      Number.isFinite(candidatesTotal) &&
      Number.isFinite(candidatesReturned) &&
      Number.isFinite(uniqueSources) &&
      Number.isFinite(finalSelected) &&
      Number.isFinite(droppedTotal)
    ) {
      counts = {
        candidates_total: candidatesTotal,
        candidates_returned: candidatesReturned,
        unique_sources: uniqueSources,
        final_selected: finalSelected,
        dropped_total: droppedTotal,
        dropped_by_reason: droppedByReason,
      };
    }
  }

  const rerank = hasOwn(o, "rerank") ? normalizeRerankObs(o.rerank) : null;
  const backend = typeof o.backend === "string" ? o.backend : null;

  let hybrid: VectorHybridObs | null = null;
  if (hasOwn(o, "hybrid") && typeof o.hybrid === "object" && o.hybrid !== null) {
    const h = o.hybrid as Record<string, unknown>;
    hybrid = {
      enabled: typeof h.enabled === "boolean" ? h.enabled : Boolean(h.enabled),
      ranks: hasOwn(h, "ranks") ? h.ranks : undefined,
      counts: hasOwn(h, "counts") ? h.counts : undefined,
      overfilter: hasOwn(h, "overfilter") ? h.overfilter : undefined,
    };
  }

  return {
    enabled: Boolean(o.enabled),
    disabled_reason: typeof o.disabled_reason === "string" ? o.disabled_reason : null,
    error: typeof o.error === "string" ? o.error : undefined,
    query_text: o.query_text as string,
    filters: {
      project_id: typeof filters.project_id === "string" ? filters.project_id : "",
      sources,
    },
    timings_ms: timingsMs,
    rerank,
    backend,
    hybrid,
    candidates,
    final: {
      chunks: finalChunks,
      text_md: typeof final.text_md === "string" ? final.text_md : "",
      truncated: Boolean(final.truncated),
    },
    prompt_block: {
      identifier: typeof promptBlock.identifier === "string" ? promptBlock.identifier : "",
      role: typeof promptBlock.role === "string" ? promptBlock.role : "",
      text_md: typeof promptBlock.text_md === "string" ? promptBlock.text_md : "",
    },
    dropped,
    counts,
  };
}
