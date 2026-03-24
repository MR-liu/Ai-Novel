import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { FeedbackEmptyState } from "../ui/Feedback";
import { humanizeChapterStatus } from "../../lib/humanize";
import type { ChapterListItem } from "../../types";

import {
  DEFAULT_ROW_HEIGHT,
  DEFAULT_VIEWPORT_HEIGHT,
  getChapterScrollTopForIndex,
  getChapterVirtualWindow,
} from "./chapterVirtualWindow";

type ChapterVirtualListVariant = "panel" | "card";

function renderTitle(chapter: ChapterListItem): ReactNode {
  return (
    <span className="min-w-0 truncate">
      {chapter.number}. {chapter.title?.trim() ? chapter.title : "（未命名）"}
    </span>
  );
}

function itemClassName(variant: ChapterVirtualListVariant, isActive: boolean): string {
  if (variant === "panel") {
    return clsx(
      "chapter-directory-item ui-focus-ring ui-transition-fast w-full text-left",
      isActive ? "is-active" : "",
    );
  }

  return clsx(
    "ui-focus-ring ui-transition-fast flex h-11 w-full items-center justify-between gap-2 rounded-atelier border px-3 text-left text-sm motion-safe:active:scale-[0.99]",
    isActive ? "border-accent/40 bg-accent/10 text-ink" : "border-border bg-canvas text-subtext hover:bg-surface",
  );
}

function compactStatusLabel(status: ChapterListItem["status"]): string {
  if (status === "planned") return "计划中";
  if (status === "drafting") return "草稿";
  if (status === "done") return "定稿";
  return humanizeChapterStatus(status);
}

function formatUpdatedAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function renderPanelContent(chapter: ChapterListItem, isActive: boolean): ReactNode {
  const title = chapter.title?.trim() ? chapter.title : "（未命名章节）";
  const readiness = [
    { label: "要点", ready: chapter.has_plan },
    { label: "正文", ready: chapter.has_content },
    { label: "摘要", ready: chapter.has_summary },
  ];

  return (
    <>
      <div className="chapter-directory-head">
        <div className="min-w-0">
          <div className="chapter-directory-kicker">第 {chapter.number} 章</div>
          <div className="chapter-directory-title">{title}</div>
        </div>
        <span className="chapter-directory-updated">{isActive ? "正在写" : formatUpdatedAtLabel(chapter.updated_at)}</span>
      </div>

      <div className="chapter-directory-meta">
        <span className={clsx("chapter-directory-status", `is-${chapter.status}`)}>{compactStatusLabel(chapter.status)}</span>
        <div className="chapter-directory-presence-row">
          {readiness.map((item) => (
            <span key={item.label} className={clsx("chapter-directory-presence", item.ready ? "is-ready" : "is-pending")}>
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

export function ChapterVirtualList(props: {
  chapters: ChapterListItem[];
  activeId: string | null;
  onSelectChapter: (chapterId: string) => void;
  ariaLabel?: string;
  className?: string;
  emptyState?: ReactNode;
  variant?: ChapterVirtualListVariant;
  getStatusLabel?: (chapter: ChapterListItem) => string;
}) {
  const {
    chapters,
    activeId,
    onSelectChapter,
    ariaLabel = "章节列表",
    className,
    emptyState,
    variant = "panel",
    getStatusLabel = (chapter) => humanizeChapterStatus(chapter.status),
  } = props;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);

  const activeIndex = useMemo(() => {
    if (!activeId) return -1;
    return chapters.findIndex((chapter) => chapter.id === activeId);
  }, [activeId, chapters]);

  const windowState = useMemo(
    () =>
      getChapterVirtualWindow({
        itemCount: chapters.length,
        itemHeight: DEFAULT_ROW_HEIGHT,
        viewportHeight,
        scrollTop,
      }),
    [chapters.length, scrollTop, viewportHeight],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      setViewportHeight(Math.max(viewport.clientHeight, DEFAULT_VIEWPORT_HEIGHT));
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || activeIndex < 0) return;

    const nextScrollTop = getChapterScrollTopForIndex({
      currentScrollTop: viewport.scrollTop,
      itemIndex: activeIndex,
      itemHeight: DEFAULT_ROW_HEIGHT,
      viewportHeight,
    });

    if (nextScrollTop === null) return;
    viewport.scrollTop = nextScrollTop;
    setScrollTop(nextScrollTop);
  }, [activeIndex, viewportHeight]);

  if (chapters.length === 0) {
    return (
      <div className={clsx("flex h-full min-h-[160px] items-center justify-center", className)}>
        {emptyState ?? (
          <FeedbackEmptyState
            variant="compact"
            kicker="章节目录"
            title="暂无章节"
            description="先创建第一章，目录和后续校对视图就会开始成形。"
            className="w-full"
          />
        )}
      </div>
    );
  }

  const visibleItems = chapters.slice(windowState.startIndex, windowState.endIndex);

  return (
    <div
      ref={viewportRef}
      aria-label={ariaLabel}
      className={clsx("h-full overflow-auto", className)}
      role="list"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: `${windowState.totalHeight}px` }}>
        {visibleItems.map((chapter, index) => {
          const absoluteIndex = windowState.startIndex + index;
          const isActive = chapter.id === activeId;
          return (
            <div
              key={chapter.id}
              className="absolute left-0 right-0"
              role="listitem"
              style={{ top: `${absoluteIndex * DEFAULT_ROW_HEIGHT}px`, height: `${DEFAULT_ROW_HEIGHT}px` }}
            >
              <button
                aria-current={isActive ? "true" : undefined}
                className={itemClassName(variant, isActive)}
                onClick={() => onSelectChapter(chapter.id)}
                type="button"
              >
                {variant === "panel" ? (
                  renderPanelContent(chapter, isActive)
                ) : (
                  <>
                    {renderTitle(chapter)}
                    <span
                      className={clsx(
                        "shrink-0 text-[11px]",
                        variant === "card" && chapter.status === "done" ? "text-accent" : "text-subtext",
                      )}
                    >
                      {getStatusLabel(chapter)}
                    </span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
