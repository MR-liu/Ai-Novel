import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ToolContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import { Badge } from "../components/ui/Badge";
import { useConfirm } from "../components/ui/confirm";
import { FeedbackCallout, FeedbackEmptyState } from "../components/ui/Feedback";
import { RequestIdBadge } from "../components/ui/RequestIdBadge";
import { useToast } from "../components/ui/toast";
import { useChapterMetaList } from "../hooks/useChapterMetaList";
import { buildProjectReviewPath, buildProjectWritePath } from "../lib/projectRoutes";
import { createRequestSeqGuard } from "../lib/requestSeqGuard";
import { ApiError, apiJson } from "../services/apiClient";
import type { ChapterListItem } from "../types";

type ForeshadowOpenLoop = {
  id: string;
  chapter_id: string | null;
  memory_type: string;
  title: string | null;
  importance_score: number;
  story_timeline: number;
  is_foreshadow: boolean;
  resolved_at_chapter_id: string | null;
  content_preview: string;
  updated_at: string | null;
};

type OpenLoopsResponse = { items: ForeshadowOpenLoop[]; has_more: boolean; returned: number };

type OrderKey = "timeline_desc" | "importance_desc" | "updated_desc";

const OPEN_LOOPS_LIMIT_INITIAL = 80;
const OPEN_LOOPS_LIMIT_STEP = 80;
const OPEN_LOOPS_LIMIT_MAX = 200;

function labelForChapter(chapter: ChapterListItem): string {
  const title = String(chapter.title || "").trim();
  return title ? `第${chapter.number}章：${title}` : `第${chapter.number}章`;
}

function formatDateLabel(value: string | null): string {
  if (!value) return "暂无更新时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getForeshadowPriority(item: ForeshadowOpenLoop): {
  label: string;
  copy: string;
  tone: "missing" | "urgent" | "watch";
} {
  if (!item.chapter_id) {
    return {
      label: "待补埋设位置",
      copy: "这条线索还没有绑定来源章节。先确认它埋在哪，再决定回收节奏会更稳。",
      tone: "missing",
    };
  }
  if (item.importance_score >= 7) {
    return {
      label: "优先回看",
      copy: "重要度较高，适合优先判断下一章是否需要回应，避免主线悬置过久。",
      tone: "urgent",
    };
  }
  return {
    label: "继续跟踪",
    copy: "当前更适合保留在清单里持续观察，等剧情推进到对应节点再闭环。",
    tone: "watch",
  };
}

