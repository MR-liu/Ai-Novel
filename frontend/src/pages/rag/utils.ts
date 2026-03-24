import {
  formatRagDisabledReason,
  formatRerankMethodLabel,
  formatVectorContentSourceLabel,
  formatVectorProviderLabel,
} from "../../lib/vectorRagCopy";
import type { VectorRerankObs, VectorSuperSortObs } from "./types";

export function safeJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export function formatIsoToLocal(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

export function normalizeRerankObs(raw: unknown): VectorRerankObs | null {
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
  const comparedText = delta.compared ? `${delta.changedPositions}/${delta.compared}` : "无变化样本";
  const methodText = formatRerankMethodLabel(obs.method ?? "", "未返回");
  const reqText = formatRerankMethodLabel(obs.requested_method || "", "未返回");
  const reasonText = formatRagDisabledReason(obs.reason);
  const providerText = formatVectorProviderLabel(obs.provider ?? "", "未返回");
  const modelText = obs.model ?? "未返回";
  const hybridText = typeof obs.hybrid_alpha === "number" ? ` | 混合权重:${obs.hybrid_alpha}` : "";
  const hybridAppliedText = typeof obs.hybrid_applied === "boolean" ? ` | 本次混合:${obs.hybrid_applied ? "已参与" : "未参与"}` : "";
  const errText = obs.error_type ? ` | 错误类型:${obs.error_type}` : "";
  const changesText = delta.compared
    ? ` | top_k 内变化:${comparedText} | 新进入:${delta.entered} | 被替换:${delta.left}`
    : "";
  return `${obs.enabled ? "已启用" : "未启用"} | ${obs.applied ? "本次已参与排序" : "本次未参与排序"} | 原因:${reasonText} | 请求方式:${reqText} | 实际方式:${methodText} | 服务:${providerText} | 模型:${modelText}${hybridText}${hybridAppliedText} | 候选数:${obs.top_k} | 耗时:${obs.timing_ms}ms${changesText}${errText}`;
}

export function normalizeSuperSortObs(raw: unknown): VectorSuperSortObs | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const before = Array.isArray(o.before) ? o.before.map((v) => String(v)) : undefined;
  const after = Array.isArray(o.after) ? o.after.map((v) => String(v)) : undefined;

  const sourceOrder = Array.isArray(o.source_order) ? o.source_order.map((v) => String(v)) : null;
  const sourceOrderEffective = Array.isArray(o.source_order_effective)
    ? o.source_order_effective.map((v) => String(v))
    : null;
  const bySource = o.by_source && typeof o.by_source === "object" ? (o.by_source as Record<string, number>) : null;

  return {
    enabled: Boolean(o.enabled),
    applied: Boolean(o.applied),
    reason: typeof o.reason === "string" ? o.reason : null,
    before,
    after,
    source_order: sourceOrder,
    source_order_effective: sourceOrderEffective,
    source_weights:
      o.source_weights && typeof o.source_weights === "object" ? (o.source_weights as Record<string, number>) : null,
    source_weights_effective:
      o.source_weights_effective && typeof o.source_weights_effective === "object"
        ? (o.source_weights_effective as Record<string, number>)
        : null,
    by_source: bySource,
    override_enabled: typeof o.override_enabled === "boolean" ? o.override_enabled : null,
    requested: o.requested,
  };
}

export function formatSuperSortSummary(obs: VectorSuperSortObs): string {
  const reasonText = formatRagDisabledReason(obs.reason);
  const bySourceText = obs.by_source
    ? Object.entries(obs.by_source)
        .map(([k, v]) => `${formatVectorContentSourceLabel(k, k)} ${v}`)
        .join(" | ")
    : "未返回";
  const orderText = obs.source_order_effective?.length
    ? obs.source_order_effective.map((source) => formatVectorContentSourceLabel(source, source)).join("、")
    : obs.source_order?.length
      ? obs.source_order.map((source) => formatVectorContentSourceLabel(source, source)).join("、")
      : "未返回";
  return `${obs.enabled ? "已启用" : "未启用"} | ${obs.applied ? "本次已应用" : "本次未应用"} | 原因:${reasonText} | 来源顺序:${orderText} | 各来源命中:${bySourceText}`;
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
      return Number.isFinite(n) ? `${k} ${n}` : null;
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
    ? o.used_sources.map((v) => formatVectorContentSourceLabel(String(v), String(v))).filter((v) => Boolean(v))
    : [];
  const vectorK = typeof o.vector_k === "number" ? o.vector_k : Number(o.vector_k);
  const ftsK = typeof o.fts_k === "number" ? o.fts_k : Number(o.fts_k);

  const parts = [enabled ? "已启用" : "未启用"];
  if (actions.length) {
    parts.push(`动作:${actions.map((value) => OVERFILTER_ACTION_LABELS[value] ?? value.replaceAll("_", " ")).join("、")}`);
  }
  if (usedSources.length) parts.push(`实际来源:${usedSources.join("、")}`);
  if (Number.isFinite(vectorK)) parts.push(`向量候选:${vectorK}`);
  if (Number.isFinite(ftsK)) parts.push(`关键词候选:${ftsK}`);
  return parts.join(" | ");
}
