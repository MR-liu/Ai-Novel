import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DebugDetails, DebugPageShell } from "../components/atelier/DebugPageShell";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { FeedbackCallout } from "../components/ui/Feedback";
import { useToast } from "../components/ui/toast";
import { copyText } from "../lib/copyText";
import {
  buildProjectOutlinePath,
  buildProjectWritePath,
  buildStoryBiblePath,
  buildStudioSystemPath,
} from "../lib/projectRoutes";
import { UI_COPY } from "../lib/uiCopy";
import { ApiError, apiJson } from "../services/apiClient";
import { RESEARCH_WORKBENCH_COPY } from "./researchWorkbenchModels";

type SearchItem = {
  source_type: string;
  source_id: string;
  title: string;
  snippet: string;
  jump_url: string | null;
  locator_json?: string | null;
};

type SearchQueryResponse = {
  items: SearchItem[];
  next_offset: number | null;
  mode?: string;
  fts_enabled?: boolean;
};

const SOURCE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "chapter", label: UI_COPY.search.sourceLabels.chapter },
  { key: "outline", label: UI_COPY.search.sourceLabels.outline },
  { key: "worldbook_entry", label: UI_COPY.search.sourceLabels.worldbookEntry },
  { key: "character", label: UI_COPY.search.sourceLabels.character },
  { key: "story_memory", label: UI_COPY.search.sourceLabels.storyMemory },
  { key: "source_document", label: UI_COPY.search.sourceLabels.sourceDocument },
  { key: "project_table_row", label: UI_COPY.search.sourceLabels.projectTableRow },
  { key: "memory_entity", label: UI_COPY.search.sourceLabels.memoryEntity },
  { key: "memory_relation", label: UI_COPY.search.sourceLabels.memoryRelation },
  { key: "memory_evidence", label: UI_COPY.search.sourceLabels.memoryEvidence },
];