export function ForeshadowsPage() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const titleId = useId();

  const initialResolvedAtChapterId = useMemo(() => searchParams.get("chapterId") || "", [searchParams]);

  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [items, setItems] = useState<ForeshadowOpenLoop[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [limit, setLimit] = useState(OPEN_LOOPS_LIMIT_INITIAL);

  const [searchText, setSearchText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [order, setOrder] = useState<OrderKey>("timeline_desc");

  const [resolvedAtChapterId, setResolvedAtChapterId] = useState<string>("");

  const listGuard = useMemo(() => createRequestSeqGuard(), []);
  const chapterListQuery = useChapterMetaList(projectId);
  const chapters = chapterListQuery.chapters as ChapterListItem[];
  const loadingChapters = !chapterListQuery.hasLoaded && chapterListQuery.loading;

  const fetchOpenLoops = useCallback(async () => {
    if (!projectId) return;
    const seq = listGuard.next();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (queryText.trim()) params.set("q", queryText.trim());
      params.set("order", order);
      const res = await apiJson<OpenLoopsResponse>(
        `/api/projects/${projectId}/story_memories/foreshadows/open_loops?${params.toString()}`,
      );
      if (!listGuard.isLatest(seq)) return;
      setRequestId(res.request_id ?? null);
      setItems(res.data.items ?? []);
      setHasMore(Boolean(res.data.has_more));
    } catch (e) {
      if (!listGuard.isLatest(seq)) return;
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setRequestId(err.requestId ?? null);
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      if (listGuard.isLatest(seq)) {
        setLoading(false);
      }
    }
  }, [limit, listGuard, order, projectId, queryText, toast]);

  useEffect(() => {
    const guard1 = listGuard;
    return () => {
      guard1.invalidate();
    };
  }, [listGuard]);

  useEffect(() => {
    void fetchOpenLoops();
  }, [fetchOpenLoops]);

  useEffect(() => {
    if (!initialResolvedAtChapterId) return;
    if (!chapters.some((c) => c.id === initialResolvedAtChapterId)) return;
    setResolvedAtChapterId(initialResolvedAtChapterId);
  }, [chapters, initialResolvedAtChapterId]);

  const chapterLabelById = useMemo(() => {
    const map = new Map<string, string>();
    chapters.forEach((chapter) => {
      map.set(chapter.id, labelForChapter(chapter));
    });
    return map;
  }, [chapters]);
  const chapterOptions = useMemo(() => chapters.map((c) => ({ id: c.id, label: labelForChapter(c) })), [chapters]);
  const resolvedChapterLabel = useMemo(() => {
    const found = chapters.find((c) => c.id === resolvedAtChapterId);
    return found ? labelForChapter(found) : null;
  }, [chapters, resolvedAtChapterId]);
  const currentSortLabel =
    order === "importance_desc" ? "按重要性排序" : order === "updated_desc" ? "按更新时间排序" : "按时间线排序";
  const currentResolveLabel = resolvedChapterLabel ?? "暂不关联章节";
  const linkedCount = useMemo(() => items.filter((it) => Boolean(it.chapter_id)).length, [items]);
  const highPriorityCount = useMemo(() => items.filter((it) => it.importance_score >= 7).length, [items]);
  const missingSourceCount = useMemo(() => items.filter((it) => !it.chapter_id).length, [items]);

  const resolve = useCallback(
    async (foreshadowId: string) => {
      if (!projectId) return;
      const chapterId = resolvedAtChapterId || null;
      const ok = await confirm.confirm({
        title: "标记伏笔已回收？",
        description: chapterId
          ? `将把该伏笔标记为已回收，并记录回收发生在所选章节（${resolvedChapterLabel ?? chapterId}）。`
          : "将把该伏笔标记为已回收，但不记录回收章节。",
        confirmText: "标记回收",
        cancelText: "取消",
      });
      if (!ok) return;

      setLoading(true);
      try {
        const res = await apiJson<{ foreshadow: { id: string } }>(
          `/api/projects/${projectId}/story_memories/foreshadows/${foreshadowId}/resolve`,
          {
            method: "POST",
            body: JSON.stringify({ resolved_at_chapter_id: chapterId }),
          },
        );
        setRequestId(res.request_id ?? null);
        setItems((prev) => prev.filter((it) => it.id !== foreshadowId));
        toast.toastSuccess("已标记回收", res.request_id ?? undefined);
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        setRequestId(err.requestId ?? null);
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setLoading(false);
      }
    },
    [confirm, projectId, resolvedAtChapterId, resolvedChapterLabel, toast],
  );

  const submitQuery = useCallback(() => {
    setLimit(OPEN_LOOPS_LIMIT_INITIAL);
    setQueryText(searchText.trim());
  }, [searchText]);

  return (
    <ToolContent className="grid gap-4">
      <EditorialHero
        kicker="伏笔台"
        title="集中追踪哪些钩子还悬着，哪些线索准备在后文回收。"
        subtitle="这里按作者工作流查看尚未闭环的伏笔，适合决定下一章该回应什么、哪些信息已经拖得太久，以及回收时该落在哪一章。"
        items={[
          {
            key: "count",
            label: "当前数量",
            value: `${items.length} 条未回收伏笔${hasMore ? "（当前列表已截断）" : ""}`,
          },
          { key: "resolve", label: "回收记录默认落点", value: currentResolveLabel },
          { key: "sort", label: "当前排序", value: currentSortLabel },
        ]}
      />

      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-center gap-2">
          <RequestIdBadge requestId={requestId} />
          <button className="btn btn-secondary" onClick={() => void fetchOpenLoops()} disabled={loading} type="button">
            {loading ? "刷新中..." : "刷新列表"}
          </button>
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{queryText ? `筛选：${queryText}` : "未设置关键词筛选"}</span>
          <span className="manuscript-chip">{currentSortLabel}</span>
          <span className="manuscript-chip">{currentResolveLabel}</span>
        </div>
      </section>

      <section className="review-track-panel">
        <div className="editorial-kicker">这一页适合怎么用</div>
        <div className="mt-3 max-w-3xl text-sm leading-7 text-subtext">
          先看哪些钩子最重要、哪些还缺埋设来源，再决定本轮写作要不要提前回收。真正动笔时，优先跳回写作页或连续性页确认上下文。
        </div>
        <div className="review-track-grid">
          <div className="review-track-card is-emphasis">
            <div className="review-track-label">高重要度</div>
            <div className="review-track-value">{highPriorityCount} 条</div>
            <div className="review-track-copy">这些线索更容易牵动主线节奏，适合优先判断是否要在近期章节回应。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">可直接回到正文</div>
            <div className="review-track-value">{linkedCount} 条</div>
            <div className="review-track-copy">已经绑定来源章节的伏笔，可以直接跳回写作或连续性页复核埋设位置。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">待补来源</div>
            <div className="review-track-value">{missingSourceCount} 条</div>
            <div className="review-track-copy">这些线索还缺明确来源章节，之后复盘会更难追踪，建议尽快补齐。</div>
          </div>
        </div>
      </section>

      <section className="review-track-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="editorial-kicker">筛选与回收落点</div>
            <div className="mt-2 max-w-3xl text-sm leading-7 text-subtext">
              这一步只决定你这一轮先看什么、以及回收记录默认落在哪一章，不会改动正文内容。
            </div>
          </div>
          <div className="review-side-chip-row mt-0">
            <span className="manuscript-chip">{queryText ? `当前筛选：${queryText}` : "未设关键词"}</span>
            <span className="manuscript-chip">{currentResolveLabel}</span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs text-subtext">筛选（标题/内容）</span>
            <input
              className="input"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="输入人物、事件或线索关键词"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitQuery();
              }}
              aria-label="foreshadows_query"
            />
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => submitQuery()} disabled={loading} type="button">
                应用
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSearchText("");
                  setQueryText("");
                  setLimit(OPEN_LOOPS_LIMIT_INITIAL);
                }}
                disabled={loading}
                type="button"
              >
                清空
              </button>
            </div>
            {queryText ? <div className="text-[11px] text-subtext">当前筛选：{queryText}</div> : null}
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-subtext">排序</span>
            <select
              className="select"
              value={order}
              onChange={(e) => {
                setLimit(OPEN_LOOPS_LIMIT_INITIAL);
                setOrder((e.target.value as OrderKey) || "timeline_desc");
              }}
              aria-label="foreshadows_order"
            >
              <option value="timeline_desc">按时间线（从新到旧）</option>
              <option value="importance_desc">按重要性（从高到低）</option>
              <option value="updated_desc">按更新时间（从新到旧）</option>
            </select>
            <div className="text-[11px] text-subtext">优先按你现在最关心的维度决定查看顺序。</div>
          </label>
        </div>

        <label className="mt-3 grid gap-1">
          <span className="text-xs text-subtext">回收章节（可选，用于回溯）</span>
          <select
            className="select"
            value={resolvedAtChapterId}
            onChange={(e) => setResolvedAtChapterId(e.target.value)}
            disabled={loadingChapters || chapterOptions.length === 0}
            aria-label="foreshadows_resolve_chapter_id"
          >
            <option value="">不关联章节</option>
            {chapterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {chapterOptions.length === 0 ? (
            <FeedbackCallout className="mt-2" tone="warning" title="当前还没有章节可关联">
              你仍然可以先标记回收，只是不记录它具体在哪一章完成。
            </FeedbackCallout>
          ) : null}
        </label>
      </section>

      <div className="flex items-center justify-between gap-2 text-xs text-subtext" aria-labelledby={titleId}>
        <div id={titleId}>
          未回收：{items.length}
          {hasMore ? "（已截断）" : ""}
        </div>
        <div className="flex items-center gap-2">
          {hasMore ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setLimit((prev) =>
                  prev >= OPEN_LOOPS_LIMIT_MAX ? prev : Math.min(OPEN_LOOPS_LIMIT_MAX, prev + OPEN_LOOPS_LIMIT_STEP),
                );
              }}
              disabled={loading || limit >= OPEN_LOOPS_LIMIT_MAX}
              type="button"
              aria-label="foreshadows_load_more"
            >
              {limit >= OPEN_LOOPS_LIMIT_MAX ? "已达上限" : "加载更多"}
            </button>
          ) : null}
          {loading ? <div>加载中...</div> : null}
        </div>
      </div>

      {items.length === 0 ? (
        <section className="review-track-panel">
          <FeedbackEmptyState
            kicker="当前状态"
            title={queryText ? "当前筛选下没有待回收伏笔" : "当前没有待回收伏笔"}
            description={
              queryText
                ? "可以换一个关键词继续查找，或清空筛选后重新检查整条伏笔轨道。"
                : "当前清单已经清空，适合回到写作继续推进，或到通读/细读页复查最近章节是否又埋下了新的线索。"
            }
          />
        </section>
      ) : (
        <div className="review-foreshadow-list">
          {items.map((it) => {
            const priority = getForeshadowPriority(it);
            const sourceLabel = (it.chapter_id && chapterLabelById.get(it.chapter_id)) || "未关联章节";
            const updatedLabel = formatDateLabel(it.updated_at);
            const priorityTone = priority.tone === "urgent" ? "accent" : priority.tone === "missing" ? "warning" : "neutral";

            return (
              <section key={it.id} className="review-foreshadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="editorial-kicker">伏笔轨道</div>
                    <div className="review-foreshadow-title">{it.title || "（未命名伏笔）"}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge tone={priorityTone}>{priority.label}</Badge>
                    <span className="manuscript-chip">
                      重要度 {Number.isFinite(it.importance_score) ? it.importance_score : 0}
                    </span>
                    <span className="manuscript-chip">
                      时间线 {Number.isFinite(it.story_timeline) ? it.story_timeline : 0}
                    </span>
                  </div>
                </div>

                <div className="review-foreshadow-copy">{it.content_preview || "（无摘要）"}</div>

                <div className="review-track-grid">
                  <div className="review-track-card is-emphasis">
                    <div className="review-track-label">来源章节</div>
                    <div className="review-track-value text-xl">{sourceLabel}</div>
                    <div className="review-track-copy">需要重看埋设位置时，可直接跳回写作页或连续性页复核。</div>
                  </div>
                  <div className="review-track-card">
                    <div className="review-track-label">下一步建议</div>
                    <div className="review-track-value text-xl">{priority.label}</div>
                    <div className="review-track-copy">{priority.copy}</div>
                  </div>
                  <div className="review-track-card">
                    <div className="review-track-label">最近更新时间</div>
                    <div className="review-track-value text-xl">{updatedLabel}</div>
                    <div className="review-track-copy">
                      {resolvedAtChapterId
                        ? `如果你现在标记回收，会默认记录到 ${currentResolveLabel}。`
                        : "如果已经决定在哪一章回收，先在上方选好回收落点，之后复盘会更清楚。"}
                    </div>
                  </div>
                </div>

                <div className="review-foreshadow-meta">
                  <span className="manuscript-chip">{it.is_foreshadow ? "已识别为伏笔" : "普通开放线索"}</span>
                  <span className="manuscript-chip">{sourceLabel}</span>
                  <span className="manuscript-chip">{updatedLabel}</span>
                </div>

                <div className="review-foreshadow-actions">
                  <button
                    className="btn btn-secondary"
                    disabled={!projectId || !it.chapter_id}
                    onClick={() => {
                      if (!projectId || !it.chapter_id) return;
                      navigate(`${buildProjectWritePath(projectId)}?chapterId=${encodeURIComponent(it.chapter_id)}`);
                    }}
                    type="button"
                  >
                    回到写作
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={!projectId || !it.chapter_id}
                    onClick={() => {
                      if (!projectId || !it.chapter_id) return;
                      navigate(
                        `${buildProjectReviewPath(projectId, "analysis")}?chapterId=${encodeURIComponent(it.chapter_id)}`,
                      );
                    }}
                    type="button"
                  >
                    查看连续性
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={loading}
                    onClick={() => void resolve(it.id)}
                    type="button"
                  >
                    标记已回收
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </ToolContent>
  );
}
