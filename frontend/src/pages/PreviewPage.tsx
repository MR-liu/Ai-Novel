import clsx from "clsx";
import { BookOpen, ChevronLeft, Edit3, List, StickyNote } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { LazyMarkdownRenderer } from "../components/atelier/LazyMarkdownRenderer";
import { WizardNextBar } from "../components/atelier/WizardNextBar";
import { PaperContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import { FeedbackEmptyState } from "../components/ui/Feedback";
import { ChapterVirtualList } from "../components/writing/ChapterVirtualList";
import { Drawer } from "../components/ui/Drawer";
import { useChapterDetail } from "../hooks/useChapterDetail";
import { useChapterMetaList } from "../hooks/useChapterMetaList";
import { useWizardProgress } from "../hooks/useWizardProgress";
import { buildProjectReviewPath, buildProjectWritePath } from "../lib/projectRoutes";
import { chapterStore } from "../services/chapterStore";
import { markWizardPreviewSeen } from "../services/wizard";
import type { ChapterListItem } from "../types";

function humanizeChapterStatusZh(status: string): string {
  const s = String(status || "").trim();
  if (s === "planned") return "计划中";
  if (s === "drafting") return "草稿";
  if (s === "done") return "定稿";
  return s || "未知";
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

function getReadableCharacterCount(markdown: string | null | undefined): number {
  const raw = String(markdown || "");
  const withoutLinks = raw.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  const withoutMarkdown = withoutLinks.replace(/[`*_>#-]/g, " ");
  return withoutMarkdown.replace(/\s+/g, "").trim().length;
}

export function PreviewPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { bumpLocal, loading: wizardLoading, progress: wizardProgress } = useWizardProgress(projectId);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [onlyDone, setOnlyDone] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    markWizardPreviewSeen(projectId);
    bumpLocal();
  }, [bumpLocal, projectId]);

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

  const effectiveActiveId = useMemo(() => {
    if (activeId && visibleChapters.some((c) => c.id === activeId)) return activeId;
    return visibleChapters[0]?.id ?? null;
  }, [activeId, visibleChapters]);

  const activeIndex = useMemo(() => {
    if (!effectiveActiveId) return -1;
    return visibleChapters.findIndex((c) => c.id === effectiveActiveId);
  }, [effectiveActiveId, visibleChapters]);

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

  const openReader = (chapterId: string) => {
    if (!projectId) return;
    navigate(`${buildProjectReviewPath(projectId, "reader")}?chapterId=${encodeURIComponent(chapterId)}`);
  };

  const openChapter = useCallback((chapterId: string) => {
    setActiveId(chapterId);
    setMobileListOpen(false);
  }, []);

  const { chapter: activeChapter, loading: loadingChapter } = useChapterDetail(effectiveActiveId, {
    enabled: Boolean(effectiveActiveId),
  });
  const activeChapterSummary = activeChapter ?? activeChapterMeta;
  const currentChapterLabel = activeChapterSummary
    ? `第 ${activeChapterSummary.number} 章${activeChapterSummary.title?.trim() ? ` · ${activeChapterSummary.title}` : ""}`
    : "尚未选择章节";
  const currentScopeLabel = onlyDone ? "仅浏览已定稿章节" : "浏览全部章节";
  const activeTextCount = useMemo(() => getReadableCharacterCount(activeChapter?.content_md), [activeChapter?.content_md]);
  const currentUpdatedLabel = useMemo(
    () => formatDateLabel(activeChapterSummary?.updated_at),
    [activeChapterSummary?.updated_at],
  );
  const currentSummaryLine = useMemo(() => {
    if (!activeChapterSummary) return "先从目录里选一章，再开始通读。";
    if (activeChapterSummary.status === "done") return "本章已定稿，适合把自己放在读者位置，先感受节奏、桥段力度和结尾推进感。";
    return `本章当前为${humanizeChapterStatusZh(activeChapterSummary.status)}，通读时更适合先抓整体阅读感，再决定要不要回正文继续打磨。`;
  }, [activeChapterSummary]);
  const previewNextAction = activeChapterSummary
    ? activeChapterSummary.status === "done"
      ? "通读发现问题先回写作页；如果需要逐段核对，再切到细读。"
      : "先确认整体顺不顺，再决定是回写作补正文，还是继续推进到定稿。"
    : "先从章节目录选择一章，正文区会自动切换到对应内容。";

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
          <div className="review-side-title">当前通读范围</div>
          <div className="review-side-copy">
            {effectiveActiveId
              ? `你正在顺着阅读 ${currentChapterLabel}。如果想只检查定稿章节，可以切到“只看定稿”。`
              : "先从目录里选一章，正文区会自动切换到对应章节。"}
          </div>
          <div className="review-side-chip-row">
            <span className="manuscript-chip">{currentScopeLabel}</span>
            <span className="manuscript-chip">{doneCount}/{sortedChapters.length} 已定稿</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-2">
        <ChapterVirtualList
          chapters={visibleChapters}
          activeId={effectiveActiveId}
          ariaLabel="章节列表"
          className="h-full"
          emptyState={
            sortedChapters.length === 0 ? (
              <FeedbackEmptyState
                variant="compact"
                kicker="章节目录"
                title="暂无章节"
                description="先回写作台创建第一章，通读台才会开始形成完整阅读路径。"
                className="w-full"
              />
            ) : (
              <FeedbackEmptyState
                variant="compact"
                kicker="章节目录"
                title="暂无已定稿章节"
                description="先把至少一章推进到定稿，通读时的节奏判断才更接近真实阅读。"
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

  if (!chapterListQuery.hasLoaded && chapterListQuery.loading) return <div className="text-subtext">加载中...</div>;

  return (
    <PaperContent className="grid gap-4 pb-24">
      <EditorialHero
        kicker="通读台"
        title="像读者一样顺着读，先判断节奏是否顺。"
        subtitle="这里优先看章节的整体阅读感、转场、段落长度和收束力度。发现问题后，再回写作页修改，或进入细读继续做逐段核对。"
        variant="compact"
        items={[
          { key: "chapter", label: "当前章节", value: currentChapterLabel },
          { key: "progress", label: "定稿进度", value: `${doneCount}/${sortedChapters.length} 章已定稿` },
          { key: "scope", label: "当前范围", value: currentScopeLabel },
        ]}
      />

      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-secondary xl:hidden" onClick={() => setMobileListOpen(true)} type="button">
            <List size={16} />
            章节目录
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
          {activeChapterSummary ? (
            <button className="btn btn-secondary" onClick={() => openReader(activeChapterSummary.id)} type="button">
              <StickyNote size={16} />
              进入细读
            </button>
          ) : null}
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{activeChapterSummary ? "已选章节" : "等待选择章节"}</span>
          <span className="manuscript-chip">{currentScopeLabel}</span>
          <span className="manuscript-chip">快捷键：← / →</span>
        </div>
      </section>

      <div className="manuscript-shell xl:grid-cols-[280px_minmax(0,1fr)_300px]">
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
                      <div className="editorial-kicker">当前通读章节</div>
                      <div className="review-reading-summary-title">{currentChapterLabel}</div>
                      <div className="review-reading-summary-copy">{currentSummaryLine}</div>
                    </div>
                    <div className="review-side-chip-row mt-0">
                      <span className="manuscript-chip">{humanizeChapterStatusZh(activeChapterSummary.status)}</span>
                      <span className="manuscript-chip">{currentScopeLabel}</span>
                      <span className="manuscript-chip">更新于 {currentUpdatedLabel}</span>
                    </div>
                  </div>
                  <div className="review-reading-summary-grid">
                    <div className="review-reading-summary-card is-emphasis">
                      <div className="review-reading-summary-label">章节状态</div>
                      <div className="review-reading-summary-value">{humanizeChapterStatusZh(activeChapterSummary.status)}</div>
                      <div className="review-reading-summary-copy-small">向导会以“定稿”作为写完判定，通读更适合帮你判断这一章是否已经读起来顺了。</div>
                    </div>
                    <div className="review-reading-summary-card">
                      <div className="review-reading-summary-label">本章规模</div>
                      <div className="review-reading-summary-value">{activeTextCount} 字</div>
                      <div className="review-reading-summary-copy-small">如果读起来拖沓，通常先看段落长度、信息密度和桥段衔接是否重复。</div>
                    </div>
                    <div className="review-reading-summary-card">
                      <div className="review-reading-summary-label">推荐动作</div>
                      <div className="review-reading-summary-value">发现问题就回正文</div>
                      <div className="review-reading-summary-copy-small">{previewNextAction}</div>
                    </div>
                  </div>
                </div>

                <article className="manuscript-paper px-5 py-8 sm:px-8 lg:px-12">
                  <LazyMarkdownRenderer
                    className="atelier-content mx-auto max-w-4xl text-ink"
                    fallbackClassName="min-h-[240px]"
                    fallbackText="正在加载正文渲染器…"
                    content={loadingChapter ? "_(loading...)_" : activeChapter?.content_md || "_（空）_"}
                  />
                </article>
              </>
            ) : (
              <FeedbackEmptyState
                kicker="当前状态"
                title="暂无可预览内容"
                description="先从章节目录选择一章，或回到写作台创建新章节。"
              />
            )}
          </div>
        </section>

        <aside className="manuscript-inspector hidden xl:block">
          <div className="review-side-stack p-4">
            <div className="review-side-card is-muted">
              <div className="review-side-title">现在重点看什么</div>
              <div className="review-side-copy">
                通读时优先看节奏是否顺、段落是否拖沓、章节结尾是否有推进感，不必一开始就纠结每一句话的细节。
              </div>
              <div className="review-side-chip-row">
                <span className="manuscript-chip">{currentScopeLabel}</span>
                <span className="manuscript-chip">{doneCount}/{sortedChapters.length} 已定稿</span>
              </div>
            </div>

            <div className="review-side-card">
              <div className="review-side-title">当前状态</div>
              <div className="review-side-copy">章节：{currentChapterLabel}</div>
              <div className="review-side-copy">正文规模：{activeChapterSummary ? `${activeTextCount} 字` : "等待选择章节"}</div>
              <div className="review-side-copy">最近更新：{currentUpdatedLabel}</div>
            </div>

            <div className="review-side-card">
              <div className="review-side-title">推荐动作</div>
              <div className="review-side-copy">{previewNextAction}</div>
              <div className="mt-3 grid gap-2">
                {activeChapterSummary ? (
                  <button className="btn btn-secondary" onClick={() => openEditor(activeChapterSummary.id)} type="button">
                    <Edit3 size={16} />
                    回写正文
                  </button>
                ) : null}
                {activeChapterSummary ? (
                  <button className="btn btn-secondary" onClick={() => openReader(activeChapterSummary.id)} type="button">
                    <StickyNote size={16} />
                    转入细读
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Drawer
        open={mobileListOpen}
        onClose={() => setMobileListOpen(false)}
        side="bottom"
        overlayClassName="xl:hidden"
        ariaLabel="章节目录"
        panelClassName="flex h-[85vh] w-full flex-col overflow-hidden rounded-atelier border border-border bg-surface shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm text-ink">章节目录</div>
          <button className="btn btn-secondary" onClick={() => setMobileListOpen(false)} type="button">
            <ChevronLeft size={16} />
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1">{list}</div>
      </Drawer>

      <WizardNextBar projectId={projectId} currentStep="preview" progress={wizardProgress} loading={wizardLoading} />
    </PaperContent>
  );
}
