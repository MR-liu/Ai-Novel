import { useCallback, useMemo } from "react";

import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../components/ui/Feedback";
import { useToast } from "../../components/ui/toast";
import { copyText } from "../../lib/copyText";
import { UI_COPY } from "../../lib/uiCopy";
import { formatRagBackendLabel, formatRagDisabledReason } from "../../lib/vectorRagCopy";
import { EMPTY_CHUNKS } from "./types";
import type { VectorRagResult, VectorSource } from "./types";
import {
  formatHybridCounts,
  formatOverfilter,
  formatRerankSummary,
  formatSuperSortSummary,
  normalizeRerankObs,
  normalizeSuperSortObs,
  safeJson,
} from "./utils";

const SOURCE_LABEL: Record<VectorSource, string> = {
  worldbook: "世界书（worldbook）",
  outline: "大纲（outline）",
  chapter: "章节（chapter）",
  story_memory: "故事记忆（story_memory）",
};

export function RagQueryPanel(props: {
  busy: boolean;
  sources: VectorSource[];
  toggleSource: (src: VectorSource) => void;
  queryText: string;
  setQueryText: (text: string) => void;
  queryLoading: boolean;
  runQuery: () => Promise<void>;
  projectId: string | undefined;
  sortedSources: VectorSource[];
  queryResult: VectorRagResult | null;
  queryRequestId: string | null;
  rawQueryText: string | null;
  normalizedQueryText: string | null;
  queryPreprocessObs: unknown;
}) {
  const {
    busy,
    normalizedQueryText,
    projectId,
    queryLoading,
    queryPreprocessObs,
    queryRequestId,
    queryResult,
    queryText,
    rawQueryText,
    runQuery,
    setQueryText,
    sortedSources,
    sources,
    toggleSource,
  } = props;

  const toast = useToast();

  const injectionText = (queryResult?.prompt_block?.text_md ?? "").trim();
  const finalChunks = queryResult?.final?.chunks ?? EMPTY_CHUNKS;
  const rerankSummary = useMemo(() => {
    const obs = normalizeRerankObs(queryResult?.rerank);
    return obs ? formatRerankSummary(obs) : null;
  }, [queryResult?.rerank]);
  const superSortSummary = useMemo(() => {
    const obs = normalizeSuperSortObs(queryResult?.super_sort);
    return obs ? formatSuperSortSummary(obs) : null;
  }, [queryResult?.super_sort]);
  const querySummary = queryText.trim() || "尚未输入检索问题";
  const nextStepText = !queryText.trim()
    ? "先写下这次要验证的设定、情节或人物问题，再执行检索。"
    : !queryResult
      ? "执行一次检索，先看系统会保留哪些资料片段进入生成。"
      : finalChunks.length === 0
        ? "本次没有保留可注入片段，建议换更具体的问题，或调整资料来源后再试。"
        : "先读注入摘要，再看下方命中的原文片段，判断它们是否真能支持你当前要写的内容。";
  const countsSummary = queryResult?.counts
    ? `${queryResult.counts.candidates_total} 候选 / ${queryResult.counts.final_selected} 最终片段`
    : "等待一次检索后展示";
  const droppedSummary =
    queryResult?.counts && Object.keys(queryResult.counts.dropped_by_reason ?? {}).length
      ? Object.entries(queryResult.counts.dropped_by_reason)
          .map(([k, v]) => `${k}:${v}`)
          .join(" | ")
      : "暂无";

  const groupedFinalChunks = useMemo(() => {
    type GroupChunk = {
      id: string;
      distance: number | null;
      text: string;
      source: string;
      sourceId: string;
      title: string;
      chapterNumber: number | null;
      chunkIndex: number;
      metadata: Record<string, unknown>;
    };

    type ChapterGroup = {
      key: string;
      sourceId: string;
      title: string;
      chapterNumber: number | null;
      chunks: GroupChunk[];
    };

    const bySource = new Map<string, Map<string, ChapterGroup>>();

    for (const raw of finalChunks) {
      const meta = (raw.metadata ?? {}) as Record<string, unknown>;
      const source = typeof meta.source === "string" ? meta.source : "unknown";
      const sourceId = typeof meta.source_id === "string" ? meta.source_id : "";
      const title = typeof meta.title === "string" ? meta.title : "";
      const chapterRaw = meta.chapter_number;
      const chapterNumber = typeof chapterRaw === "number" ? chapterRaw : Number(chapterRaw);
      const chapter = Number.isFinite(chapterNumber) ? chapterNumber : null;
      const chunkRaw = meta.chunk_index;
      const chunkIndex = typeof chunkRaw === "number" ? chunkRaw : Number(chunkRaw);
      const idx = Number.isFinite(chunkIndex) ? chunkIndex : 0;

      const groupKey = `${chapter ?? "-"}::${sourceId || title || raw.id}`;
      const chunk: GroupChunk = {
        id: raw.id,
        distance: typeof raw.distance === "number" && Number.isFinite(raw.distance) ? raw.distance : null,
        text: String(raw.text ?? ""),
        source,
        sourceId,
        title,
        chapterNumber: chapter,
        chunkIndex: idx,
        metadata: meta,
      };

      let sourceMap = bySource.get(source);
      if (!sourceMap) {
        sourceMap = new Map<string, ChapterGroup>();
        bySource.set(source, sourceMap);
      }
      let chapterGroup = sourceMap.get(groupKey);
      if (!chapterGroup) {
        chapterGroup = { key: groupKey, sourceId, title, chapterNumber: chapter, chunks: [] };
        sourceMap.set(groupKey, chapterGroup);
      }
      chapterGroup.chunks.push(chunk);
    }

    const sourceGroups = [...bySource.entries()].map(([source, chapters]) => {
      const chapterGroups = [...chapters.values()];
      chapterGroups.sort((a, b) => {
        if (a.chapterNumber != null && b.chapterNumber != null) return a.chapterNumber - b.chapterNumber;
        const at = a.title || a.sourceId || a.key;
        const bt = b.title || b.sourceId || b.key;
        return at.localeCompare(bt);
      });
      for (const g of chapterGroups) {
        g.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex || a.id.localeCompare(b.id));
      }
      return { source, chapterGroups };
    });
    sourceGroups.sort((a, b) => a.source.localeCompare(b.source));
    return sourceGroups;
  }, [finalChunks]);
  const sourceOverview = useMemo(
    () =>
      groupedFinalChunks.map((group) => ({
        source: group.source,
        chunkCount: group.chapterGroups.reduce((count, chapter) => count + chapter.chunks.length, 0),
        chapterCount: group.chapterGroups.length,
      })),
    [groupedFinalChunks],
  );

  const copyInjectionText = useCallback(async () => {
    if (!injectionText) {
      toast.toastError("没有可复制的注入文本");
      return;
    }
    const ok = await copyText(injectionText, { title: "复制失败：请手动复制注入文本" });
    if (ok) toast.toastSuccess("已复制注入文本");
    else toast.toastWarning("自动复制失败：已打开手动复制弹窗。");
  }, [injectionText, toast]);

  const copyQueryDebug = useCallback(async () => {
    if (!projectId) return;
    if (!queryResult) {
      toast.toastError("还没有检索结果可复制");
      return;
    }
    const payload = {
      request_id: queryRequestId,
      project_id: projectId,
      sources: sortedSources,
      raw_query_text: rawQueryText,
      normalized_query_text: normalizedQueryText,
      preprocess_obs: queryPreprocessObs,
      result: queryResult,
    };
    const ok = await copyText(safeJson(payload), { title: "复制失败：请手动复制排障信息" });
    if (ok) toast.toastSuccess("已复制排障信息", queryRequestId ?? undefined);
    else toast.toastWarning("自动复制失败：已打开手动复制弹窗。");
  }, [
    normalizedQueryText,
    projectId,
    queryPreprocessObs,
    queryRequestId,
    queryResult,
    rawQueryText,
    sortedSources,
    toast,
  ]);

  return (
    <>
      <div className="mt-6 rounded-atelier border border-border bg-surface p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="text-sm font-medium text-ink">检索范围</div>
            <div className="mt-1 text-xs leading-6 text-subtext">
              先决定这次要从哪些故事资料里找依据。来源越少，结果越聚焦；来源越多，越适合做全局回查。
            </div>
          </div>
          <div className="text-xs text-subtext">当前已选 {sortedSources.length} 类来源</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {(["worldbook", "outline", "chapter", "story_memory"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm text-ink">
              <input
                className="checkbox"
                type="checkbox"
                checked={sources.includes(s)}
                onChange={() => toggleSource(s)}
              />
              <span>{SOURCE_LABEL[s]}</span>
            </label>
          ))}
        </div>
        <FeedbackCallout className="mt-4 text-xs" title="推荐的验证顺序">
          推荐顺序：先用 `世界书 + 大纲` 验证设定问题，再加入 `章节 + 故事记忆` 回查具体写法，这样更容易区分“规则没写清”还是“正文已经偏了”。
        </FeedbackCallout>
      </div>

      <section className="mt-6 rounded-atelier border border-border bg-surface p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="text-sm font-medium text-ink">检索验证台</div>
            <div className="mt-1 text-xs leading-6 text-subtext">{nextStepText}</div>
          </div>
          <div className="text-xs text-subtext">{countsSummary}</div>
        </div>
        <div className="manuscript-status-list mt-4">
          <span className="manuscript-chip max-w-[280px] truncate" title={querySummary}>
            当前问题：{querySummary}
          </span>
          <span className="manuscript-chip">来源：{sortedSources.length}</span>
          <span className="manuscript-chip">最终片段：{finalChunks.length}</span>
          <span className="manuscript-chip">{injectionText ? "已生成注入摘要" : "尚未生成注入摘要"}</span>
        </div>

        <div className="mt-3">
          <label className="text-xs text-subtext" htmlFor="rag-query-text">
            这次想验证的问题
          </label>
          <textarea
            id="rag-query-text"
            aria-label="query_text"
            className="textarea mt-1"
            rows={3}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="例如：沈昭为什么怀疑林砚？星门开启的代价是什么？"
          />
          <div className="mt-2 text-[11px] leading-5 text-subtext">
            写法建议：优先输入完整问题、角色关系或事件短句，而不是只写一个词。这样更容易判断系统找回来的资料是否真正支撑你的写作目标。
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary"
              disabled={queryLoading || busy}
              onClick={() => void runQuery()}
              aria-label="查询 (rag_query)"
              type="button"
            >
              {queryLoading ? "查询中…" : "查询"}
            </button>
            <button
              className="btn btn-secondary"
              disabled={!injectionText}
              onClick={() => void copyInjectionText()}
              type="button"
            >
              复制注入文本
            </button>
            <button
              className="btn btn-secondary"
              disabled={!queryResult}
              onClick={() => void copyQueryDebug()}
              type="button"
            >
              复制排障信息
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-atelier border border-border bg-surface p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="text-sm font-medium text-ink">这次检索带回了什么</div>
            <div className="mt-1 text-xs leading-6 text-subtext">
              先看摘要和结论，再决定要不要读原始片段；如果摘要已经明显跑偏，就没必要先埋头看底层排障信息。
            </div>
          </div>
          <div className="text-xs text-subtext">{queryResult ? "已拿到检索结果" : "等待检索"}</div>
        </div>

        {queryResult ? (
          <div className="mt-3 text-xs text-subtext">
            <div className="result-overview-grid lg:grid-cols-4">
              <div className="result-overview-card is-emphasis">
                <div className="result-overview-label">检索状态</div>
                <div className="result-overview-value">
                  {queryResult.enabled ? "当前可用" : `当前暂不可用：${formatRagDisabledReason(queryResult.disabled_reason)}`}
                </div>
                <div className="result-overview-copy">检索后端：{formatRagBackendLabel(queryResult.backend)}</div>
              </div>
              <div className="result-overview-card">
                <div className="result-overview-label">命中规模</div>
                <div className="result-overview-value">{countsSummary}</div>
                <div className="result-overview-copy">丢弃原因：{droppedSummary}</div>
              </div>
              <div className="result-overview-card">
                <div className="result-overview-label">注入摘要</div>
                <div className="result-overview-value">{injectionText ? "已生成" : "尚未生成"}</div>
                <div className="result-overview-copy">{nextStepText}</div>
              </div>
              <div className="result-overview-card">
                <div className="result-overview-label">执行耗时</div>
                <div className="result-overview-value">
                  {queryResult.timings_ms
                    ? Object.entries(queryResult.timings_ms)
                        .map(([k, v]) => `${k} ${v}ms`)
                        .join(" | ")
                    : "-"}
                </div>
                <div className="result-overview-copy">
                  {queryResult.hybrid
                    ? `${queryResult.hybrid.enabled ? "混合检索已启用" : "混合检索未启用"} | ${formatHybridCounts(queryResult.hybrid.counts)}`
                    : rerankSummary
                      ? "包含重排过程"
                      : "未记录额外重排摘要"}
                </div>
              </div>
            </div>

            {queryRequestId ? (
              <div className="drawer-workbench-chip-row mt-3">
                <span className="truncate">
                  {UI_COPY.common.requestIdLabel}: <span className="font-mono">{queryRequestId}</span>
                </span>
                <button
                  className="btn btn-ghost px-2 py-1 text-xs"
                  onClick={async () => {
                    await copyText(queryRequestId ?? "", { title: "复制失败：请手动复制请求 ID" });
                  }}
                  type="button"
                >
                  {UI_COPY.common.copy}
                </button>
              </div>
            ) : null}

            {rerankSummary || superSortSummary ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {rerankSummary ? (
                  <div className="result-overview-card">
                    <div className="result-overview-label">重排摘要</div>
                    <div className="result-overview-copy">{rerankSummary}</div>
                  </div>
                ) : null}
                {superSortSummary ? (
                  <div className="result-overview-card">
                    <div className="result-overview-label">排序策略摘要</div>
                    <div className="result-overview-copy">{superSortSummary}</div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <FeedbackCallout className="mt-3 text-xs" title="建议这样判断结果">
              判断顺序建议：先看注入摘要是否回答了你的问题，再看命中的原文片段是否真有足够依据。只有两层都对，才说明这次检索是可靠的。
            </FeedbackCallout>

            <FeedbackDisclosure
              className="drawer-workbench-disclosure mt-3"
              summaryClassName="px-0 py-0 text-xs"
              bodyClassName="pt-3"
              title="写作前会注入的资料摘要"
            >
              <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-[11px] leading-5 text-subtext">
                {injectionText || "（空）"}
              </pre>
            </FeedbackDisclosure>

            {sourceOverview.length ? (
              <div className="result-overview-grid lg:grid-cols-4">
                {sourceOverview.map((item) => (
                  <div key={item.source} className="result-overview-card">
                    <div className="result-overview-label">{SOURCE_LABEL[item.source as VectorSource] ?? item.source}</div>
                    <div className="result-overview-value">{item.chunkCount} 个片段</div>
                    <div className="result-overview-copy">
                      分布在 {item.chapterCount} 个条目 / 章节里。
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <FeedbackDisclosure
              className="drawer-workbench-disclosure mt-3"
              summaryClassName="px-0 py-0 text-xs"
              bodyClassName="pt-3"
              title="命中的原始资料片段（按来源 / 章节分组）"
            >
              <div className="mt-2 grid max-h-96 gap-2 overflow-auto overscroll-contain pr-1">
                {finalChunks.length === 0 ? (
                  <FeedbackEmptyState
                    variant="compact"
                    title="当前没有命中的资料片段"
                    description="可以换更具体的问题、调整来源范围，或回头确认资料库本身是否已经准备好。"
                  />
                ) : (
                  groupedFinalChunks.map((src) => (
                    <FeedbackDisclosure
                      key={src.source}
                      className="drawer-workbench-subcard"
                      summaryClassName="px-0 py-0 text-xs text-subtext hover:text-ink"
                      bodyClassName="pt-2"
                      title={
                        <>
                          来源：{SOURCE_LABEL[src.source as VectorSource] ?? src.source}（
                          {src.chapterGroups.reduce((acc, g) => acc + g.chunks.length, 0)}）
                        </>
                      }
                    >
                      <div className="mt-2 grid gap-2">
                        {src.chapterGroups.map((g) => (
                          <FeedbackDisclosure
                            key={g.key}
                            className="drawer-workbench-subcard"
                            summaryClassName="px-0 py-0 text-xs text-subtext hover:text-ink"
                            bodyClassName="pt-2"
                            title={
                              <>
                                {g.chapterNumber != null ? `第 ${g.chapterNumber} 章` : "条目"}
                                {g.title ? ` | ${g.title}` : ""}
                                {g.sourceId ? ` | ${g.sourceId}` : ""}（{g.chunks.length}）
                              </>
                            }
                          >
                            <div className="mt-2 grid gap-2">
                              {g.chunks.map((c) => (
                                <FeedbackDisclosure
                                  key={c.id}
                                  className="drawer-workbench-subcard"
                                  summaryClassName="px-0 py-0 text-xs text-subtext hover:text-ink"
                                  bodyClassName="pt-2"
                                  title={
                                    <>
                                      片段序号:{c.chunkIndex}
                                      {c.distance != null ? ` | distance:${c.distance.toFixed(4)}` : ""}
                                      {c.title ? ` | ${c.title}` : ""}
                                    </>
                                  }
                                >
                                  <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-[11px] leading-5 text-subtext">
                                    {(c.text || "").trim() || "（空）"}
                                  </pre>
                                  <FeedbackDisclosure
                                    className="drawer-workbench-disclosure mt-2"
                                    summaryClassName="px-0 py-0 text-[11px] text-subtext hover:text-ink"
                                    bodyClassName="pt-3"
                                    title="元信息"
                                  >
                                    <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-[11px] leading-5 text-subtext">
                                      {safeJson(c.metadata)}
                                    </pre>
                                  </FeedbackDisclosure>
                                </FeedbackDisclosure>
                              ))}
                            </div>
                          </FeedbackDisclosure>
                        ))}
                      </div>
                    </FeedbackDisclosure>
                  ))
                )}
              </div>
            </FeedbackDisclosure>

            <FeedbackDisclosure
              className="drawer-workbench-disclosure mt-3"
              summaryClassName="px-0 py-0 text-xs"
              bodyClassName="pt-3"
              title="调试与排障信息"
            >
              <div className="text-xs leading-6 text-subtext">
                只有在怀疑 query 预处理、重排或最终注入有偏差时再展开这里，避免排障信息和写作判断混在一起。
              </div>
              <div className="debug-disclosure-stack">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="drawer-workbench-subcard">
                    <div className="text-[11px] text-subtext">原始问题</div>
                    <pre className="drawer-workbench-codeblock mt-2 text-[11px] leading-5 text-subtext">
                      {(rawQueryText ?? "").trim() || "（空）"}
                    </pre>
                  </div>
                  <div className="drawer-workbench-subcard">
                    <div className="text-[11px] text-subtext">规范化后的检索表达</div>
                    <pre className="drawer-workbench-codeblock mt-2 text-[11px] leading-5 text-subtext">
                      {(normalizedQueryText ?? "").trim() || "（空）"}
                    </pre>
                  </div>
                </div>

                <div className="drawer-workbench-subcard text-xs text-subtext">
                  混合检索摘要：{" "}
                  {queryResult.hybrid
                    ? `${queryResult.hybrid.enabled ? "已启用" : "未启用"} | 命中规模:${formatHybridCounts(queryResult.hybrid.counts)} | 过筛保护:${formatOverfilter(
                        queryResult.hybrid.overfilter,
                      )}`
                    : "-"}
                </div>

                {queryPreprocessObs ? (
                  <FeedbackDisclosure
                    className="drawer-workbench-disclosure"
                    summaryClassName="px-0 py-0 text-xs"
                    bodyClassName="pt-3"
                    title="查询预处理信息"
                  >
                    <pre className="drawer-workbench-codeblock mt-2 text-[11px] leading-5 text-subtext">
                      {safeJson(queryPreprocessObs)}
                    </pre>
                  </FeedbackDisclosure>
                ) : null}

                {queryResult.rerank ? (
                  <FeedbackDisclosure
                    className="drawer-workbench-disclosure"
                    summaryClassName="px-0 py-0 text-xs"
                    bodyClassName="pt-3"
                    title="重排原始观测"
                  >
                    <pre className="drawer-workbench-codeblock mt-2 text-[11px] leading-5 text-subtext">
                      {safeJson(queryResult.rerank)}
                    </pre>
                  </FeedbackDisclosure>
                ) : null}

                {queryResult.super_sort ? (
                  <FeedbackDisclosure
                    className="drawer-workbench-disclosure"
                    summaryClassName="px-0 py-0 text-xs"
                    bodyClassName="pt-3"
                    title="排序策略原始观测"
                  >
                    <pre className="drawer-workbench-codeblock mt-2 text-[11px] leading-5 text-subtext">
                      {safeJson(queryResult.super_sort)}
                    </pre>
                  </FeedbackDisclosure>
                ) : null}

                <FeedbackDisclosure
                  className="drawer-workbench-disclosure"
                  summaryClassName="px-0 py-0 text-xs"
                  bodyClassName="pt-3"
                  title="仅在排障时查看原始检索结果"
                >
                  <pre className="drawer-workbench-codeblock mt-2 text-[11px] leading-5 text-subtext">
                    {safeJson(queryResult)}
                  </pre>
                </FeedbackDisclosure>
              </div>
            </FeedbackDisclosure>
          </div>
        ) : (
          <FeedbackEmptyState
            className="mt-3 rounded-atelier border border-dashed border-border bg-canvas"
            title="还没有检索结果"
            description="先输入你要验证的问题并点击“查询”，这里会展示注入摘要和命中的原始资料片段。"
          />
        )}
      </section>
    </>
  );
}
