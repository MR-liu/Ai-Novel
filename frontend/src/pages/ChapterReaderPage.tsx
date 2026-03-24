import clsx from "clsx";
import { BookOpen, ChevronLeft, Edit3, List, StickyNote } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";

import { ToolContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../components/ui/Feedback";
import { ChapterVirtualList } from "../components/writing/ChapterVirtualList";
import { Drawer } from "../components/ui/Drawer";
import { useChapterDetail } from "../hooks/useChapterDetail";
import { useChapterMetaList } from "../hooks/useChapterMetaList";
import { buildProjectWritePath } from "../lib/projectRoutes";
import { ApiError, apiJson } from "../services/apiClient";
import { chapterStore } from "../services/chapterStore";
import type { Chapter, ChapterListItem } from "../types";
import type { MemoryContextPack } from "../components/writing/types";
const EMPTY_PACK: MemoryContextPack = {
  worldbook: {},
  story_memory: {},
  semantic_history: {},
  foreshadow_open_loops: {},
  structured: {},
  tables: {},
  vector_rag: {},
  graph: {},
  fractal: {},
  logs: [],
};

function humanizeChapterStatusZh(status: string): string {
  const s = String(status || "").trim();
  if (s === "planned") return "计划中";
  if (s === "drafting") return "草稿";
  if (s === "done") return "定稿";
  return s || "未知";
}

function buildMemoryQueryText(chapter: Chapter): string {
  const parts: string[] = [];
  const title = String(chapter.title || "").trim();
  if (title) parts.push(`title: ${title}`);
  const summary = String(chapter.summary || "").trim();
  if (summary) parts.push(`summary: ${summary}`);
  const plan = String((chapter as { plan?: unknown }).plan || "").trim();
  if (plan) parts.push(`plan: ${plan}`);
  const content = String(chapter.content_md || "").trim();
  if (content) parts.push(content);
  const merged = parts.join("\n\n").trim();
  return merged.slice(0, 5000);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getSectionEnabled(section: Record<string, unknown> | null): boolean {
  return Boolean(section?.enabled);
}

function getSectionDisabledReason(section: Record<string, unknown> | null): string | null {
  const raw = section?.disabled_reason;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

type MemoryItem = {
  id: string;
  chapter_id?: string | null;
  title?: string | null;
  memory_type?: string | null;
  content_preview?: string | null;
};

function normalizeItems(raw: unknown): MemoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryItem[] = [];
  for (const it of raw) {
    const obj = asObject(it);
    if (!obj) continue;
    const id = typeof obj.id === "string" ? obj.id : "";
    if (!id) continue;
    out.push({
      id,
      chapter_id: typeof obj.chapter_id === "string" ? obj.chapter_id : null,
      title: typeof obj.title === "string" ? obj.title : null,
      memory_type: typeof obj.memory_type === "string" ? obj.memory_type : null,
      content_preview: typeof obj.content_preview === "string" ? obj.content_preview : null,
    });
  }
  return out;
}

function sectionCounts(section: Record<string, unknown> | null): Record<string, number> {
  const raw = asObject(section?.counts);
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const num = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(num)) continue;
    out[k] = num;
  }
  return out;
}

function sectionTextMd(section: Record<string, unknown> | null): string {
  const raw = section?.text_md;
  return typeof raw === "string" ? raw : "";
}

