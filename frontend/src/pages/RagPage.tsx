import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { DebugDetails, DebugPageShell } from "../components/atelier/DebugPageShell";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { FeedbackCallout } from "../components/ui/Feedback";
import { RequestIdBadge } from "../components/ui/RequestIdBadge";
import { useToast } from "../components/ui/toast";
import { useProjectData } from "../hooks/useProjectData";
import { buildStudioAiPath, buildStudioResearchPath } from "../lib/projectRoutes";
import { UI_COPY } from "../lib/uiCopy";
import { formatIndexStateLabel, formatRagDisabledReason } from "../lib/vectorRagCopy";
import { ApiError, apiJson } from "../services/apiClient";
import type { ProjectSettings } from "../types";
import { RagAdvancedDebugPanel } from "./rag/RagAdvancedDebugPanel";
import { RagKnowledgeBasePanel } from "./rag/RagKnowledgeBasePanel";
import { RagQueryPanel } from "./rag/RagQueryPanel";
import { RagStatusPanel } from "./rag/RagStatusPanel";
import type { KnowledgeBase, VectorRagResult, VectorSource } from "./rag/types";
import { formatIsoToLocal } from "./rag/utils";
import { RESEARCH_WORKBENCH_COPY } from "./researchWorkbenchModels";

