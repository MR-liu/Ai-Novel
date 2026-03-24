import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { DebugDetails, DebugPageShell } from "../components/atelier/DebugPageShell";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { Badge } from "../components/ui/Badge";
import { FeedbackCallout, FeedbackEmptyState, FeedbackStateCard } from "../components/ui/Feedback";
import { RequestIdBadge } from "../components/ui/RequestIdBadge";
import { useToast } from "../components/ui/toast";
import { copyText } from "../lib/copyText";
import { buildStudioSystemPath } from "../lib/projectRoutes";
import { UI_COPY } from "../lib/uiCopy";
import { ApiError, apiJson } from "../services/apiClient";
import { RESEARCH_WORKBENCH_COPY } from "./researchWorkbenchModels";

type GraphNode = {
  id: string;
  entity_type: string;
  name: string;
  summary_md?: string | null;
  attributes?: Record<string, unknown>;
  matched?: boolean;
};

type GraphEdge = {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  from_name?: string;
  to_name?: string;
  relation_type: string;
  description_md?: string | null;
  attributes?: Record<string, unknown>;
};

type GraphEvidence = {
  id: string;
  source_type: string;
  source_id?: string | null;
  quote_md: string;
  attributes?: Record<string, unknown>;
  created_at?: string;
};

type GraphQueryResult = {
  enabled: boolean;
  disabled_reason?: string | null;
  error?: string;
  query_text: string;
  matched?: { entity_ids: string[]; entity_names: string[] };
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidence: GraphEvidence[];
  truncated?: { nodes?: boolean; edges?: boolean };
  prompt_block?: { identifier: string; role: string; text_md: string };
  timings_ms?: Record<string, number>;
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function GraphPage() {
  const { projectId } = useParams();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const chapterId = String(searchParams.get("chapterId") || "").trim() || null;

  const [enabled, setEnabled] = useState(true);
  const [queryText, setQueryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<GraphQueryResult | null>(null);

  const [autoUpdateFocus, setAutoUpdateFocus] = useState("");
  const [autoUpdateLoading, setAutoUpdateLoading] = useState(false);
  const [lastAutoUpdateTaskId, setLastAutoUpdateTaskId] = useState<string | null>(null);

  const injectionPreviewText = useMemo(
    () => (result?.prompt_block?.text_md ?? "").trim(),
    [result?.prompt_block?.text_md],
  );
  const advancedDebugText = useMemo(() => safeJson(result), [result]);

  const copyPreviewBlock = useCallback(
    async (text: string, opts: { emptyMessage: string; successMessage: string; dialogTitle: string }) => {
      if (!text.trim()) {
        toast.toastError(opts.emptyMessage, requestId ?? undefined);
        return;
      }
      const ok = await copyText(text, { title: opts.dialogTitle });
      if (ok) toast.toastSuccess(opts.successMessage, requestId ?? undefined);
      else toast.toastWarning("自动复制失败：已打开手动复制弹窗。", requestId ?? undefined);
    },
    [requestId, toast],
  );

  const matchedIds = useMemo(() => new Set(result?.matched?.entity_ids ?? []), [result?.matched?.entity_ids]);

  const characterRelationsHref = useMemo(() => {
    if (!projectId) return "";
    const params = new URLSearchParams();
    params.set("view", "character-relations");
    if (chapterId) params.set("chapterId", chapterId);
    return `${buildStudioSystemPath(projectId, "structured-memory")}?${params.toString()}`;
  }, [chapterId, projectId]);

  const taskCenterHref = useMemo(() => {
    if (!projectId) return "";
    if (!lastAutoUpdateTaskId) return buildStudioSystemPath(projectId, "tasks");
    const params = new URLSearchParams();
    params.set("project_task_id", lastAutoUpdateTaskId);
    return `${buildStudioSystemPath(projectId, "tasks")}?${params.toString()}`;
  }, [lastAutoUpdateTaskId, projectId]);

  const triggerGraphAutoUpdate = useCallback(async () => {
    if (!projectId) return;
    if (!chapterId) {
      toast.toastError(UI_COPY.graph.autoUpdateMissingChapterId);
      return;
    }

    setAutoUpdateLoading(true);
    try {
      const res = await apiJson<{ task_id: string }>(`/api/projects/${projectId}/graph/auto_update`, {
        method: "POST",
        body: JSON.stringify({
          chapter_id: chapterId,
          focus: autoUpdateFocus.trim() ? autoUpdateFocus.trim() : null,
        }),
      });
      const taskId = String(res.data?.task_id ?? "").trim();
      if (taskId) setLastAutoUpdateTaskId(taskId);
      toast.toastSuccess(UI_COPY.graph.autoUpdateCreatedToast, res.request_id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setAutoUpdateLoading(false);
    }
  }, [autoUpdateFocus, chapterId, projectId, toast]);

  const runQuery = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<{ result: GraphQueryResult }>(`/api/projects/${projectId}/graph/query`, {
        method: "POST",
        body: JSON.stringify({
          query_text: queryText,
          enabled,
          hop: 1,
          max_nodes: 40,
          max_edges: 120,
        }),
      });
      setResult(res.data?.result ?? null);
      setRequestId(res.request_id ?? null);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setError(err);
      setRequestId(err.requestId ?? null);
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setLoading(false);
    }
  }, [enabled, projectId, queryText, toast]);

  useEffect(() => {
    if (!projectId) return;
    void runQuery();
  }, [projectId, runQuery]);

  const statusText = result
    ? result.enabled
      ? "已启用"
      : `未启用（${result.disabled_reason ?? "未知原因"}）`
    : "未查询";
  const querySummary = (result?.query_text ?? queryText).trim() || "尚未输入关系线索";
  const matchedCount = result?.matched?.entity_ids?.length ?? 0;
  const totalObjects = (result?.nodes?.length ?? 0) + (result?.edges?.length ?? 0) + (result?.evidence?.length ?? 0);
  const autoUpdateStatus = !chapterId
    ? "需要从具体章节进入后才能回写"
    : lastAutoUpdateTaskId
      ? "已创建回写任务，建议继续去任务中心观察结果"
      : "当前可直接发起图谱回写任务";
  const nextStepText = !result
    ? "先运行一次关系排查，确认人物、关系和证据有没有命中。"
    : matchedCount === 0
      ? "本次没有命中关键实体，建议改用“人物 + 关系 + 事件”短句再查一次。"
      : lastAutoUpdateTaskId
        ? "命中结果已经足够明确时，下一步更适合去任务中心观察回写是否完成。"
        : "先核对节点、关系与证据是否可信，再决定要不要发起图谱自动更新。";

  if (!projectId)
    return (
      <FeedbackStateCard
        tone="danger"
        kicker="关系排查台"
        title="当前无法打开图谱排查"
        description="缺少 `projectId`，请从具体项目进入后再查询人物、关系和证据。"
      />
    );

  return (
    <DebugPageShell
      eyebrow="资料检索 / 图谱"
      title="关系排查台"
      description="从图谱视角排查人物、实体、关系和证据是怎样被识别并回流到生成上下文里的，适合在写前核对和写后排障。"
      whenToUse="怀疑人物关系、阵营立场、世界规则或关键证据被识别错了，或者想确认某段文字会命中哪些关系时。"
      outcome="你会得到命中节点、关系线、证据摘录和下一步回写入口，更容易判断问题出在抽取、关系还是证据。"
      risk="这里会暴露较多底层证据和内部结果，适合短时排查，不适合代替日常写作界面。"
      actions={
        <>
          <label className="flex items-center gap-2 text-xs text-subtext">
            <input
              className="checkbox"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              aria-label="graph_enabled"
            />
            {UI_COPY.graph.enabledToggle}
          </label>
          <button className="btn btn-secondary" onClick={() => void runQuery()} disabled={loading} type="button">
            {loading ? "查询..." : UI_COPY.graph.queryRun}
          </button>
          {projectId ? (
            <Link className="btn btn-secondary" to={characterRelationsHref} aria-label="graph_open_character_relations">
              人物关系编辑
            </Link>
          ) : null}
        </>
      }
    >
      <DebugDetails title={UI_COPY.help.title}>
        <div className="grid gap-2 text-xs text-subtext">
          <div>{UI_COPY.graph.usageHint}</div>
          <div>{UI_COPY.graph.exampleHint}</div>
          <FeedbackCallout className="text-xs" tone="warning" title="风险提醒">
            {UI_COPY.graph.riskHint}
          </FeedbackCallout>
        </div>
      </DebugDetails>

      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">{nextStepText}</div>
          <div className="text-xs text-subtext">
            建议顺序：先排查命中结果，再核对证据，最后决定是否把确认后的关系回写到系统。
          </div>
        </div>
        <div className="manuscript-status-list">
          <span className="manuscript-chip">图谱状态：{statusText}</span>
          <span className="manuscript-chip max-w-[240px] truncate" title={querySummary}>
            当前查询：{querySummary}
          </span>
          <span className="manuscript-chip">命中实体：{matchedCount}</span>
          <span className="manuscript-chip">待看对象：{totalObjects}</span>
          <span className="manuscript-chip max-w-[280px] truncate" title={autoUpdateStatus}>
            回写状态：{autoUpdateStatus}
          </span>
        </div>
      </section>

      <ResearchWorkbenchPanel {...RESEARCH_WORKBENCH_COPY.graph} variant="compact" />

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">先确认这次要排查哪条关系线</div>
            <div className="studio-cluster-copy">
              输入一段文本、角色名或关系片段，看看图谱会识别出哪些实体、关系和证据。问题写得越具体，越容易判断抽取是否靠谱。
            </div>
          </div>
          <div className="studio-cluster-meta">hop 1 · max nodes 40 · max edges 120</div>
        </div>
        <FeedbackCallout className="mt-4" title="推荐写法">
          用“角色 + 关系 + 事件”短句做查询，例如“Alice 怀疑 Bob 背叛队伍”，比只搜单个名字更容易暴露关系抽取问题。
        </FeedbackCallout>
        <label className="mt-4 block">
          <div className="text-xs text-subtext">{UI_COPY.graph.queryTextLabel}</div>
          <input
            className="input mt-1"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder={UI_COPY.graph.queryTextPlaceholder}
            aria-label="graph_query_text"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtext">
          <span>示例：</span>
          <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setQueryText("Alice")} type="button">
            Alice
          </button>
          <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setQueryText("Bob")} type="button">
            Bob
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">把确认后的关系写回系统</div>
            <div className="studio-cluster-copy">
              当你已经确认哪一章需要回写关系或实体时，可以直接从这里创建更新任务，不必回到别的页面绕一圈。
            </div>
          </div>
          <div className="studio-cluster-meta">{chapterId ? `章节 ID（chapter_id）:${chapterId}` : "缺少章节 ID（chapter_id）"}</div>
        </div>
        {!chapterId ? (
          <FeedbackCallout className="mt-4" tone="warning" title="缺少章节上下文">
            当前没有章节上下文。建议从写作页、校对页或带 `chapterId` 的图谱入口进入，这样才能把关系更新精准写回对应章节。
          </FeedbackCallout>
        ) : (
          <FeedbackCallout className="mt-4" title="回写前确认">
            只有在你已经确认节点、关系和证据都可信时，再创建回写任务。这样可以减少无效更新进入连续性底座。
          </FeedbackCallout>
        )}
        <div className="mt-4 rounded-atelier border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-ink">{UI_COPY.graph.autoUpdateTitle}</div>
            <button
              className="btn btn-secondary"
              disabled={autoUpdateLoading || !projectId || !chapterId}
              onClick={() => void triggerGraphAutoUpdate()}
              type="button"
            >
              {autoUpdateLoading ? "创建中..." : UI_COPY.graph.autoUpdateCreateButton}
            </button>
          </div>
          <div className="mt-1 text-xs text-subtext">
            章节 ID（chapter_id）: {chapterId ?? "（缺少）"}
            {!chapterId ? (
              <Badge className="ml-2" tone="warning">
                {UI_COPY.graph.autoUpdateMissingChapterId}
              </Badge>
            ) : null}
          </div>
          <label className="mt-3 grid gap-1">
            <span className="text-xs text-subtext">{UI_COPY.graph.autoUpdateFocusLabel}</span>
            <input
              className="input"
              value={autoUpdateFocus}
              disabled={autoUpdateLoading}
              onChange={(e) => setAutoUpdateFocus(e.target.value)}
              placeholder={UI_COPY.graph.autoUpdateFocusPlaceholder}
              aria-label="graph_auto_update_focus"
            />
          </label>
          {lastAutoUpdateTaskId ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="min-w-0 text-subtext">
                {UI_COPY.graph.autoUpdateLastTaskIdLabel}:{" "}
                <span className="font-mono text-ink">{lastAutoUpdateTaskId}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link className="btn btn-secondary" to={taskCenterHref} aria-label="graph_open_task_center">
                  {UI_COPY.graph.autoUpdateOpenTaskCenter}
                </Link>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    void copyPreviewBlock(lastAutoUpdateTaskId, {
                      emptyMessage: "没有可复制的任务 ID（task_id）",
                      successMessage: "已复制任务 ID（task_id）",
                      dialogTitle: "复制失败：请手动复制任务 ID（task_id）",
                    })
                  }
                  type="button"
                >
                  {UI_COPY.graph.autoUpdateCopyTaskId}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {error ? (
        <FeedbackCallout className="text-xs" tone="danger" title="图谱查询失败">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {error.message} ({error.code})
            </div>
            <RequestIdBadge requestId={error.requestId} />
          </div>
        </FeedbackCallout>
      ) : null}

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">这次命中了什么</div>
            <div className="studio-cluster-copy">
              先看整体状态和命中规模，再决定是去读注入预览、检查关系线，还是直接回人物关系编辑。
            </div>
          </div>
          <div className="studio-cluster-meta">{totalObjects} 个对象</div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-atelier border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-ink">{UI_COPY.graph.overviewTitle}</div>
              <RequestIdBadge requestId={requestId} />
            </div>
            <div className="mt-1 text-xs text-subtext">
              状态：{statusText} | 节点：{result?.nodes?.length ?? 0} | 关系：{result?.edges?.length ?? 0} | 证据：
              {result?.evidence?.length ?? 0}
            </div>
            {result?.error ? (
              <FeedbackCallout className="mt-3" tone="warning" title="图谱返回提醒">
                图谱返回错误：{result.error}
              </FeedbackCallout>
            ) : null}
          </div>
          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="text-sm text-ink">作者判断提示</div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              如果节点很多但关系很少，通常说明实体识别到了，但关系抽取还不够稳定；如果证据很多但命中人物为空，优先检查查询句是否过于宽泛。
            </div>
          </div>
        </div>

        <DebugDetails title="生成前会注入哪些关系摘要" defaultOpen>
          <div className="flex items-center justify-end">
            <button
              className="btn btn-secondary btn-sm"
              disabled={!injectionPreviewText}
              onClick={() =>
                void copyPreviewBlock(injectionPreviewText, {
                  emptyMessage: "没有可复制的注入预览",
                  successMessage: "已复制注入预览",
                  dialogTitle: "复制失败：请手动复制注入预览",
                })
              }
              type="button"
            >
              {UI_COPY.common.copy}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-4 text-subtext">
            {injectionPreviewText || "（空）"}
          </pre>
        </DebugDetails>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-atelier border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-ink">命中的角色与实体</div>
              <div className="text-xs text-subtext">
                {UI_COPY.graph.matchedLabel}: {(result?.matched?.entity_ids ?? []).length}
                {result?.truncated?.nodes ? " | 结果已截断（truncated）" : ""}
              </div>
            </div>
            <div className="mt-2 grid gap-2">
              {(result?.nodes ?? []).map((n) => (
                <div
                  key={n.id}
                  className={
                    "rounded-atelier border border-border p-2 text-xs " +
                    (matchedIds.has(n.id) ? "bg-accent/10 text-ink" : "bg-surface text-subtext")
                  }
                >
                  <div className="text-ink">
                    [{n.entity_type}] {n.name}
                  </div>
                  {n.summary_md ? <div className="mt-1 line-clamp-3 text-[11px] leading-5">{n.summary_md}</div> : null}
                  <div className="mt-0.5 text-[11px] text-subtext">{n.id}</div>
                  {matchedIds.has(n.id) ? (
                    <div className="mt-2 text-[11px] font-medium text-accent">本次查询明确命中</div>
                  ) : null}
                </div>
              ))}
              {(result?.nodes ?? []).length === 0 ? (
                <FeedbackEmptyState
                  variant="compact"
                  title="这次没有命中实体"
                  description="可以改用“人物 + 关系 + 事件”短句重试，通常比只输一个名字更容易暴露关系抽取问题。"
                  actions={
                    <button
                      className="btn btn-secondary btn-sm"
                      aria-label="graph_empty_state_run"
                      onClick={() => void runQuery()}
                      disabled={loading}
                      type="button"
                    >
                      {loading ? "查询..." : UI_COPY.graph.queryRun}
                    </button>
                  }
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-atelier border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-ink">识别出的关系线</div>
              <div className="text-xs text-subtext">
                {result?.truncated?.edges ? "结果已截断（truncated）" : ""}
              </div>
            </div>
            <div className="mt-2 grid gap-2">
              {(result?.edges ?? []).map((e) => (
                <div key={e.id} className="rounded-atelier border border-border bg-surface p-2 text-xs">
                  <div className="text-ink">
                    {e.from_name || e.from_entity_id} --({e.relation_type})→ {e.to_name || e.to_entity_id}
                  </div>
                  {e.description_md ? <div className="mt-1 text-subtext">{e.description_md}</div> : null}
                  {typeof e.attributes?.context_md === "string" && e.attributes.context_md.trim() ? (
                    <div className="mt-1 whitespace-pre-wrap text-subtext">语境：{e.attributes.context_md}</div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-subtext">id: {e.id}</div>
                    {projectId ? (
                      <Link
                        className="btn btn-secondary btn-sm"
                        to={`${buildStudioSystemPath(projectId, "structured-memory")}?${(() => {
                          const params = new URLSearchParams();
                          params.set("view", "character-relations");
                          params.set("relationId", String(e.id));
                          if (chapterId) params.set("chapterId", chapterId);
                          return params.toString();
                        })()}`}
                        aria-label={`graph_open_relation_editor_${e.id}`}
                      >
                        打开编辑/证据
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
              {(result?.edges ?? []).length === 0 ? (
                <FeedbackEmptyState
                  variant="compact"
                  title="这次没有识别出关系线"
                  description="如果实体已经命中但关系为空，通常说明查询太宽泛，或关系抽取还需要更明确的上下文。"
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-atelier border border-border bg-surface p-3">
          <div className="studio-cluster-header">
            <div className="text-sm text-ink">命中证据摘录</div>
            <div className="studio-cluster-meta">最多展示 12 条命中证据</div>
          </div>
          <div className="mt-2 grid gap-2">
            {(result?.evidence ?? []).slice(0, 12).map((ev) => (
              <div key={ev.id} className="rounded-atelier border border-border bg-surface p-2 text-xs">
                <div className="text-ink">
                  来源：{ev.source_type}:{ev.source_id ?? "-"}
                </div>
                <div className="mt-1 text-subtext">{ev.quote_md || "（空）"}</div>
              </div>
            ))}
            {(result?.evidence ?? []).length === 0 ? (
              <FeedbackEmptyState
                variant="compact"
                title="这次没有找到证据摘录"
                description="如果关系或实体存在但证据为空，可以检查来源章节是否还没被纳入，或换一段更具体的查询文本再试一次。"
              />
            ) : null}
          </div>
        </div>
      </section>

      <DebugDetails title="仅在排障时查看原始调试结果（Debug JSON）">
        <div className="flex items-center justify-end">
          <button
            className="btn btn-secondary btn-sm"
            disabled={!result}
            onClick={() =>
              void copyPreviewBlock(advancedDebugText, {
                emptyMessage: "还没有可复制的原始调试结果（Debug JSON）",
                successMessage: "已复制原始调试结果（Debug JSON）",
                dialogTitle: "复制失败：请手动复制原始调试结果（Debug JSON）",
              })
            }
            type="button"
          >
            {UI_COPY.common.copy}
          </button>
        </div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-[11px] leading-4 text-subtext">
          {advancedDebugText}
        </pre>
      </DebugDetails>
    </DebugPageShell>
  );
}