function sectionStatusCopy(section: Record<string, unknown> | null): string {
  if (getSectionEnabled(section)) return "已纳入本次细读参考";
  return `当前未纳入：${getSectionDisabledReason(section) ?? "暂无可用命中"}`;
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "暂无更新记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function ChapterReaderPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedChapterId = searchParams.get("chapterId");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [mobileMemoryOpen, setMobileMemoryOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [memoryCollapsed, setMemoryCollapsed] = useState(false);
  const [onlyDone, setOnlyDone] = useState(false);

  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<ApiError | null>(null);
  const [memoryPack, setMemoryPack] = useState<MemoryContextPack>(EMPTY_PACK);
  const memoryCacheRef = useRef(new Map<string, MemoryContextPack>());

  const chapterListQuery = useChapterMetaList(projectId);
  const chapters = chapterListQuery.chapters as ChapterListItem[];
  const sortedChapters = useMemo(() => [...chapters].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)), [chapters]);
  const doneCount = useMemo(
    () => sortedChapters.reduce((acc, c) => acc + (c.status === "done" ? 1 : 0), 0),
    [sortedChapters],
  );
  const visibleChapters = useMemo(() => {
    if (!onlyDone) return sortedChapters;
    return sortedChapters.filter((c) => c.status === "done");
  }, [onlyDone, sortedChapters]);

  const resolvedActiveId = useMemo(() => {
    if (activeId && visibleChapters.some((c) => c.id === activeId)) return activeId;
    if (!activeId && requestedChapterId && visibleChapters.some((c) => c.id === requestedChapterId)) {
      return requestedChapterId;
    }
    return visibleChapters[0]?.id ?? null;
  }, [activeId, requestedChapterId, visibleChapters]);

  const activeIndex = useMemo(() => {
    if (!resolvedActiveId) return -1;
    return visibleChapters.findIndex((c) => c.id === resolvedActiveId);
  }, [resolvedActiveId, visibleChapters]);

  const activeChapterMeta = useMemo(() => {
    if (activeIndex < 0) return null;
    return visibleChapters[activeIndex] ?? null;
  }, [activeIndex, visibleChapters]);

  const prevChapter = useMemo(() => {
    if (activeIndex <= 0) return null;
    return visibleChapters[activeIndex - 1] ?? null;
  }, [activeIndex, visibleChapters]);

  const nextChapter = useMemo(() => {
    if (activeIndex < 0) return null;
    if (activeIndex >= visibleChapters.length - 1) return null;
    return visibleChapters[activeIndex + 1] ?? null;
  }, [activeIndex, visibleChapters]);

  const openEditor = (chapterId: string) => {
    if (!projectId) return;
    navigate(`${buildProjectWritePath(projectId)}?chapterId=${encodeURIComponent(chapterId)}`);
  };

  const openChapter = useCallback((chapterId: string) => {
    setActiveId(chapterId);
    setMobileListOpen(false);
  }, []);

  const { chapter: activeChapter, loading: loadingChapter } = useChapterDetail(resolvedActiveId, {
    enabled: Boolean(resolvedActiveId),
  });
  const activeChapterSummary = activeChapter ?? activeChapterMeta;

  useEffect(() => {
    if (prevChapter) void chapterStore.prefetchChapterDetail(prevChapter.id);
    if (nextChapter) void chapterStore.prefetchChapterDetail(nextChapter.id);
  }, [nextChapter, prevChapter]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      const activeEl = document.activeElement;
      const isTypingTarget =
        activeEl instanceof HTMLElement &&
        (activeEl.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName));
      if (isTypingTarget) return;

      if (e.key === "ArrowLeft" && prevChapter) {
        e.preventDefault();
        openChapter(prevChapter.id);
        return;
      }
      if (e.key === "ArrowRight" && nextChapter) {
        e.preventDefault();
        openChapter(nextChapter.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextChapter, openChapter, prevChapter]);

  useEffect(() => {
    if (!projectId) return;
    if (!activeChapter) return;

    const cacheKey = `${activeChapter.id}:${activeChapter.updated_at}`;
    const cachedPack = memoryCacheRef.current.get(cacheKey);
    if (cachedPack) {
      setMemoryPack(cachedPack);
      setMemoryError(null);
      setMemoryLoading(false);
      return;
    }

    const controller = new AbortController();
    setMemoryLoading(true);
    setMemoryError(null);
    const queryText = buildMemoryQueryText(activeChapter);

    apiJson<MemoryContextPack>(`/api/projects/${projectId}/memory/preview`, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        query_text: queryText,
        section_enabled: {
          worldbook: false,
          story_memory: true,
          semantic_history: false,
          foreshadow_open_loops: true,
          structured: true,
          vector_rag: false,
          graph: false,
          fractal: false,
        },
      }),
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        memoryCacheRef.current.set(cacheKey, res.data);
        setMemoryPack(res.data);
        setMemoryError(null);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        if (err.code === "REQUEST_ABORTED") return;
        setMemoryError(err);
        setMemoryPack(EMPTY_PACK);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setMemoryLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [activeChapter, projectId]);

  const effectiveMemoryPack = activeChapter ? memoryPack : EMPTY_PACK;
  const effectiveMemoryLoading = activeChapter ? memoryLoading : false;
  const effectiveMemoryError = activeChapter ? memoryError : null;

  const storySection = useMemo(() => asObject(effectiveMemoryPack.story_memory), [effectiveMemoryPack.story_memory]);
  const foreshadowSection = useMemo(
    () => asObject(effectiveMemoryPack.foreshadow_open_loops),
    [effectiveMemoryPack.foreshadow_open_loops],
  );
  const structuredSection = useMemo(() => asObject(effectiveMemoryPack.structured), [effectiveMemoryPack.structured]);

  const storyItems = useMemo(() => normalizeItems(storySection?.items), [storySection]);
  const foreshadowItems = useMemo(() => normalizeItems(foreshadowSection?.items), [foreshadowSection]);
  const structuredCounts = useMemo(() => sectionCounts(structuredSection), [structuredSection]);
  const structuredText = useMemo(() => sectionTextMd(structuredSection), [structuredSection]);
  const structuredHitCount = useMemo(
    () => Object.values(structuredCounts).reduce((sum, value) => sum + value, 0),
    [structuredCounts],
  );
  const currentChapterLabel = activeChapterSummary
    ? `第 ${activeChapterSummary.number} 章${activeChapterSummary.title?.trim() ? ` · ${activeChapterSummary.title}` : ""}`
    : "尚未选择章节";
  const visibleScopeLabel = onlyDone ? "仅浏览已定稿章节" : "浏览全部章节";
  const referenceSummaryLabel = activeChapterSummary
    ? `剧情 ${storyItems.length} · 伏笔 ${foreshadowItems.length} · 结构 ${structuredHitCount}`
    : "等待选择章节后加载参考";
  const currentUpdatedLabel = useMemo(
    () => formatDateLabel(activeChapterSummary?.updated_at),
    [activeChapterSummary?.updated_at],
  );
  const currentSummaryLine = useMemo(() => {
    const summary = String(activeChapter?.summary || "").trim();
    if (summary) return summary;
    if (!activeChapterSummary) return "先从目录选择一章，再开始细读。";
    if (activeChapterSummary.status === "done") return "本章已定稿，适合逐段核对叙事节奏、引用资料和前后文一致性。";
    return `本章当前为${humanizeChapterStatusZh(activeChapterSummary.status)}，细读时更适合先抓连续性硬伤和显性的语句问题。`;
  }, [activeChapter?.summary, activeChapterSummary]);
  const currentNextAction = activeChapterSummary
    ? storyItems.length + foreshadowItems.length + structuredHitCount > 0
      ? "带着侧记逐段核对正文，再回写作页修正。"
      : "先纯读正文，确认问题后再决定是否需要补充参考资料。"
    : "先从目录里选一章，右侧侧记会随章节自动刷新。";

  const list = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="inline-flex items-center gap-2 text-sm text-ink">
          <BookOpen size={16} />
          {"章节目录"}
        </div>
        <div className="flex items-center gap-2">
          <button
            className={clsx("btn btn-ghost px-2 py-1 text-xs", onlyDone ? "text-accent" : "text-subtext")}
            onClick={() => setOnlyDone((v) => !v)}
            type="button"
          >
            {onlyDone ? "显示全部" : "只看定稿"}
          </button>
          <span className="text-[11px] text-subtext">
            {doneCount}/{sortedChapters.length} {"已定稿"}
          </span>
        </div>
      </div>

      <div className="review-side-stack border-b border-border px-3 py-3">
        <div className="review-side-card is-muted">
          <div className="review-side-title">这轮细读范围</div>
          <div className="review-side-copy">
            {resolvedActiveId
              ? `当前定位在 ${currentChapterLabel}。目录会跟随你在正文里的章节切换。`
              : "先从目录里选一章，正文区和参考侧记会一起切到对应位置。"}
          </div>
          <div className="review-side-chip-row">
            <span className="manuscript-chip">{visibleScopeLabel}</span>
            <span className="manuscript-chip">{doneCount}/{sortedChapters.length} 已定稿</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-2">
        <ChapterVirtualList
          chapters={visibleChapters}
          activeId={resolvedActiveId}
          ariaLabel="章节列表"
          className="h-full"
          emptyState={
            sortedChapters.length === 0 ? (
              <FeedbackEmptyState
                variant="compact"
                kicker="章节目录"
                title="暂无章节"
                description="先写出至少一章正文，细读台和右侧参考侧记才会真正开始工作。"
                className="w-full"
              />
            ) : (
              <FeedbackEmptyState
                variant="compact"
                kicker="章节目录"
                title="暂无已定稿章节"
                description="先把章节推进到可细读的状态，再回来逐段核对参考资料。"
                className="w-full"
              />
            )
          }
          getStatusLabel={(chapter) => humanizeChapterStatusZh(chapter.status)}
          onSelectChapter={openChapter}
          variant="card"
        />
      </div>
    </div>
  );

  const memoryPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="inline-flex items-center gap-2 text-sm text-ink">
          <StickyNote size={16} />
          参考侧记
        </div>
        <button
          className={clsx("btn btn-secondary", memoryCollapsed ? null : "xl:hidden")}
          onClick={() => setMobileMemoryOpen(false)}
          type="button"
        >
          <ChevronLeft size={16} />
          关闭
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="review-side-stack">
          <div className="review-side-card is-muted">
            <div className="review-side-title">参考侧记</div>
            <div className="review-side-copy">
              这些资料只用于细读时辅助核对，不会改动正文。发现冲突后，直接跳回写作页修正文稿即可。
            </div>
            <div className="review-side-chip-row">
              <span className="manuscript-chip">{referenceSummaryLabel}</span>
              <span className="manuscript-chip">{effectiveMemoryLoading ? "正在刷新侧记" : "侧记已就绪"}</span>
            </div>
          </div>

          {!activeChapter ? (
            <div className="review-side-card">
              <FeedbackEmptyState
                variant="compact"
                title="先选一章再开始细读"
                description="目录与正文会同步定位到当前章节，右侧参考侧记也会一起切换到对应命中。"
              />
            </div>
          ) : null}
          {effectiveMemoryLoading ? <div className="review-side-card text-sm text-subtext">加载中...</div> : null}
          {effectiveMemoryError ? (
            <div className="review-side-card">
              <FeedbackCallout tone="danger" title="参考侧记加载失败">
                {effectiveMemoryError.message} ({effectiveMemoryError.code})
                {effectiveMemoryError.requestId ? (
                  <span className="ml-2">request_id: {effectiveMemoryError.requestId}</span>
                ) : null}
              </FeedbackCallout>
            </div>
          ) : null}

          <div className="review-side-card">
            <div className="flex items-center justify-between gap-2">
              <div className="review-side-title">剧情记忆命中</div>
              <div className="text-xs text-subtext">{storyItems.length} 条</div>
            </div>
            <div className="review-side-copy">{sectionStatusCopy(storySection)}</div>
            {storyItems.length ? (
              <div className="mt-3 grid gap-2">
                {storyItems.map((it) => (
                  <button
                    key={it.id}
                    className="ui-focus-ring ui-transition-fast w-full rounded-atelier border border-border bg-canvas px-3 py-2 text-left text-sm text-ink hover:bg-surface"
                    onClick={() => {
                      if (it.chapter_id) openEditor(it.chapter_id);
                      else if (activeChapter) openEditor(activeChapter.id);
                    }}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate">
                        {it.title?.trim() ? it.title : it.memory_type?.trim() ? `[${it.memory_type}]` : "StoryMemory"}
                      </div>
                      <div className="shrink-0 text-[11px] text-subtext">回写作页</div>
                    </div>
                    {it.content_preview?.trim() ? (
                      <div className="mt-1 line-clamp-3 text-xs text-subtext">{it.content_preview}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <FeedbackEmptyState
                className="mt-3"
                variant="compact"
                title="本章暂未命中剧情记忆"
                description="如果你正在核对人物动机、已发生事件或回收线索，可以先回写作页补充相关记忆。"
              />
            )}
          </div>

          <div className="review-side-card">
            <div className="flex items-center justify-between gap-2">
              <div className="review-side-title">伏笔命中</div>
              <div className="text-xs text-subtext">{foreshadowItems.length} 条</div>
            </div>
            <div className="review-side-copy">{sectionStatusCopy(foreshadowSection)}</div>
            {foreshadowItems.length ? (
              <div className="mt-3 grid gap-2">
                {foreshadowItems.map((it) => (
                  <button
                    key={it.id}
                    className="ui-focus-ring ui-transition-fast w-full rounded-atelier border border-border bg-canvas px-3 py-2 text-left text-sm text-ink hover:bg-surface"
                    onClick={() => {
                      if (it.chapter_id) openEditor(it.chapter_id);
                      else if (activeChapter) openEditor(activeChapter.id);
                    }}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate">{it.title?.trim() ? it.title : "Foreshadow"}</div>
                      <div className="shrink-0 text-[11px] text-subtext">回写作页</div>
                    </div>
                    {it.content_preview?.trim() ? (
                      <div className="mt-1 line-clamp-3 text-xs text-subtext">{it.content_preview}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <FeedbackEmptyState
                className="mt-3"
                variant="compact"
                title="本章暂未命中伏笔"
                description="如果你想检查埋线与回收，可以回到写作页补充伏笔标记，再回来做一次细读核对。"
              />
            )}
          </div>

          <div className="review-side-card">
            <div className="flex items-center justify-between gap-2">
              <div className="review-side-title">连续性结构提示</div>
              <div className="text-xs text-subtext">{structuredHitCount} 条</div>
            </div>
            <div className="review-side-copy">{sectionStatusCopy(structuredSection)}</div>
            {Object.keys(structuredCounts).length ? (
              <div className="review-side-chip-row">
                {Object.entries(structuredCounts).map(([k, v]) => (
                  <span key={k} className="manuscript-chip">
                    {k}:{v}
                  </span>
                ))}
              </div>
            ) : (
              <FeedbackEmptyState
                className="mt-3"
                variant="compact"
                title="暂未命中连续性结构提示"
                description="如果你想重点检查人物关系、设定冲突或状态变化，可以回写作页补充连续性资料后再细读。"
              />
            )}
            {structuredText ? (
              <FeedbackDisclosure
                className="mt-3 rounded-atelier border border-border bg-surface px-3 py-2"
                summaryClassName="text-xs text-subtext hover:text-ink"
                bodyClassName="pt-2"
                title="查看结构摘要"
              >
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-atelier border border-border bg-surface p-2 text-xs text-ink">
                  {structuredText}
                </pre>
              </FeedbackDisclosure>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (!chapterListQuery.hasLoaded && chapterListQuery.loading) return <div className="text-subtext">加载中...</div>;

  return (
    <ToolContent className="grid gap-4">
      <EditorialHero
        kicker="细读台"
        title="逐段核对正文，把参考资料和当前章节放在同一视线里。"
        subtitle="细读不是重新生成内容，而是带着剧情记忆、伏笔和连续性提示去检查每一段正文是否自洽。发现问题后，再回写作页改正文。"
        variant="compact"
        items={[
          { key: "chapter", label: "当前章节", value: currentChapterLabel },
          { key: "reference", label: "参考摘要", value: referenceSummaryLabel },
          { key: "scope", label: "浏览范围", value: visibleScopeLabel },
        ]}
      />

      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-secondary xl:hidden" onClick={() => setMobileListOpen(true)} type="button">
            <List size={16} />
            章节目录
          </button>
          <button
            className={clsx("btn btn-secondary", memoryCollapsed ? null : "xl:hidden")}
            onClick={() => setMobileMemoryOpen(true)}
            type="button"
          >
            <StickyNote size={16} />
            参考侧记
          </button>
          <button
            className="btn btn-secondary hidden xl:inline-flex"
            onClick={() => setMemoryCollapsed((v) => !v)}
            type="button"
          >
            <StickyNote size={16} />
            {memoryCollapsed ? "展开参考侧记" : "收起参考侧记"}
          </button>
          <button
            className="btn btn-secondary hidden xl:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            type="button"
          >
            <List size={16} />
            {collapsed ? "展开章节目录" : "收起章节目录"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={!prevChapter}
            onClick={() => (prevChapter ? openChapter(prevChapter.id) : undefined)}
            type="button"
          >
            上一章
          </button>
          <button
            className="btn btn-secondary"
            disabled={!nextChapter}
            onClick={() => (nextChapter ? openChapter(nextChapter.id) : undefined)}
            type="button"
          >
            下一章
          </button>
          {activeChapterSummary ? (
            <button className="btn btn-secondary" onClick={() => openEditor(activeChapterSummary.id)} type="button">
              <Edit3 size={16} />
              回到写作
            </button>
          ) : null}
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{visibleScopeLabel}</span>
          <span className="manuscript-chip">{memoryCollapsed ? "已收起参考侧记" : "侧记可见"}</span>
          <span className="manuscript-chip">快捷键：← / →</span>
        </div>
      </section>

      <div className="manuscript-shell xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        {!collapsed ? (
          <aside className="manuscript-sidebar hidden xl:block min-h-[560px] overflow-hidden">{list}</aside>
        ) : null}

        <section className="manuscript-main">
          <div className="manuscript-editor">
            {activeChapterSummary ? (
              <>
                <div className="mb-5 review-reading-summary">
                  <div className="review-reading-summary-header">
                    <div className="min-w-0">
                      <div className="editorial-kicker">当前细读章节</div>
                      <div className="review-reading-summary-title">{currentChapterLabel}</div>
                      <div className="review-reading-summary-copy">{currentSummaryLine}</div>
                    </div>
                    <div className="review-side-chip-row mt-0">
                      <span className="manuscript-chip">{humanizeChapterStatusZh(activeChapterSummary.status)}</span>
                      <span className="manuscript-chip">{referenceSummaryLabel}</span>
                      <span className="manuscript-chip">更新于 {currentUpdatedLabel}</span>
                    </div>
                  </div>
                  <div className="review-reading-summary-grid">
                    <div className="review-reading-summary-card is-emphasis">
                      <div className="review-reading-summary-label">章节状态</div>
                      <div className="review-reading-summary-value">{humanizeChapterStatusZh(activeChapterSummary.status)}</div>
                      <div className="review-reading-summary-copy-small">如果仍在草稿期，优先抓连续性硬伤；如果已定稿，更适合逐段修句和查漏。</div>
                    </div>
                    <div className="review-reading-summary-card">
                      <div className="review-reading-summary-label">参考命中</div>
                      <div className="review-reading-summary-value">{referenceSummaryLabel}</div>
                      <div className="review-reading-summary-copy-small">右侧侧记会随章节自动刷新，适合边读边核对，不必反复跳页。</div>
                    </div>
                    <div className="review-reading-summary-card">
                      <div className="review-reading-summary-label">修订建议</div>
                      <div className="review-reading-summary-value">发现问题就回写作页</div>
                      <div className="review-reading-summary-copy-small">{currentNextAction}</div>
                    </div>
                  </div>
                </div>

                <article className="manuscript-paper px-5 py-8 sm:px-8 lg:px-12">
                  <div className="atelier-content mx-auto max-w-4xl text-ink">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {loadingChapter ? "_(loading...)_" : activeChapter?.content_md || "_（空）_"}
                    </ReactMarkdown>
                  </div>
                </article>
              </>
            ) : (
              <FeedbackEmptyState
                kicker="当前状态"
                title="暂无可阅读内容"
                description="先从章节目录选择一章，再查看右侧参考侧记。"
              />
            )}
          </div>
        </section>

        {!memoryCollapsed ? (
          <aside className="manuscript-inspector hidden xl:block min-h-[560px] overflow-hidden">{memoryPanel}</aside>
        ) : null}
      </div>

      <Drawer
        open={mobileListOpen}
        onClose={() => setMobileListOpen(false)}
        side="bottom"
        overlayClassName="xl:hidden"
        ariaLabel="章节目录"
        panelClassName="h-[85vh] w-full overflow-hidden rounded-atelier border border-border bg-surface shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm text-ink">章节目录</div>
          <button className="btn btn-secondary" onClick={() => setMobileListOpen(false)} type="button">
            <ChevronLeft size={16} />
            关闭
          </button>
        </div>
        {list}
      </Drawer>

      <Drawer
        open={mobileMemoryOpen}
        onClose={() => setMobileMemoryOpen(false)}
        side="bottom"
        overlayClassName={memoryCollapsed ? undefined : "xl:hidden"}
        ariaLabel="参考侧记"
        panelClassName="h-[85vh] w-full overflow-hidden rounded-atelier border border-border bg-surface shadow-sm"
      >
        {memoryPanel}
      </Drawer>
    </ToolContent>
  );
}