export function RagPage() {
  const { projectId } = useParams();
  const toast = useToast();

  const settingsQuery = useProjectData<ProjectSettings>(projectId, async (id) => {
    const res = await apiJson<{ settings: ProjectSettings }>(`/api/projects/${id}/settings`);
    return res.data.settings;
  });

  const [rerankEnabled, setRerankEnabled] = useState(false);
  const [rerankMethod, setRerankMethod] = useState("auto");
  const [rerankTopK, setRerankTopK] = useState(20);
  const [rerankHybridAlpha, setRerankHybridAlpha] = useState(0);
  const [rerankSaving, setRerankSaving] = useState(false);

  const [sources, setSources] = useState<VectorSource[]>(["worldbook", "outline", "chapter", "story_memory"]);
  const [queryText, setQueryText] = useState("");

  const [superSortMode, setSuperSortMode] = useState<"disabled" | "order" | "weights">("disabled");
  const [superSortOrderText, setSuperSortOrderText] = useState("worldbook,outline,chapter,story_memory");
  const [superSortWeights, setSuperSortWeights] = useState({ worldbook: 1, outline: 1, chapter: 1 });

  const [kbLoading, setKbLoading] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [kbDraftById, setKbDraftById] = useState<Record<string, Pick<KnowledgeBase, "name" | "enabled" | "weight">>>(
    {},
  );
  const [kbDirtyById, setKbDirtyById] = useState<Record<string, boolean>>({});
  const [kbOrderDirty, setKbOrderDirty] = useState(false);
  const [kbDragId, setKbDragId] = useState<string | null>(null);
  const [kbCreateName, setKbCreateName] = useState("");
  const [kbCreateLoading, setKbCreateLoading] = useState(false);
  const [kbSaveLoadingId, setKbSaveLoadingId] = useState<string | null>(null);
  const [kbDeleteLoadingId, setKbDeleteLoadingId] = useState<string | null>(null);

  const [statusLoading, setStatusLoading] = useState(false);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [rebuildLoading, setRebuildLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);

  const [status, setStatus] = useState<VectorRagResult | null>(null);
  const [ingestResult, setIngestResult] = useState<unknown>(null);
  const [rebuildResult, setRebuildResult] = useState<unknown>(null);
  const [queryResult, setQueryResult] = useState<VectorRagResult | null>(null);
  const [queryRequestId, setQueryRequestId] = useState<string | null>(null);
  const [rawQueryText, setRawQueryText] = useState<string | null>(null);
  const [normalizedQueryText, setNormalizedQueryText] = useState<string | null>(null);
  const [queryPreprocessObs, setQueryPreprocessObs] = useState<unknown>(null);

  const [debugOpen, setDebugOpen] = useState(false);
  const [lastOpRequestId, setLastOpRequestId] = useState<string | null>(null);
  const [lastOp, setLastOp] = useState<"status" | "ingest" | "rebuild" | null>(null);

  const busy = statusLoading || ingestLoading || rebuildLoading || queryLoading || rerankSaving;

  const vectorIndexDirty = status?.index ? Boolean(status.index.dirty) : null;
  const lastVectorBuildAt = status?.index ? (status.index.last_build_at ?? null) : null;
  const vectorEnabled = status ? Boolean(status.enabled) : null;
  const vectorDisabledReason = status && typeof status.disabled_reason === "string" ? status.disabled_reason : null;
  const querySummary = (normalizedQueryText ?? rawQueryText ?? queryText).trim() || "尚未输入验证片段";
  const queryHitCount = queryResult?.counts?.final_selected ?? 0;
  const ragNextStepText =
    kbs.length === 0
      ? "先创建并启用至少一个知识库，再同步资料。"
      : selectedKbIds.length === 0
        ? "先勾选至少一个参与查询的知识库，再验证命中结果。"
        : vectorIndexDirty === true && vectorEnabled === false
          ? "索引需要更新，但召回服务还不可用，先去模型与连接确认配置。"
          : vectorIndexDirty
            ? "索引已经落后于资料状态，建议先重建再查。"
            : queryResult
              ? "先看最终命中片段和注入文本，再决定要不要继续调参数。"
              : "链路状态正常后，拿一段真实写作片段做一次查询验证。";
  const indexSummary = vectorIndexDirty === null ? "状态加载中" : vectorIndexDirty ? "待更新" : "最新";

  useEffect(() => {
    if (ingestLoading || rebuildLoading || ingestResult || rebuildResult) setDebugOpen(true);
  }, [ingestLoading, ingestResult, rebuildLoading, rebuildResult]);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setRerankEnabled(Boolean(settingsQuery.data.vector_rerank_effective_enabled));
    setRerankMethod(String(settingsQuery.data.vector_rerank_effective_method ?? "auto") || "auto");
    setRerankTopK(Number(settingsQuery.data.vector_rerank_effective_top_k ?? 20) || 20);
  }, [settingsQuery.data]);

  const applyRerank = useCallback(async () => {
    if (!projectId) return;
    setRerankSaving(true);
    try {
      const method = rerankMethod.trim() || "auto";
      const topK = Math.max(1, Math.min(1000, Math.floor(rerankTopK)));
      const res = await apiJson<{ settings: ProjectSettings }>(`/api/projects/${projectId}/settings`, {
        method: "PUT",
        body: JSON.stringify({
          vector_rerank_enabled: Boolean(rerankEnabled),
          vector_rerank_method: method,
          vector_rerank_top_k: topK,
        }),
      });
      settingsQuery.setData(res.data.settings);
      toast.toastSuccess("已更新结果排序策略", res.request_id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setRerankSaving(false);
    }
  }, [projectId, rerankEnabled, rerankMethod, rerankTopK, settingsQuery, toast]);

  const toggleSource = useCallback((src: VectorSource) => {
    setSources((prev) => (prev.includes(src) ? prev.filter((v) => v !== src) : [...prev, src]));
  }, []);

  const sortedSources = useMemo(
    () =>
      (["worldbook", "outline", "chapter", "story_memory"] as const).filter((s) =>
        sources.includes(s),
      ) as VectorSource[],
    [sources],
  );

  const loadKbs = useCallback(async () => {
    if (!projectId) return;
    setKbLoading(true);
    try {
      const res = await apiJson<{ kbs: KnowledgeBase[] }>(`/api/projects/${projectId}/vector/kbs`);
      const list = Array.isArray(res.data?.kbs) ? res.data.kbs : [];
      setKbs(list);
      setKbDraftById((prev) => {
        const next = { ...prev };
        for (const kb of list) {
          if (!next[kb.kb_id]) next[kb.kb_id] = { name: kb.name, enabled: kb.enabled, weight: kb.weight };
        }
        return next;
      });
      setKbDirtyById((prev) => {
        const next = { ...prev };
        for (const kb of list) {
          if (!(kb.kb_id in next)) next[kb.kb_id] = false;
        }
        return next;
      });
      setSelectedKbIds((prev) => {
        const valid = prev.filter((id) => list.some((kb) => kb.kb_id === id));
        if (valid.length) return valid;
        const enabledIds = list.filter((kb) => kb.enabled).map((kb) => kb.kb_id);
        return enabledIds.length ? enabledIds : list.length ? [list[0].kb_id] : [];
      });
      setKbOrderDirty(false);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setKbLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    if (!projectId) return;
    void loadKbs();
  }, [loadKbs, projectId]);

  const toggleKbSelected = useCallback((kbId: string) => {
    const kid = String(kbId || "").trim();
    if (!kid) return;
    setSelectedKbIds((prev) => (prev.includes(kid) ? prev.filter((v) => v !== kid) : [...prev, kid]));
  }, []);

  const updateKbDraft = useCallback(
    (kbId: string, patch: Partial<Pick<KnowledgeBase, "name" | "enabled" | "weight">>) => {
      const kid = String(kbId || "").trim();
      if (!kid) return;
      setKbDraftById((prev) => ({ ...prev, [kid]: { ...prev[kid], ...patch } }));
      setKbDirtyById((prev) => ({ ...prev, [kid]: true }));
    },
    [],
  );

  const createKb = useCallback(async () => {
    if (!projectId) return;
    const name = kbCreateName.trim();
    if (!name) {
      toast.toastError("请先填写知识库名称");
      return;
    }
    setKbCreateLoading(true);
    try {
      const res = await apiJson<{ kb: KnowledgeBase }>(`/api/projects/${projectId}/vector/kbs`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      toast.toastSuccess("已新建知识库", res.request_id);
      setKbCreateName("");
      await loadKbs();
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setKbCreateLoading(false);
    }
  }, [kbCreateName, loadKbs, projectId, toast]);

  const saveKb = useCallback(
    async (kbId: string) => {
      if (!projectId) return;
      const kid = String(kbId || "").trim();
      if (!kid) return;
      const draft = kbDraftById[kid];
      if (!draft) {
        toast.toastError("知识库列表还没加载完成，请先刷新");
        return;
      }
      setKbSaveLoadingId(kid);
      try {
        const res = await apiJson<{ kb: KnowledgeBase }>(
          `/api/projects/${projectId}/vector/kbs/${encodeURIComponent(kid)}`,
          {
            method: "PUT",
            body: JSON.stringify({ name: draft.name, enabled: draft.enabled, weight: draft.weight }),
          },
        );
        setKbs((prev) => prev.map((kb) => (kb.kb_id === kid ? res.data.kb : kb)));
        setKbDraftById((prev) => ({
          ...prev,
          [kid]: { name: res.data.kb.name, enabled: res.data.kb.enabled, weight: res.data.kb.weight },
        }));
        setKbDirtyById((prev) => ({ ...prev, [kid]: false }));
        toast.toastSuccess("知识库已保存", res.request_id);
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setKbSaveLoadingId(null);
      }
    },
    [kbDraftById, projectId, toast],
  );

  const deleteKb = useCallback(
    async (kbId: string) => {
      if (!projectId) return;
      const kid = String(kbId || "").trim();
      if (!kid) return;
      setKbDeleteLoadingId(kid);
      try {
        const res = await apiJson<{ deleted: boolean }>(
          `/api/projects/${projectId}/vector/kbs/${encodeURIComponent(kid)}`,
          {
            method: "DELETE",
          },
        );
        toast.toastSuccess("知识库已删除", res.request_id);
        await loadKbs();
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setKbDeleteLoadingId(null);
      }
    },
    [loadKbs, projectId, toast],
  );

  const saveKbOrder = useCallback(async () => {
    if (!projectId) return;
    const ids = kbs.map((kb) => kb.kb_id);
    if (!ids.length) return;
    setKbLoading(true);
    try {
      const res = await apiJson<{ kbs: KnowledgeBase[] }>(`/api/projects/${projectId}/vector/kbs/reorder`, {
        method: "POST",
        body: JSON.stringify({ kb_ids: ids }),
      });
      setKbs(res.data.kbs ?? []);
      setKbOrderDirty(false);
      toast.toastSuccess("知识库顺序已保存", res.request_id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setKbLoading(false);
    }
  }, [kbs, projectId, toast]);

  const moveKb = useCallback((fromKbId: string, toKbId: string) => {
    const from = String(fromKbId || "").trim();
    const to = String(toKbId || "").trim();
    if (!from || !to || from === to) return;
    setKbs((prev) => {
      const items = [...prev];
      const fromIdx = items.findIndex((kb) => kb.kb_id === from);
      const toIdx = items.findIndex((kb) => kb.kb_id === to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [item] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, item);
      return items.map((kb, idx) => ({ ...kb, order: idx }));
    });
    setKbOrderDirty(true);
  }, []);

  const runStatus = useCallback(
    async (opts?: { updateRequestId?: boolean }) => {
      if (!projectId) return;
      if (sortedSources.length === 0) {
        toast.toastError("请至少选择一个资料来源");
        return;
      }
      setStatusLoading(true);
      try {
        const res = await apiJson<{ result: VectorRagResult }>(`/api/projects/${projectId}/vector/status`, {
          method: "POST",
          body: JSON.stringify({ sources: sortedSources }),
        });
        setStatus(res.data?.result ?? null);
        if (opts?.updateRequestId ?? true) {
          setLastOpRequestId(res.request_id ?? null);
          setLastOp("status");
        }
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setStatusLoading(false);
      }
    },
    [projectId, sortedSources, toast],
  );

  useEffect(() => {
    if (!projectId) return;
    if (sortedSources.length === 0) return;
    void runStatus();
  }, [projectId, runStatus, sortedSources]);

  const runIngest = useCallback(async () => {
    if (!projectId) return;
    if (sortedSources.length === 0) {
      toast.toastError("请至少选择一个资料来源");
      return;
    }
    setIngestLoading(true);
    try {
      const res = await apiJson<{ result: unknown }>(`/api/projects/${projectId}/vector/ingest`, {
        method: "POST",
        body: JSON.stringify({ sources: sortedSources, kb_ids: selectedKbIds }),
      });
      setIngestResult(res.data?.result ?? null);
      setLastOpRequestId(res.request_id ?? null);
      setLastOp("ingest");
      toast.toastSuccess("已开始同步资料到知识库", res.request_id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setIngestLoading(false);
    }
  }, [projectId, selectedKbIds, sortedSources, toast]);

  const runRebuild = useCallback(async () => {
    if (!projectId) return;
    if (sortedSources.length === 0) {
      toast.toastError("请至少选择一个资料来源");
      return;
    }
    setRebuildLoading(true);
    try {
      const res = await apiJson<{ result: unknown }>(`/api/projects/${projectId}/vector/rebuild`, {
        method: "POST",
        body: JSON.stringify({ sources: sortedSources, kb_ids: selectedKbIds }),
      });
      const result = res.data?.result ?? null;
      setRebuildResult(result);
      if (result && typeof result === "object") {
        const out = result as Record<string, unknown>;
        const enabled = Boolean(out.enabled);
        const skipped = Boolean(out.skipped);
        const disabledReason = typeof out.disabled_reason === "string" ? out.disabled_reason : null;
        const error = typeof out.error === "string" ? out.error : null;
        if (!enabled || skipped) {
          toast.toastError(
            `这次索引更新没有执行：${formatRagDisabledReason(disabledReason) || error || "请稍后重试"}`,
            res.request_id,
          );
        } else {
          toast.toastSuccess("已开始更新检索索引", res.request_id);
        }
      } else {
        toast.toastSuccess("已开始更新检索索引", res.request_id);
      }
      setLastOpRequestId(res.request_id ?? null);
      setLastOp("rebuild");
      await runStatus({ updateRequestId: false });
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setRebuildLoading(false);
    }
  }, [projectId, runStatus, selectedKbIds, sortedSources, toast]);

  const runQuery = useCallback(async () => {
    if (!projectId) return;
    if (sortedSources.length === 0) {
      toast.toastError("请至少选择一个资料来源");
      return;
    }
    setQueryLoading(true);
    try {
      const superSort =
        superSortMode === "order"
          ? {
              enabled: true,
              source_order: superSortOrderText
                .split(/[\\s,|;]+/g)
                .map((s) => s.trim())
                .filter(
                  (s): s is VectorSource =>
                    s === "worldbook" || s === "outline" || s === "chapter" || s === "story_memory",
                ),
            }
          : superSortMode === "weights"
            ? { enabled: true, source_weights: superSortWeights }
            : null;

      const res = await apiJson<{
        result: VectorRagResult;
        raw_query_text?: unknown;
        normalized_query_text?: unknown;
        preprocess_obs?: unknown;
      }>(`/api/projects/${projectId}/vector/query`, {
        method: "POST",
        body: JSON.stringify({
          query_text: queryText,
          sources: sortedSources,
          kb_ids: selectedKbIds,
          rerank_hybrid_alpha: rerankHybridAlpha,
          ...(superSort ? { super_sort: superSort } : {}),
        }),
      });
      setQueryResult(res.data?.result ?? null);
      setQueryRequestId(res.request_id ?? null);
      setRawQueryText(typeof res.data?.raw_query_text === "string" ? res.data.raw_query_text : queryText);
      setNormalizedQueryText(
        typeof res.data?.normalized_query_text === "string" ? res.data.normalized_query_text : null,
      );
      setQueryPreprocessObs(res.data?.preprocess_obs ?? null);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setQueryLoading(false);
    }
  }, [
    projectId,
    queryText,
    selectedKbIds,
    sortedSources,
    rerankHybridAlpha,
    superSortMode,
    superSortOrderText,
    superSortWeights,
    toast,
  ]);

  return (
    <DebugPageShell
      eyebrow="资料检索"
      title="知识库"
      description="把知识库状态、导入、重建和查询验证放进同一个研究面板，方便你判断资料有没有真正进入检索链路。"
      whenToUse="导入资料后，想确认知识库是否健康、索引是否需要重建，或者为什么检索没有命中。"
      outcome="你会看到知识库状态、同步与重建结果，以及一次查询究竟命中了哪些来源。"
      risk="入库和重建可能耗时；如果依赖在线模型或重排服务，可能产生额外成本。"
      actions={
        <>
          <button
            className="btn btn-secondary"
            disabled={statusLoading}
            onClick={() => void runStatus()}
            aria-label="刷新状态 (rag_refresh_status)"
            type="button"
          >
            {statusLoading ? "加载中…" : "刷新状态"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={ingestLoading}
            onClick={() => void runIngest()}
            aria-label={`${UI_COPY.rag.ingest} (rag_ingest)`}
            type="button"
          >
            {ingestLoading ? "执行中…" : UI_COPY.rag.ingest}
          </button>
          <button
            className={vectorIndexDirty ? "btn btn-primary" : "btn btn-secondary"}
            disabled={rebuildLoading}
            onClick={() => void runRebuild()}
            aria-label={`${UI_COPY.rag.rebuild} (rag_rebuild)`}
            type="button"
          >
            {rebuildLoading
              ? "执行中…"
              : vectorIndexDirty && vectorEnabled === false
                ? UI_COPY.rag.rebuildNeedConfig
                : vectorIndexDirty
                  ? UI_COPY.rag.rebuildRecommended
                  : UI_COPY.rag.rebuild}
          </button>
          {projectId ? (
            <Link
              className="btn btn-secondary"
              to={`${buildStudioAiPath(projectId, "models")}#rag-config`}
              aria-label={`${UI_COPY.rag.settings} (rag_settings)`}
            >
              {UI_COPY.rag.settings}
            </Link>
          ) : null}
        </>
      }
    >
      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">{ragNextStepText}</div>
          <div className="text-xs text-subtext">
            建议顺序：先看索引和知识库状态，再同步/重建，最后拿真实片段验证命中效果。
          </div>
        </div>
        <div className="manuscript-status-list">
          <span className="manuscript-chip">索引状态：{indexSummary}</span>
          <span className="manuscript-chip">已选来源：{sortedSources.length}</span>
          <span className="manuscript-chip">已选知识库：{selectedKbIds.length}</span>
          <span className="manuscript-chip">命中片段：{queryHitCount}</span>
          <span className="manuscript-chip max-w-[260px] truncate" title={querySummary}>
            当前验证：{querySummary}
          </span>
        </div>
      </section>

      <ResearchWorkbenchPanel {...RESEARCH_WORKBENCH_COPY["knowledge-base"]} variant="compact" />

      <DebugDetails title={UI_COPY.help.title}>
        <div className="grid gap-2 text-xs text-subtext">
          <div>{UI_COPY.rag.usageHint}</div>
          <div>{UI_COPY.rag.exampleHint}</div>
          <div>
            快速开始：创建并启用知识库 → 点击“{UI_COPY.rag.ingest}”同步资料 → “{UI_COPY.rag.rebuild}”更新索引 → 在下方查询区预览命中。
          </div>
          <div>
            验证结果排序是否生效：启用后在下方执行查询，结果面板会显示排序摘要，并可展开原始观测信息继续排障。
          </div>
          {projectId ? (
            <div>
              资料策略入口：先到{" "}
              <Link className="underline" to={`${buildStudioAiPath(projectId, "models")}#rag-config`}>
                {UI_COPY.rag.settings}
              </Link>
              ，先确认召回和排序服务可用，再回来更新索引。
            </div>
          ) : null}
          {projectId ? (
            <div>
              导入小说/资料：到{" "}
              <Link className="underline" to={buildStudioResearchPath(projectId, "import-docs")}>
                导入页
              </Link>
              ，上传 txt/md 并应用提案，让内容进入世界书或故事记忆链路。
            </div>
          ) : null}
          <FeedbackCallout className="text-xs" tone="warning" title="风险提醒">
            {UI_COPY.rag.riskHint}
          </FeedbackCallout>
        </div>
      </DebugDetails>

      <section className="research-guide-panel">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">入口与当前状态</div>
            <div className="studio-cluster-copy">先确认资料有没有导入、索引是不是过期，再决定要重建、改配置还是直接查一次。</div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {projectId ? (
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="text-sm text-ink">资料入口</div>
              <div className="mt-2 text-xs leading-6 text-subtext">
                小说正文、设定稿或访谈等外部资料需要先导入并应用提案，之后才会真正进入知识库与检索链路。
              </div>
              <div className="mt-3">
                <Link className="btn btn-secondary" to={buildStudioResearchPath(projectId, "import-docs")}>
                  打开导入页
                </Link>
              </div>
            </div>
          ) : null}

          <div className="rounded-atelier border border-border bg-canvas p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-subtext">
                索引状态：{formatIndexStateLabel(vectorIndexDirty)} | 上次更新：{lastVectorBuildAt ?? "-"}
                {lastVectorBuildAt ? `（${formatIsoToLocal(lastVectorBuildAt)}）` : ""}
              </div>
              {vectorIndexDirty === null ? (
                <div className="text-subtext">索引状态加载中…</div>
              ) : vectorIndexDirty ? (
                vectorEnabled === false ? (
                  <div className="text-ink">
                    索引需要更新，但资料召回服务还不可用（原因：{formatRagDisabledReason(vectorDisabledReason)}）。请先打开{" "}
                    {projectId ? (
                      <Link className="underline" to={`${buildStudioAiPath(projectId, "models")}#rag-config`}>
                        {UI_COPY.rag.settings}
                      </Link>
                    ) : (
                      UI_COPY.rag.settings
                    )}
                    ，确认召回服务可用后再 {UI_COPY.rag.rebuild}。
                  </div>
                ) : (
                  <div className="text-ink">索引需要更新：建议点击右上角“{UI_COPY.rag.rebuildRecommended}”同步最新资料。</div>
                )
              ) : (
                <div className="text-subtext">索引已经是最新状态，当前无需重建。</div>
              )}
            </div>
            {lastOpRequestId ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-subtext">最近操作：{lastOp ?? "-"}</span>
                <RequestIdBadge requestId={lastOpRequestId} />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="studio-cluster">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">知识库状态</div>
            <div className="studio-cluster-copy">先确认服务是否启用、状态是否正常，再继续往下安排知识库顺序和查询验证。</div>
          </div>
          <div className="studio-cluster-meta">已选来源 {sortedSources.length} · 已选知识库 {selectedKbIds.length}</div>
        </div>
        <RagStatusPanel status={status} />
      </div>

      <div className="studio-cluster">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">知识库编排</div>
            <div className="studio-cluster-copy">在这里决定哪些知识库参与查询、顺序如何、是否启用，以及它们的权重。</div>
          </div>
          <div className="studio-cluster-meta">{kbs.length} 个知识库</div>
        </div>
        <RagKnowledgeBasePanel
          projectId={projectId}
          kbLoading={kbLoading}
          kbOrderDirty={kbOrderDirty}
          loadKbs={loadKbs}
          saveKbOrder={saveKbOrder}
          selectedKbIds={selectedKbIds}
          queryResult={queryResult}
          kbs={kbs}
          kbDraftById={kbDraftById}
          kbDirtyById={kbDirtyById}
          kbDragId={kbDragId}
          setKbDragId={setKbDragId}
          moveKb={moveKb}
          toggleKbSelected={toggleKbSelected}
          updateKbDraft={updateKbDraft}
          kbSaveLoadingId={kbSaveLoadingId}
          kbDeleteLoadingId={kbDeleteLoadingId}
          saveKb={saveKb}
          deleteKb={deleteKb}
          kbCreateName={kbCreateName}
          setKbCreateName={setKbCreateName}
          kbCreateLoading={kbCreateLoading}
          createKb={createKb}
        />
      </div>

      <div className="studio-cluster">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">查询与命中验证</div>
            <div className="studio-cluster-copy">
              把真正关心的片段丢进来，看最终命中了哪些来源，以及注入文本是否符合预期。
            </div>
          </div>
          <div className="studio-cluster-meta">已选来源 {sortedSources.length} · 已选知识库 {selectedKbIds.length}</div>
        </div>
        <RagQueryPanel
          busy={busy}
          sources={sources}
          toggleSource={toggleSource}
          queryText={queryText}
          setQueryText={setQueryText}
          queryLoading={queryLoading}
          runQuery={runQuery}
          projectId={projectId}
          sortedSources={sortedSources}
          queryResult={queryResult}
          queryRequestId={queryRequestId}
          rawQueryText={rawQueryText}
          normalizedQueryText={normalizedQueryText}
          queryPreprocessObs={queryPreprocessObs}
        />
      </div>

      <RagAdvancedDebugPanel
        projectId={projectId}
        debugOpen={debugOpen}
        setDebugOpen={setDebugOpen}
        settingsQuery={settingsQuery}
        busy={busy}
        rerankEnabled={rerankEnabled}
        setRerankEnabled={setRerankEnabled}
        rerankMethod={rerankMethod}
        setRerankMethod={setRerankMethod}
        rerankTopK={rerankTopK}
        setRerankTopK={setRerankTopK}
        rerankHybridAlpha={rerankHybridAlpha}
        setRerankHybridAlpha={setRerankHybridAlpha}
        superSortMode={superSortMode}
        setSuperSortMode={setSuperSortMode}
        superSortOrderText={superSortOrderText}
        setSuperSortOrderText={setSuperSortOrderText}
        superSortWeights={superSortWeights}
        setSuperSortWeights={setSuperSortWeights}
        rerankSaving={rerankSaving}
        applyRerank={applyRerank}
        ingestResult={ingestResult}
        rebuildResult={rebuildResult}
      />
    </DebugPageShell>
  );
}
