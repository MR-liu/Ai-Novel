import { downloadJson, writeClipboardText } from "./utils";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../ui/Feedback";
import {
  formatRerankSummary,
  formatVectorCandidateLabel,
  formatVectorCountsSummary,
  formatVectorHybridSummary,
  formatVectorQueryStatusSummary,
  formatVectorSourceSummary,
  formatVectorTimingSummary,
} from "./vectorRag";
import { useVectorRagQuery } from "./useVectorRagQuery";
import { formatVectorContentSourceLabel } from "../../../lib/vectorRagCopy";
import { WritingDrawerSection } from "../WritingDrawerWorkbench";

type ToastApi = {
  toastSuccess: (message: string, requestId?: string) => void;
  toastError: (message: string, requestId?: string) => void;
};

export function VectorRagDebugPanel(props: {
  projectId?: string;
  toast: ToastApi;
  vector: ReturnType<typeof useVectorRagQuery>;
}) {
  const { projectId, toast, vector } = props;
  const {
    groupedVectorFinalChunks,
    runVectorQuery,
    selectedVectorSources,
    setVectorQueryText,
    setVectorSources,
    vectorError,
    vectorLoading,
    vectorNormalizedQueryText,
    vectorPreprocessObs,
    vectorQueryText,
    vectorRawQueryText,
    vectorRequestId,
    vectorResult,
    vectorSources,
  } = vector;

  const statusSummary = vectorResult
    ? formatVectorQueryStatusSummary(vectorResult)
    : "还没开始检查本次资料召回。输入你此刻想写的情节或问题后，就能先预览系统会带回哪些参考片段。";
  const sourceSummary = formatVectorSourceSummary(vectorResult?.filters.sources ?? selectedVectorSources);
  const requestSummary = vectorRequestId ? `定位编号：${vectorRequestId}` : "尚未生成定位编号";
  const countsSummary = vectorResult ? formatVectorCountsSummary(vectorResult) : null;
  const timingSummary = vectorResult ? formatVectorTimingSummary(vectorResult.timings_ms) : null;
  const hybridSummary = vectorResult ? formatVectorHybridSummary(vectorResult.hybrid, vectorResult.backend) : null;

  return (
    <WritingDrawerSection
      kicker="资料召回"
      title="先看这次会带回哪些参考片段"
      copy="适合排查“为什么 AI 这次写偏了”或“为什么没引用到我想要的资料”。先看状态摘要，再逐层展开命中片段。"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-ink">资料召回预览</div>
          <div className="mt-1 text-[11px] leading-5 text-subtext">{statusSummary}</div>
          <div className="drawer-workbench-chip-row mt-2">
            <span className="manuscript-chip">{sourceSummary}</span>
            <span className="manuscript-chip">{requestSummary}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="btn btn-secondary"
            disabled={!projectId || vectorLoading}
            onClick={() => void runVectorQuery()}
            type="button"
          >
            {vectorLoading ? "检查中..." : "检查资料命中"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={!vectorResult}
            onClick={() => {
              if (!vectorResult) return;
              void (async () => {
                try {
                  await writeClipboardText(JSON.stringify(vectorResult, null, 2));
                  toast.toastSuccess("已复制底层结果");
                } catch {
                  toast.toastError("复制失败");
                }
              })();
            }}
            type="button"
          >
            复制底层结果
          </button>
          <button
            className="btn btn-secondary"
            disabled={!vectorResult}
            onClick={() => {
              if (!vectorResult) return;
              downloadJson(`vector_rag_${projectId ?? "project"}.json`, vectorResult);
            }}
            type="button"
          >
            导出底层结果
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-xs text-subtext">
          想核对的写作意图
          <textarea
            className="textarea mt-1 min-h-24 w-full"
            value={vectorQueryText}
            placeholder="例如：本章要写的角色、地点、冲突或你担心会写偏的设定"
            onChange={(e) => setVectorQueryText(e.target.value)}
          />
        </label>

        <div className="drawer-workbench-subcard">
          <div className="text-xs text-subtext">本次优先检查的资料</div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-subtext">
            {(["worldbook", "outline", "chapter"] as const).map((src) => (
              <label key={src} className="flex items-center gap-2 text-ink">
                <input
                  className="checkbox"
                  checked={vectorSources[src]}
                  onChange={(e) => setVectorSources((prev) => ({ ...prev, [src]: e.target.checked }))}
                  type="checkbox"
                />
                {formatVectorContentSourceLabel(src, src)}
              </label>
            ))}
          </div>
        </div>

        {vectorError ? (
          <FeedbackCallout tone="danger" title="本次检查没有完成">
            {vectorError.message} ({vectorError.code})
            {vectorError.requestId ? <span className="ml-2">定位编号：{vectorError.requestId}</span> : null}
          </FeedbackCallout>
        ) : null}

        {vectorResult ? (
          <>
            <div className="drawer-workbench-subcard grid gap-2 text-xs text-subtext">
              <div>{countsSummary}</div>
              <div>{timingSummary}</div>
              {vectorResult.rerank ? <div>重排摘要：{formatRerankSummary(vectorResult.rerank)}</div> : null}
              <div>混合召回：{hybridSummary}</div>
            </div>

            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title="注入到提示词的参考片段"
            >
              <pre className="drawer-workbench-codeblock mt-3">{vectorResult.prompt_block.text_md || "（空）"}</pre>
            </FeedbackDisclosure>

            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title="检索语句整理过程"
            >
              <div className="mt-3 grid gap-3">
                <div>
                  <div className="text-[11px] text-subtext">最初输入</div>
                  <pre className="drawer-workbench-codeblock mt-2">{vectorRawQueryText ?? ""}</pre>
                </div>
                <div>
                  <div className="text-[11px] text-subtext">整理后的检索语句</div>
                  <pre className="drawer-workbench-codeblock mt-2">{vectorNormalizedQueryText ?? ""}</pre>
                </div>
                <div>
                  <div className="text-[11px] text-subtext">整理底层记录</div>
                  <pre className="drawer-workbench-codeblock mt-2">
                    {JSON.stringify(vectorPreprocessObs ?? null, null, 2)}
                  </pre>
                </div>
              </div>
            </FeedbackDisclosure>

            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title={`最终入选片段（按资料来源与章节整理，${vectorResult.final.chunks.length}）`}
            >
              <div className="mt-3 grid gap-2">
                {vectorResult.final.chunks.length === 0 ? (
                  <FeedbackEmptyState
                    variant="compact"
                    kicker="最终入选"
                    title="当前没有入选片段"
                    description="可以先检查查询语句、来源范围，或回头看候选片段为什么都被舍弃了。"
                  />
                ) : (
                  groupedVectorFinalChunks.map((src) => (
                    <FeedbackDisclosure
                      key={src.source}
                      defaultOpen
                      className="drawer-workbench-subcard"
                      summaryClassName="cursor-pointer select-none text-xs text-subtext hover:text-ink"
                      title={`资料来源：${formatVectorContentSourceLabel(src.source, src.source)}（${src.chapterGroups.reduce((acc, g) => acc + g.chunks.length, 0)}）`}
                    >
                      <div className="mt-2 grid gap-2">
                        {src.chapterGroups.map((g) => (
                          <FeedbackDisclosure
                            key={g.key}
                            defaultOpen
                            className="drawer-workbench-disclosure"
                            summaryClassName="cursor-pointer select-none text-xs text-subtext hover:text-ink"
                            title={`${g.chapterNumber != null ? `第 ${g.chapterNumber} 章` : "资料条目"}${g.title ? ` | ${g.title}` : ""}${g.sourceId ? ` | ${g.sourceId}` : ""}（${g.chunks.length}）`}
                          >
                            <div className="mt-2 grid gap-2">
                              {g.chunks.map((c) => (
                                <FeedbackDisclosure
                                  key={c.id}
                                  className="drawer-workbench-subcard"
                                  summaryClassName="cursor-pointer select-none text-xs text-subtext hover:text-ink"
                                  title={`${formatVectorCandidateLabel(c.source, c.chunkIndex, c.title, c.sourceId)}${c.distance != null ? ` | 匹配距离:${c.distance.toFixed(4)}` : ""}`}
                                >
                                  <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-[11px] leading-5 text-subtext">
                                    {(c.text || "").trim() || "（空）"}
                                  </pre>
                                  <FeedbackDisclosure
                                    className="drawer-workbench-disclosure mt-2"
                                    summaryClassName="cursor-pointer select-none text-[11px] text-subtext hover:text-ink"
                                    title="底层元数据"
                                  >
                                    <pre className="drawer-workbench-codeblock mt-2 text-[11px] leading-5 text-subtext">
                                      {JSON.stringify(c.metadata, null, 2)}
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
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title={`候选片段（前 ${Math.min(10, vectorResult.candidates.length)} 条）`}
            >
              <div className="mt-3 grid gap-2">
                {vectorResult.candidates.slice(0, 10).map((c) => {
                  const meta = c.metadata ?? {};
                  const source = typeof meta.source === "string" ? meta.source : "";
                  const title = typeof meta.title === "string" ? meta.title : "";
                  const sourceId = typeof meta.source_id === "string" ? meta.source_id : "";
                  const chunkIndexRaw = (meta as Record<string, unknown>).chunk_index;
                  const chunkIndex = typeof chunkIndexRaw === "number" ? chunkIndexRaw : Number(chunkIndexRaw);
                  const snippet = (c.text || "").replaceAll(/\s+/g, " ").trim().slice(0, 220);
                  return (
                    <div key={c.id} className="drawer-workbench-subcard text-xs">
                      <div className="truncate text-ink">
                        {formatVectorCandidateLabel(
                          source,
                          Number.isFinite(chunkIndex) ? chunkIndex : null,
                          title,
                          sourceId,
                        )}
                      </div>
                      <div className="mt-1 text-subtext">匹配距离：{c.distance.toFixed(4)}</div>
                      <div className="mt-1 text-subtext">
                        {snippet || "（空）"}
                        {snippet.length >= 220 ? "…" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </FeedbackDisclosure>

            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title="底层返回结果（JSON）"
            >
              <pre className="drawer-workbench-codeblock mt-3">{JSON.stringify(vectorResult, null, 2)}</pre>
            </FeedbackDisclosure>
          </>
        ) : (
          <FeedbackEmptyState
            variant="compact"
            kicker="资料召回"
            title="还没开始检查资料命中"
            description="如果当前环境暂时无法执行资料召回，这里会提示原因；你仍然可以先检查写作意图和资料范围是否合理。"
          />
        )}
      </div>
    </WritingDrawerSection>
  );
}
