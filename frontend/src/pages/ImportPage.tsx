import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { DebugDetails, DebugPageShell } from "../components/atelier/DebugPageShell";
import { GhostwriterIndicator } from "../components/atelier/GhostwriterIndicator";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState, FeedbackStateCard } from "../components/ui/Feedback";
import { useToast } from "../components/ui/toast";
import { buildGlobalProjectImportPath, buildStudioResearchPath } from "../lib/projectRoutes";
import { createRequestSeqGuard } from "../lib/requestSeqGuard";
import { ApiError, apiJson, sanitizeFilename } from "../services/apiClient";
import { getImportProposalDisabledReason, mergeImportDocuments, type ImportDocument } from "./importState";
import { RESEARCH_WORKBENCH_COPY } from "./researchWorkbenchModels";

type ImportDocumentDetail = {
  document: ImportDocument;
  content_preview: string;
  vector_ingest_result: unknown;
  worldbook_proposal: unknown;
  story_memory_proposal: unknown;
};

type ImportChunk = {
  id: string;
  chunk_index: number;
  preview: string;
  vector_chunk_id: string | null;
};

type ProposalPreview = {
  summary: string;
  sampleTitles: string[];
  keys: string[];
};

function humanizeStatus(status: string): string {
  const s = (status || "").trim().toLowerCase();
  if (s === "queued") return "排队中";
  if (s === "running") return "处理中";
  if (s === "done") return "完成";
  if (s === "failed") return "失败";
  return status || "unknown";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export function ImportPage() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const [listLoading, setListLoading] = useState(false);
  const [documents, setDocuments] = useState<ImportDocument[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ImportDocumentDetail | null>(null);

  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunks, setChunks] = useState<ImportChunk[]>([]);

  const [applyWorldbookLoading, setApplyWorldbookLoading] = useState(false);
  const [applyStoryMemoryLoading, setApplyStoryMemoryLoading] = useState(false);

  const [pollPaused, setPollPaused] = useState(false);

  const autoOpenedDocIdRef = useRef<string | null>(null);
  const lastPolledRef = useRef<{ id: string; status: string } | null>(null);
  const listGuardRef = useRef(createRequestSeqGuard());
  const detailGuardRef = useRef(createRequestSeqGuard());

  const selectedDoc = useMemo(() => {
    if (!selectedId) return null;
    const d = documents.find((x) => x.id === selectedId) ?? null;
    return d;
  }, [documents, selectedId]);

  const statusDoc = useMemo(() => selectedDoc ?? detail?.document ?? null, [detail?.document, selectedDoc]);
  const proposalPreview = useMemo(() => {
    const summarize = (value: unknown, arrayKeys: string[]): ProposalPreview => {
      if (value == null) return { summary: "（空）", sampleTitles: [], keys: [] };
      if (Array.isArray(value)) {
        const sampleTitles = value
          .map((it) => {
            if (!it || typeof it !== "object") return "";
            const o = it as Record<string, unknown>;
            const title = typeof o.title === "string" ? o.title : typeof o.name === "string" ? o.name : "";
            return title.trim();
          })
          .filter(Boolean)
          .slice(0, 8);
        return { summary: `array(${value.length})`, sampleTitles, keys: [] };
      }
      if (typeof value !== "object") return { summary: String(value), sampleTitles: [], keys: [] };
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      for (const key of arrayKeys) {
        const arr = obj[key];
        if (!Array.isArray(arr)) continue;
        const sampleTitles = arr
          .map((it) => {
            if (!it || typeof it !== "object") return "";
            const o = it as Record<string, unknown>;
            const title = typeof o.title === "string" ? o.title : typeof o.name === "string" ? o.name : "";
            return title.trim();
          })
          .filter(Boolean)
          .slice(0, 8);
        return { summary: `${key}: ${arr.length}`, sampleTitles, keys };
      }
      return {
        summary: keys.length ? `keys: ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? "…" : ""}` : "(empty)",
        sampleTitles: [],
        keys,
      };
    };

    return {
      worldbook: summarize(detail?.worldbook_proposal, ["entries", "worldbook_entries", "items"]),
      storyMemory: summarize(detail?.story_memory_proposal, ["memories", "items", "records"]),
    };
  }, [detail?.story_memory_proposal, detail?.worldbook_proposal]);
  const completedCount = useMemo(
    () => documents.filter((doc) => String(doc.status || "").trim().toLowerCase() === "done").length,
    [documents],
  );
  const runningCount = useMemo(
    () => documents.filter((doc) => {
      const status = String(doc.status || "").trim().toLowerCase();
      return status === "queued" || status === "running";
    }).length,
    [documents],
  );
  const currentDocLabel = statusDoc?.filename || selectedId || "尚未选择导入记录";

  const pollStatus = String(selectedDoc?.status ?? detail?.document.status ?? "")
    .trim()
    .toLowerCase();
  const shouldPoll = !pollPaused && (pollStatus === "queued" || pollStatus === "running");
  const lastUpdateMs = useMemo(() => {
    const raw = statusDoc?.updated_at || statusDoc?.created_at || "";
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }, [statusDoc?.created_at, statusDoc?.updated_at]);
  const lastUpdateAgoMs = useMemo(() => {
    if (!lastUpdateMs) return null;
    return Date.now() - lastUpdateMs;
  }, [lastUpdateMs]);
  const isPollingStalled = useMemo(() => {
    if (pollStatus !== "queued" && pollStatus !== "running") return false;
    if (lastUpdateAgoMs == null) return false;
    return lastUpdateAgoMs >= 5 * 60_000;
  }, [lastUpdateAgoMs, pollStatus]);
  const proposalDisabledReason = useMemo(() => {
    if (!detail) return "请先选择一条导入记录。";
    return getImportProposalDisabledReason(statusDoc?.status ?? detail.document.status);
  }, [detail, statusDoc?.status]);
  const nextStepHint = useMemo(() => {
    if (!selectedId) return "先从左侧选一条导入记录，再开始审核。";
    if (pollStatus === "queued" || pollStatus === "running") {
      return "当前先等待处理完成，处理结束后再审核切块和提案。";
    }
    if (pollStatus === "failed") {
      return "这条导入失败了，先看错误信息，再决定是否重试。";
    }
    if (proposalDisabledReason) {
      return proposalDisabledReason;
    }
    return "先看切块和提案摘要，确认没问题后，再把资料写入世界资料或剧情记忆。";
  }, [pollStatus, proposalDisabledReason, selectedId]);
  const detailStageLabel =
    pollStatus === "failed"
      ? "需要重试"
      : pollStatus === "done"
        ? "等待审核提案"
        : pollStatus === "queued" || pollStatus === "running"
          ? "处理中"
          : "等待选择";

  if (!projectId)
    return (
      <FeedbackStateCard
        tone="danger"
        kicker="项目导入"
        title="当前无法打开项目资料导入"
        description="缺少 `projectId`，请从具体项目进入后再上传文档、审核提案并写入资料。"
      />
    );

  useEffect(() => {
    const listGuard = listGuardRef.current;
    const detailGuard = detailGuardRef.current;
    return () => {
      listGuard.invalidate();
      detailGuard.invalidate();
    };
  }, []);

  const loadList = useCallback(async () => {
    if (!projectId) return;
    const seq = listGuardRef.current.next();
    setListLoading(true);
    try {
      const res = await apiJson<{ documents: ImportDocument[] }>(`/api/projects/${projectId}/imports`);
      if (!listGuardRef.current.isLatest(seq)) return;
      const documents = Array.isArray(res.data.documents) ? res.data.documents : [];
      setDocuments((prev) => mergeImportDocuments(prev, documents));
    } catch (e) {
      if (!listGuardRef.current.isLatest(seq)) return;
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      if (listGuardRef.current.isLatest(seq)) setListLoading(false);
    }
  }, [projectId, toast]);

  const selectDocAndLoad = useCallback(
    async (docId: string) => {
      if (!projectId) return;
      const id = String(docId || "").trim();
      if (!id) return;
      const seq = detailGuardRef.current.next();
      setPollPaused(false);
      setSelectedId(id);
      setChunks([]);
      setDetail(null);
      setDetailLoading(true);
      try {
        const res = await apiJson<ImportDocumentDetail>(`/api/projects/${projectId}/imports/${encodeURIComponent(id)}`);
        if (!detailGuardRef.current.isLatest(seq)) return;
        setDetail(res.data);
        setDocuments((prev) => mergeImportDocuments(prev, [res.data.document]));
      } catch (e) {
        if (!detailGuardRef.current.isLatest(seq)) return;
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        if (detailGuardRef.current.isLatest(seq)) setDetailLoading(false);
      }
    },
    [projectId, toast],
  );

  const retryImport = useCallback(
    async (docId: string) => {
      if (!projectId) return;
      const id = String(docId || "").trim();
      if (!id) return;
      try {
        const res = await apiJson<{ document: ImportDocument }>(
          `/api/projects/${projectId}/imports/${encodeURIComponent(id)}/retry`,
          { method: "POST", body: JSON.stringify({}) },
        );
        toast.toastSuccess("已重试导入", res.request_id);
        setDocuments((prev) => mergeImportDocuments(prev, [res.data.document]));
        setSelectedId(res.data.document.id);
        await Promise.all([loadList(), selectDocAndLoad(res.data.document.id)]);
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      }
    },
    [loadList, projectId, selectDocAndLoad, toast],
  );

  const loadChunks = useCallback(async () => {
    if (!projectId) return;
    if (!selectedId) return;
    if (chunksLoading) return;
    setChunksLoading(true);
    try {
      const res = await apiJson<{ chunks: ImportChunk[] }>(
        `/api/projects/${projectId}/imports/${encodeURIComponent(selectedId)}/chunks?limit=200`,
      );
      setChunks(Array.isArray(res.data.chunks) ? res.data.chunks : []);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setChunksLoading(false);
    }
  }, [chunksLoading, projectId, selectedId, toast]);

  const createImport = useCallback(async () => {
    if (!projectId) return;
    if (!file) return;
    if (creating) return;

    const safeName = sanitizeFilename(file.name) || "import.txt";
    const contentType =
      safeName.toLowerCase().endsWith(".md") || safeName.toLowerCase().endsWith(".markdown") ? "md" : "txt";
    const maxBytes = 5_000_000;
    if (file.size > maxBytes) {
      toast.toastError(
        `文件过大：${Math.ceil(file.size / 1024)} KB（上限 ${Math.ceil(maxBytes / 1024)} KB）`,
        "client",
      );
      return;
    }

    setCreating(true);
    try {
      const contentText = await file.text();
      const res = await apiJson<{ document: ImportDocument; job_id: string | null }>(
        `/api/projects/${projectId}/imports`,
        {
          method: "POST",
          body: JSON.stringify({ filename: safeName, content_text: contentText, content_type: contentType }),
          timeoutMs: 180_000,
        },
      );
      toast.toastSuccess("已提交导入任务", res.request_id);
      setDocuments((prev) => mergeImportDocuments(prev, [res.data.document]));
      await Promise.all([loadList(), selectDocAndLoad(res.data.document.id)]);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setCreating(false);
    }
  }, [creating, file, loadList, projectId, selectDocAndLoad, toast]);

  const applyWorldbook = useCallback(async () => {
    if (!projectId) return;
    if (!detail) return;
    if (applyWorldbookLoading) return;
    setApplyWorldbookLoading(true);
    try {
      const res = await apiJson(`/api/projects/${projectId}/worldbook_entries/import_all`, {
        method: "POST",
        body: JSON.stringify(detail.worldbook_proposal ?? {}),
      });
      toast.toastSuccess("已写入世界资料", res.request_id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setApplyWorldbookLoading(false);
    }
  }, [applyWorldbookLoading, detail, projectId, toast]);

  const applyStoryMemory = useCallback(async () => {
    if (!projectId) return;
    if (!detail) return;
    if (applyStoryMemoryLoading) return;
    setApplyStoryMemoryLoading(true);
    try {
      const res = await apiJson(`/api/projects/${projectId}/story_memories/import_all`, {
        method: "POST",
        body: JSON.stringify(detail.story_memory_proposal ?? {}),
      });
      toast.toastSuccess("已写入剧情记忆", res.request_id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setApplyStoryMemoryLoading(false);
    }
  }, [applyStoryMemoryLoading, detail, projectId, toast]);

  useEffect(() => {
    if (!projectId) return;
    const requested = String(searchParams.get("docId") ?? "").trim();
    void Promise.resolve().then(async () => {
      await loadList();
      if (!requested) return;
      if (autoOpenedDocIdRef.current === requested) return;
      autoOpenedDocIdRef.current = requested;
      await selectDocAndLoad(requested);
    });
  }, [loadList, projectId, searchParams, selectDocAndLoad]);

  useEffect(() => {
    if (!shouldPoll) return;
    const intervalMs = 2000;
    const timerId = window.setInterval(() => {
      void loadList();
    }, intervalMs);
    return () => window.clearInterval(timerId);
  }, [loadList, shouldPoll]);

  useEffect(() => {
    if (!selectedId) return;
    const prev = lastPolledRef.current;
    lastPolledRef.current = { id: selectedId, status: pollStatus };
    if (!prev || prev.id !== selectedId) return;

    const prevRunning = prev.status === "queued" || prev.status === "running";
    const nowDone = pollStatus === "done" || pollStatus === "failed";
    if (!prevRunning || !nowDone) return;

    void selectDocAndLoad(selectedId);
  }, [pollStatus, selectedId, selectDocAndLoad]);

  return (
    <DebugPageShell
      eyebrow="资料检索"
      title="导入文档"
      description="把外部 txt / md 资料接进项目，查看切块、提案和后续应用结果，让参考资料先变成可管理的内部素材。"
      whenToUse="需要把设定稿、采访、旧稿、灵感摘录或整理文档导入项目时。"
      outcome="你会得到导入记录、切块预览，以及世界书和故事记忆提案的审核入口。"
      risk={
        <>
          导入不会自动写入长期记忆，仍需你审核后再应用。项目 Bundle 也不在这里，请前往
          <Link className="ml-1 underline" to={buildGlobalProjectImportPath()}>
            全局导入页
          </Link>
          。
        </>
      }
      actions={
        projectId ? (
          <Link className="btn btn-secondary" to={buildStudioResearchPath(projectId, "knowledge-base")}>
            返回知识库
          </Link>
        ) : null
      }
    >
      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-secondary"
            aria-label="import_refresh"
            onClick={() => void loadList()}
            type="button"
          >
            刷新列表
          </button>
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">导入记录 {documents.length} 条</span>
          <span className="manuscript-chip">处理中 {runningCount} 条</span>
          <span className="manuscript-chip">已完成 {completedCount} 条</span>
          <span className="manuscript-chip">{currentDocLabel}</span>
        </div>
      </section>

      <ResearchWorkbenchPanel {...RESEARCH_WORKBENCH_COPY["import-docs"]} variant="compact" />

      <section className="research-guide-panel">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">导入入口与当前阶段</div>
            <div className="studio-cluster-copy">先上传资料，再跟着当前阶段推进到审核提案。不要在未完成导入时急着看切块和写入入口。</div>
          </div>
          <div className="studio-cluster-meta">仅支持 `.txt / .md`，单文件不超过 5MB</div>
        </div>
        <div className="studio-overview-grid">
          <div className="studio-overview-card is-emphasis">
            <div className="studio-overview-label">上传新资料</div>
            <div className="studio-overview-value">创建一条新的导入记录</div>
            <div className="studio-overview-copy">适合上传设定稿、采访、旧稿和灵感整理。导入不会自动写入项目资料，仍需要你在右侧审核提案。</div>
            <div className="mt-3 grid gap-1">
              <div className="text-xs text-subtext">选择文件（≤ 5MB）</div>
              <input
                aria-label="import_file"
                accept=".txt,.md,text/plain,text/markdown"
                className="input"
                disabled={creating}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                type="file"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="btn btn-primary"
                disabled={!projectId || !file || creating}
                onClick={() => void createImport()}
                type="button"
              >
                {creating ? "导入中…" : "创建导入记录"}
              </button>
              {creating ? <GhostwriterIndicator label="正在提交导入并处理…" /> : null}
            </div>
          </div>

          <div className="studio-overview-card">
            <div className="studio-overview-label">当前阶段</div>
            <div className="studio-overview-value">{selectedId ? detailStageLabel : "等待选择导入记录"}</div>
            <div className="studio-overview-copy">{nextStepHint}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtext">
              <span className="manuscript-chip">{currentDocLabel}</span>
              <span className="manuscript-chip">处理中 {runningCount}</span>
              <span className="manuscript-chip">已完成 {completedCount}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="text-sm font-semibold text-ink">导入记录与提案审核</div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            {listLoading ? <div className="text-xs text-subtext">加载中…</div> : null}
            {documents.length === 0 && !listLoading && !statusDoc ? (
              <FeedbackEmptyState
                className="rounded-atelier border border-border bg-canvas p-4"
                title="还没有导入记录"
                description="先上传一份 txt 或 md 文件，系统会创建导入记录并生成切块与资料提案。"
              />
            ) : null}
            <div className="grid gap-2">
              {documents.map((d) => {
                const active = d.id === selectedId;
                return (
                  <button
                    key={d.id}
                    className={
                      active
                        ? "panel-interactive ui-focus-ring border-accent/60 bg-surface-hover p-4 text-left"
                        : "panel-interactive ui-focus-ring p-4 text-left"
                    }
                    onClick={() => void selectDocAndLoad(d.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-ink">{d.filename || "import.txt"}</div>
                        <div className="mt-1 text-xs text-subtext">
                          {humanizeStatus(d.status)} · {Math.max(0, Math.min(100, Math.floor(d.progress ?? 0)))}% ·{" "}
                          {d.progress_message || ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-subtext">{d.chunk_count ?? 0} 个切块</div>
                    </div>
                    {d.error_message ? (
                      <FeedbackCallout className="mt-2 text-xs" tone="danger" title="本次导入失败">
                        {d.error_message}
                      </FeedbackCallout>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3">
            {!selectedId ? (
              <FeedbackEmptyState
                className="rounded-atelier border border-border bg-canvas p-4"
                title="先选择一条导入记录"
                description="左侧会显示每次导入的处理进度；选中后，你就能继续查看切块、提案和写入入口。"
              />
            ) : detailLoading ? (
              <div className="rounded-atelier border border-border bg-canvas p-4 text-sm text-subtext">加载详情中…</div>
            ) : detail?.document?.id === selectedId ? (
              <div className="grid gap-3 rounded-atelier border border-border bg-canvas p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{statusDoc?.filename || "import.txt"}</div>
                    <div className="mt-1 text-xs text-subtext">
                      {humanizeStatus(statusDoc?.status ?? detail.document.status)} ·{" "}
                      {Math.max(0, Math.min(100, Math.floor(statusDoc?.progress ?? 0)))}% ·{" "}
                      {statusDoc?.progress_message || ""}
                      {shouldPoll ? " · 自动刷新中…" : ""}
                    </div>
                    {isPollingStalled ? (
                      <FeedbackCallout className="mt-2 text-xs" tone="warning" title="这条导入可能卡住了">
                        该导入已超过 5
                        分钟未更新进度，可能卡住。建议：先取消自动刷新，再尝试重试或稍后回到此页查看结果。
                      </FeedbackCallout>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pollPaused && (pollStatus === "queued" || pollStatus === "running") ? (
                      <button className="btn btn-secondary" onClick={() => setPollPaused(false)} type="button">
                        恢复自动刷新
                      </button>
                    ) : shouldPoll ? (
                      <button className="btn btn-secondary" onClick={() => setPollPaused(true)} type="button">
                        取消自动刷新
                      </button>
                    ) : null}
                    {pollStatus === "failed" || isPollingStalled ? (
                      <button className="btn btn-secondary" onClick={() => void retryImport(selectedId)} type="button">
                        重试
                      </button>
                    ) : null}
                    <button
                      className="btn btn-secondary"
                      onClick={() => void selectDocAndLoad(selectedId)}
                      type="button"
                    >
                      刷新
                    </button>
                  </div>
                </div>

                <div className="studio-overview-grid">
                  <div className="studio-overview-card is-emphasis">
                    <div className="studio-overview-label">当前阶段</div>
                    <div className="studio-overview-value">{detailStageLabel}</div>
                    <div className="studio-overview-copy">
                      {pollStatus === "done"
                        ? "导入本身已经完成，接下来重点看提案要不要写入项目。"
                        : pollStatus === "failed"
                          ? "这次导入没有成功结束，先确认错误信息和原文是否有异常。"
                          : "系统仍在切块、提取和生成提案，请稍后刷新。"}
                    </div>
                  </div>
                  <div className="studio-overview-card">
                    <div className="studio-overview-label">下一步建议</div>
                    <div className="studio-overview-value">{selectedId ? "继续审核" : "先选择记录"}</div>
                    <div className="studio-overview-copy">{nextStepHint}</div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn btn-primary"
                      disabled={applyWorldbookLoading || Boolean(proposalDisabledReason)}
                      onClick={() => void applyWorldbook()}
                      type="button"
                    >
                      {applyWorldbookLoading ? "写入中…" : "写入世界资料"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={applyStoryMemoryLoading || Boolean(proposalDisabledReason)}
                      onClick={() => void applyStoryMemory()}
                      type="button"
                    >
                      {applyStoryMemoryLoading ? "写入中…" : "写入剧情记忆"}
                    </button>
                  </div>
                  {proposalDisabledReason ? (
                    <FeedbackCallout className="text-xs" tone="warning" title="当前还不能写入提案">
                      {proposalDisabledReason}
                    </FeedbackCallout>
                  ) : (
                    <div className="text-xs text-subtext">
                      导入已完成。你可以把提案写入世界资料或剧情记忆，写入后再去对应页面继续整理。
                    </div>
                  )}
                </div>

                <div className="studio-overview-grid">
                  <div className="studio-overview-card is-emphasis">
                    <div className="studio-overview-label">世界资料提案</div>
                    <div className="studio-overview-value">{proposalPreview.worldbook.summary}</div>
                    <div className="studio-overview-copy">
                      {proposalPreview.worldbook.sampleTitles.length
                        ? `示例：${proposalPreview.worldbook.sampleTitles.join("、")}`
                        : "当前还没有可展示的标题样本。"}
                    </div>
                  </div>
                  <div className="studio-overview-card">
                    <div className="studio-overview-label">剧情记忆提案</div>
                    <div className="studio-overview-value">{proposalPreview.storyMemory.summary}</div>
                    <div className="studio-overview-copy">
                      {proposalPreview.storyMemory.sampleTitles.length
                        ? `示例：${proposalPreview.storyMemory.sampleTitles.join("、")}`
                        : "当前还没有可展示的标题样本。"}
                    </div>
                  </div>
                </div>

                <FeedbackDisclosure
                  className="rounded-atelier border border-border bg-surface px-3 py-3"
                  summaryClassName="text-xs text-subtext hover:text-ink"
                  bodyClassName="pt-3"
                  title="查看原文预览"
                >
                  <div className="whitespace-pre-wrap rounded-atelier border border-border bg-canvas p-3 text-xs text-ink">
                    {detail.content_preview || "（空）"}
                  </div>
                </FeedbackDisclosure>

                <FeedbackDisclosure
                  className="rounded-atelier border border-border bg-surface px-3 py-3"
                  summaryClassName="text-xs text-subtext hover:text-ink"
                  bodyClassName="pt-3"
                  title={`查看切块预览（${statusDoc?.chunk_count ?? 0}）`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-subtext">按需加载切块，避免首屏直接堆出全部切块内容。</div>
                    <button
                      className="btn btn-secondary"
                      disabled={chunksLoading}
                      onClick={() => void loadChunks()}
                      type="button"
                    >
                      {chunksLoading ? "加载中…" : "加载切块"}
                    </button>
                  </div>
                  {chunks.length ? (
                    <div className="mt-3 grid gap-2">
                      {chunks.slice(0, 40).map((c) => (
                        <div key={c.id} className="rounded-atelier border border-border bg-canvas p-3">
                          <div className="text-xs text-subtext">#{c.chunk_index}</div>
                          <div className="mt-1 whitespace-pre-wrap text-xs text-ink">{c.preview}</div>
                        </div>
                      ))}
                      {chunks.length > 40 ? <div className="text-xs text-subtext">仅展示前 40 条。</div> : null}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-subtext">还没有加载切块，点击上方按钮后显示。</div>
                  )}
                </FeedbackDisclosure>

                <DebugDetails title="导入调试数据（JSON）">
                  <div className="text-xs leading-6 text-subtext">
                    只有在提案结构、切块写入或向量落库异常时再展开下面的 JSON；日常审核只看上面的摘要、原文和切块预览即可。
                  </div>
                  <div className="debug-disclosure-stack">
                    <FeedbackDisclosure
                      className="drawer-workbench-disclosure"
                      summaryClassName="text-xs text-subtext hover:text-ink"
                      bodyClassName="pt-3"
                      title="世界资料提案（JSON 调试）"
                    >
                      <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-xs text-subtext">
                        {safeStringify(detail.worldbook_proposal)}
                      </pre>
                    </FeedbackDisclosure>
                    <FeedbackDisclosure
                      className="drawer-workbench-disclosure"
                      summaryClassName="text-xs text-subtext hover:text-ink"
                      bodyClassName="pt-3"
                      title="剧情记忆提案（JSON 调试）"
                    >
                      <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-xs text-subtext">
                        {safeStringify(detail.story_memory_proposal)}
                      </pre>
                    </FeedbackDisclosure>
                    <FeedbackDisclosure
                      className="drawer-workbench-disclosure"
                      summaryClassName="text-xs text-subtext hover:text-ink"
                      bodyClassName="pt-3"
                      title="向量写入结果（JSON 调试）"
                    >
                      <pre className="drawer-workbench-codeblock mt-2 whitespace-pre-wrap text-xs text-subtext">
                        {safeStringify(detail.vector_ingest_result)}
                      </pre>
                    </FeedbackDisclosure>
                  </div>
                </DebugDetails>
              </div>
            ) : (
              <FeedbackCallout className="rounded-atelier border border-border bg-canvas p-4 text-sm" tone="warning" title="未找到导入详情">
                请点击左侧记录重试加载；如果仍然失败，通常说明这条导入已失效或需要重新创建。
              </FeedbackCallout>
            )}
          </div>
        </div>
      </section>
    </DebugPageShell>
  );
}