function dedupeItems(items: SearchItem[]): SearchItem[] {
  const out: SearchItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = `${it.source_type}:${it.source_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export function SearchPage() {
  const { projectId } = useParams();
  const toast = useToast();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [sourcesState, setSourcesState] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [debug, setDebug] = useState<{ mode?: string; fts_enabled?: boolean } | null>(null);

  const selectedSources = useMemo(() => {
    const selected = SOURCE_OPTIONS.filter((s) => sourcesState[s.key]).map((s) => s.key);
    return selected.length ? selected : null;
  }, [sourcesState]);

  const runQuery = useCallback(
    async (opts?: { append?: boolean }) => {
      if (!projectId) return;
      const append = Boolean(opts?.append);
      const q = query.trim();
      if (!q) return;
      if (loading) return;
      setLoading(true);
      try {
        const offset = append ? (nextOffset ?? 0) : 0;
        const res = await apiJson<SearchQueryResponse>(`/api/projects/${projectId}/search/query`, {
          method: "POST",
          body: JSON.stringify({
            q,
            sources: selectedSources ?? [],
            limit: 20,
            offset,
          }),
        });

        const data = res.data;
        const nextItems = Array.isArray(data.items) ? data.items : [];
        setItems((prev) => (append ? dedupeItems([...prev, ...nextItems]) : dedupeItems(nextItems)));
        setNextOffset(typeof data.next_offset === "number" ? data.next_offset : null);
        setDebug({ mode: data.mode, fts_enabled: data.fts_enabled });
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setLoading(false);
      }
    },
    [loading, nextOffset, projectId, query, selectedSources, toast],
  );

  const clear = useCallback(() => {
    setQuery("");
    setItems([]);
    setNextOffset(null);
    setDebug(null);
  }, []);

  const toggleSource = useCallback((key: string) => {
    setSourcesState((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const sourceLabel = useCallback((sourceType: string) => {
    switch (sourceType) {
      case "chapter":
        return UI_COPY.search.sourceLabels.chapter;
      case "outline":
        return UI_COPY.search.sourceLabels.outline;
      case "worldbook_entry":
        return UI_COPY.search.sourceLabels.worldbookEntry;
      case "character":
        return UI_COPY.search.sourceLabels.character;
      case "story_memory":
        return UI_COPY.search.sourceLabels.storyMemory;
      case "source_document":
        return UI_COPY.search.sourceLabels.sourceDocument;
      case "project_table_row":
        return UI_COPY.search.sourceLabels.projectTableRow;
      case "memory_entity":
        return UI_COPY.search.sourceLabels.memoryEntity;
      case "memory_relation":
        return UI_COPY.search.sourceLabels.memoryRelation;
      case "memory_evidence":
        return UI_COPY.search.sourceLabels.memoryEvidence;
      default:
        return sourceType;
    }
  }, []);

  const canJump = useCallback((it: SearchItem) => {
    if (it.jump_url && it.jump_url.startsWith("/")) return true;
    return (
      it.source_type === "chapter" ||
      it.source_type === "outline" ||
      it.source_type === "worldbook_entry" ||
      it.source_type === "character" ||
      it.source_type === "story_memory" ||
      it.source_type === "source_document" ||
      it.source_type === "project_table_row" ||
      it.source_type === "memory_entity" ||
      it.source_type === "memory_relation" ||
      it.source_type === "memory_evidence"
    );
  }, []);

  const jump = useCallback(
    (it: SearchItem) => {
      if (!projectId) return;
      if (it.source_type !== "worldbook_entry") {
        const raw = String(it.jump_url || "").trim();
        if (raw && raw.startsWith("/")) {
          navigate(raw);
          return;
        }
      }
      if (it.source_type === "chapter") {
        navigate(`${buildProjectWritePath(projectId)}?chapterId=${encodeURIComponent(it.source_id)}`);
        return;
      }
      if (it.source_type === "outline") {
        navigate(buildProjectOutlinePath(projectId));
        return;
      }
      if (it.source_type === "worldbook_entry") {
        const params = new URLSearchParams();
        const search = String(it.title || query.trim()).trim();
        if (search) params.set("search", search);
        navigate(`${buildStoryBiblePath(projectId, "world")}${params.toString() ? `?${params.toString()}` : ""}`);
        return;
      }
      if (it.source_type === "character") {
        navigate(buildStoryBiblePath(projectId, "characters"));
        return;
      }
      if (it.source_type === "project_table_row") {
        navigate(buildStoryBiblePath(projectId, "tables"));
        return;
      }
      if (it.source_type === "memory_entity" || it.source_type === "memory_evidence") {
        navigate(buildStudioSystemPath(projectId, "structured-memory"));
        return;
      }
      toast.toastWarning(`该来源暂不支持跳转：${it.source_type}`);
    },
    [navigate, projectId, query, toast],
  );

  const copySourceId = useCallback(
    async (it: SearchItem) => {
      const ok = await copyText(it.source_id, { title: UI_COPY.search.copyIdFailTitle });
      if (ok) toast.toastSuccess(UI_COPY.search.copiedId);
      else toast.toastWarning(UI_COPY.search.copyFailedToast);
    },
    [toast],
  );

  const copyLocator = useCallback(
    async (it: SearchItem) => {
      const raw = String(it.locator_json ?? "").trim();
      if (!raw) {
        toast.toastWarning("该结果没有可复制的定位线索（locator）");
        return;
      }
      const ok = await copyText(raw, { title: UI_COPY.search.copyLocatorFailTitle });
      if (ok) toast.toastSuccess(UI_COPY.search.copiedLocator);
      else toast.toastWarning(UI_COPY.search.copyFailedToast);
    },
    [toast],
  );

  const querySummary = query.trim() || "尚未输入查证问题";
  const hasSearched = items.length > 0 || nextOffset !== null || debug !== null;
  const selectedSourceSummary = selectedSources?.length ? `已限定 ${selectedSources.length} 类来源` : "默认搜索全部来源";
  const nextStepText = !query.trim()
    ? "先写下这次要核对的人名、设定或事件，再决定是否需要限制来源。"
    : !hasSearched
      ? "执行一次搜索，先看跨来源会出现哪些命中。"
      : items.length === 0
        ? "这次没有命中，建议换成“角色 + 事件”或“设定 + 关键词”的短语再查一次。"
        : "先看标题和来源，再跳回对应页面继续修稿、核对或补设定。";

  return (
    <DebugPageShell
      eyebrow="资料检索"
      title="资料查证台"
      description="跨章节、大纲、世界书、角色、导入文档和记忆底座做统一搜索，适合在写作前后快速回查设定、名字、证据和伏笔。"
      whenToUse="记不清某个设定、名字、伏笔或证据出现在哪时，先从这里全局检索。"
      outcome="你会得到跨来源的命中列表，并能直接跳回对应页面继续修稿、核对或补设定。"
      risk="搜索结果会混合多个来源，仍需要你结合上下文判断哪条才是当前最可信的版本。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="search_clear"
            disabled={loading && Boolean(query.trim())}
            onClick={clear}
          >
            {UI_COPY.search.clear}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            aria-label="search_submit"
            disabled={!projectId || !query.trim() || loading}
            onClick={() => void runQuery({ append: false })}
          >
            {loading ? UI_COPY.common.loading : UI_COPY.search.search}
          </button>
        </div>
      }
    >
      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">{nextStepText}</div>
          <div className="text-xs text-subtext">建议顺序：先查证，再跳转回原页面修改，不必在脑内来回记住所有细节。</div>
        </div>
        <div className="manuscript-status-list">
          <span className="manuscript-chip max-w-[260px] truncate" title={querySummary}>
            当前问题：{querySummary}
          </span>
          <span className="manuscript-chip">{selectedSourceSummary}</span>
          <span className="manuscript-chip">命中结果：{items.length}</span>
          <span className="manuscript-chip">{nextOffset !== null ? "还有更多结果可展开" : "当前结果已全部展示"}</span>
        </div>
      </section>

      <ResearchWorkbenchPanel {...RESEARCH_WORKBENCH_COPY.search} variant="compact" />

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">先写下这次要核对什么</div>
            <div className="studio-cluster-copy">
              先写下要找的设定、人名或片段，再决定是否勾选来源范围。问题越具体，越容易直接得到能回跳的结果。
            </div>
          </div>
          <div className="studio-cluster-meta">{selectedSourceSummary}</div>
        </div>
        <FeedbackCallout className="mt-4" title="推荐写法">
          优先用“角色 + 事件”或“设定 + 关键词”的短语查找，例如“沈昭 背叛”或“星门 代价”，通常比只搜单个词更容易定位到真正相关的片段。
        </FeedbackCallout>
        <div className="mt-4 grid gap-2">
          <input
            className="input w-full"
            id="search_query"
            name="search_query"
            aria-label="search_query"
            placeholder={UI_COPY.search.queryPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runQuery({ append: false });
            }}
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-subtext">{UI_COPY.search.sourcesTitle}</div>
            {SOURCE_OPTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`search_source_${s.key}`}
                  name={`search_source_${s.key}`}
                  className="checkbox"
                  checked={Boolean(sourcesState[s.key])}
                  onChange={() => toggleSource(s.key)}
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="panel p-4" aria-label="search_results">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">这次查到了什么</div>
            <div className="studio-cluster-copy">
              先看标题和来源，再决定是直接跳转、复制定位信息，还是继续缩小检索范围。
            </div>
          </div>
          <div className="studio-cluster-meta">
            {items.length ? `当前 ${items.length} 条结果` : "还没有结果"}
            {debug?.mode ? ` · 当前检索路线（mode）:${debug.mode}` : ""}
            {typeof debug?.fts_enabled === "boolean" ? ` · 全文检索（fts）:${String(debug.fts_enabled)}` : ""}
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {!items.length ? (
            <div className="rounded-atelier border border-dashed border-border bg-canvas px-4 py-5 text-sm text-subtext">
              {hasSearched
                ? "这次没有命中合适结果。可以换一个更具体的短语，或者缩小到角色/章节/世界资料等单一来源后再查。"
                : "还没有运行搜索。先输入要核对的设定或片段，再执行一次全局查证。"}
            </div>
          ) : (
            items.map((it) => (
              <div key={`${it.source_type}:${it.source_id}`} className="panel p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{it.title || it.source_id}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtext">
                      <span>{sourceLabel(it.source_type)}</span>
                      <span>来源代码（source_type）</span>
                      <span className="font-mono">{it.source_type}</span>
                      <span>定位编号（source_id）</span>
                      <span className="font-mono break-all">{it.source_id}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label="search_copy_id"
                      onClick={() => void copySourceId(it)}
                    >
                      {UI_COPY.search.copyId}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label="search_copy_locator"
                      disabled={!String(it.locator_json ?? "").trim()}
                      onClick={() => void copyLocator(it)}
                    >
                      {UI_COPY.search.copyLocator}
                    </button>
                    {canJump(it) ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        aria-label="search_jump"
                        disabled={false}
                        onClick={() => jump(it)}
                      >
                        {UI_COPY.search.jump}
                      </button>
                    ) : (
                      <span title={UI_COPY.search.jumpDisabledHint}>
                        <button type="button" className="btn btn-primary" aria-label="search_jump" disabled>
                          {UI_COPY.search.jump}
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                {it.snippet ? (
                  <div className="mt-2 whitespace-pre-wrap break-words rounded-atelier border border-border bg-canvas px-3 py-2 text-xs text-ink">
                    {it.snippet}
                  </div>
                ) : null}
                <div className="mt-2 text-[11px] leading-5 text-subtext">
                  建议动作：先确认这条是否真的是你要找的版本，再跳回原页面修改，避免把过期设定当成最新事实。
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {nextOffset !== null ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="search_load_more"
            disabled={loading}
            onClick={() => void runQuery({ append: true })}
          >
            {UI_COPY.search.loadMore}
          </button>
        </div>
      ) : null}

      <DebugDetails title="仅在排障时查看搜索调试信息" defaultOpen={false}>
        <pre className="overflow-auto whitespace-pre-wrap break-words text-xs text-subtext">
          {JSON.stringify({ projectId, selectedSources, nextOffset, debug }, null, 2)}
        </pre>
      </DebugDetails>
    </DebugPageShell>
  );
}
