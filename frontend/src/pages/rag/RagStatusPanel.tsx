import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../components/ui/Feedback";
import { formatRagBackendLabel, formatRagDisabledReason } from "../../lib/vectorRagCopy";
import type { VectorRagResult } from "./types";
import { formatRerankSummary, normalizeRerankObs, safeJson } from "./utils";

export function RagStatusPanel(props: { status: VectorRagResult | null }) {
  const { status } = props;
  const rerankObs = normalizeRerankObs(status?.rerank);
  const indexDirty = status?.index?.dirty;
  const statusSummary = !status
    ? "尚未加载"
    : !status.enabled
      ? "当前不可用"
      : indexDirty
        ? "索引需要更新"
        : "当前可正常用于检索验证";
  const retrievalSummary = !status
    ? "等待刷新状态"
    : status.hybrid_enabled
      ? "混合检索已启用"
      : "当前以基础向量检索为主";
  const nextStepText = !status
    ? "先刷新状态，确认知识库服务是否可用。"
    : !status.enabled
      ? `当前检索还不可用，先处理原因：${formatRagDisabledReason(status.disabled_reason)}。`
      : indexDirty
        ? "索引显示为待重建，建议先完成重建，再做命中验证。"
        : "状态正常，下一步更适合到下方做一次真实查询，确认命中是否符合预期。";
  const countsSummary = status?.counts
    ? `${status.counts.candidates_total} 候选 → ${status.counts.final_selected} 最终片段`
    : "等待一次真实查询后展示命中规模";

  return (
    <section
      className="mt-6 rounded-atelier border border-border bg-surface p-4"
      aria-label="状态 (rag_status_section)"
    >
      <div className="studio-cluster-header">
        <div>
          <div className="text-sm font-medium text-ink">当前检索状态</div>
          <div className="mt-1 text-xs leading-6 text-subtext">{nextStepText}</div>
        </div>
        <div className="text-xs text-subtext">
          {status ? `服务状态：${status.enabled ? "已启用" : "未启用"} | 优先后端：${formatRagBackendLabel(status.backend_preferred)}` : null}
        </div>
      </div>
      {status ? (
        <div className="studio-overview-grid lg:grid-cols-3">
          <div className="studio-overview-card is-emphasis">
            <div className="studio-overview-label">知识库服务</div>
            <div className="studio-overview-value">{statusSummary}</div>
            <div className="studio-overview-copy">
              {status.enabled ? "服务已启用，可以继续做命中验证。" : `当前不可用：${formatRagDisabledReason(status.disabled_reason)}`}
            </div>
          </div>
          <div className="studio-overview-card">
            <div className="studio-overview-label">检索链路</div>
            <div className="studio-overview-value">{retrievalSummary}</div>
            <div className="studio-overview-copy">
              检索后端：{formatRagBackendLabel(status.backend_preferred)} | 混合检索：
              {status.hybrid_enabled ? "已启用" : "未启用"}
            </div>
          </div>
          <div className="studio-overview-card">
            <div className="studio-overview-label">命中规模</div>
            <div className="studio-overview-value">{countsSummary}</div>
            <div className="studio-overview-copy">
              {status.counts
                ? `返回候选 ${status.counts.candidates_returned} · 丢弃 ${status.counts.dropped_total}`
                : "实际运行查询后，这里会显示候选与最终保留片段数量。"}
            </div>
          </div>
        </div>
      ) : (
        <FeedbackEmptyState
          className="mt-3 rounded-atelier border border-dashed border-border bg-canvas"
          title="还没有状态结果"
          description="点击“刷新状态”获取当前知识库与检索链路状态。"
        />
      )}
      {status ? (
        <div className="mt-4 grid gap-3 text-xs text-subtext">
          {indexDirty ? (
            <FeedbackCallout tone="warning" title="索引状态仍需更新">
              当前索引还需要更新，说明资料已经变更但检索索引还没完全跟上。建议先更新索引，再判断命中结果是否准确。
            </FeedbackCallout>
          ) : (
            <FeedbackCallout title="索引状态看起来正常">
              索引状态看起来是最新的，可以继续到下方做真实查询验证。
            </FeedbackCallout>
          )}
          {rerankObs ? (
            <div className="studio-overview-card">
              <div className="studio-overview-label">重排结果摘要</div>
              <div className="studio-overview-value">观察排序是否合理</div>
              <div className="studio-overview-copy">{formatRerankSummary(rerankObs)}</div>
            </div>
          ) : null}
          <FeedbackDisclosure
            className="rounded-atelier border border-border bg-canvas p-3"
            summaryClassName="px-0 py-0 text-xs"
            bodyClassName="pt-2"
            title="原始 status 结果（raw）"
          >
            <pre className="mt-2 max-h-80 overflow-auto text-[11px] leading-4 text-subtext">{safeJson(status)}</pre>
          </FeedbackDisclosure>
        </div>
      ) : null}
    </section>
  );
}
