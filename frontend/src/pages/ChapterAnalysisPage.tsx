import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import clsx from "clsx";

import { AnnotatedText } from "../components/chapterAnalysis/AnnotatedText";
import { MemorySidebar } from "../components/chapterAnalysis/MemorySidebar";
import type { AnnotationLens } from "../components/chapterAnalysis/annotationLens";
import { buildAnnotationRevisionQueueSeed } from "../components/chapterAnalysis/revisionQueueDrafts";
import { ToolContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import { FeedbackCallout, FeedbackEmptyState } from "../components/ui/Feedback";
import { RequestIdBadge } from "../components/ui/RequestIdBadge";
import { labelForAnnotationType, type MemoryAnnotation } from "../components/chapterAnalysis/types";
import { UI_COPY } from "../lib/uiCopy";
import { createRequestSeqGuard } from "../lib/requestSeqGuard";
import { applyContinuityRevisionSearchParams } from "../lib/continuityRevisionBridge";
import { buildProjectWritePath } from "../lib/projectRoutes";
import type { ApiError } from "../services/apiClient";
import { apiJson } from "../services/apiClient";
import {
  readContinuityRevisionQueue,
  removeContinuityRevisionQueueItem as removeContinuityRevisionQueueItemFromStorage,
  setContinuityRevisionQueueItemProgress,
  type ContinuityRevisionQueueItem,
  upsertContinuityRevisionQueueItems,
} from "../services/continuityRevisionQueue";
import type { Chapter } from "../types";
import { useToast } from "../components/ui/toast";
import {
  buildChapterAnalysisActiveTaskSummary,
  buildChapterAnalysisSavedReviewAction,
  buildChapterAnalysisRevisionReturnCallout,
  filterChapterAnalysisRevisionQueue,
  getChapterAnalysisRevisionProgressBadge,
  parseChapterAnalysisRevisionReturnStatus,
  type ChapterAnalysisRevisionQueueFilter,
  resolveChapterAnalysisAutoFocus,
  resolveChapterAnalysisQueueNavigation,
  resolveChapterAnalysisReturnTarget,
} from "./chapterAnalysisPageModels";

function compactPreview(text: string | null | undefined, limit = 120): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

export function ChapterAnalysisPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const chapterId = searchParams.get("chapterId");
  const annotationId = searchParams.get("annotationId");
  const revisionStatus = parseChapterAnalysisRevisionReturnStatus(searchParams.get("revisionStatus"));
  const toast = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [annotations, setAnnotations] = useState<MemoryAnnotation[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [annotationLens, setAnnotationLens] = useState<AnnotationLens>("all");
  const [hoveredAnnotationIds, setHoveredAnnotationIds] = useState<string[]>([]);
  const [scrollToAnnotationId, setScrollToAnnotationId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [revisionQueue, setRevisionQueue] = useState<ContinuityRevisionQueueItem[]>([]);
  const [revisionQueueFilter, setRevisionQueueFilter] = useState<ChapterAnalysisRevisionQueueFilter>("all");
  const loadGuardRef = useRef(createRequestSeqGuard());
  const consumedAnnotationFocusRef = useRef("");

  useEffect(() => {
    const guard = loadGuardRef.current;
    return () => guard.invalidate();
  }, []);

  useEffect(() => {
    loadGuardRef.current.invalidate();
    setLoading(false);
    setChapter(null);
    setAnnotations([]);
    setActiveAnnotationId(null);
    setAnnotationLens("all");
    setHoveredAnnotationIds([]);
    setScrollToAnnotationId(null);
    setRequestId(null);
    setRevisionQueueFilter("all");
    consumedAnnotationFocusRef.current = "";
  }, [chapterId]);

  useEffect(() => {
    if (annotationLens === "all") return;
    if (annotations.some((annotation) => annotation.type === annotationLens)) return;
    setAnnotationLens("all");
  }, [annotationLens, annotations]);

  useEffect(() => {
    if (!projectId || !chapterId) {
      setRevisionQueue([]);
      return;
    }
    setRevisionQueue(readContinuityRevisionQueue(projectId, chapterId));
  }, [chapterId, projectId]);

  const refresh = useCallback(async () => {
    if (!chapterId) return;

    const seq = loadGuardRef.current.next();
    setLoading(true);
    try {
      const [chapterRes, annotationsRes] = await Promise.all([
        apiJson<{ chapter: Chapter }>(`/api/chapters/${chapterId}`),
        apiJson<{ annotations: MemoryAnnotation[] }>(`/api/chapters/${chapterId}/annotations`),
      ]);
      if (!loadGuardRef.current.isLatest(seq)) return;

      setChapter(chapterRes.data.chapter);
      setAnnotations(annotationsRes.data.annotations ?? []);
      setRequestId(annotationsRes.request_id ?? chapterRes.request_id ?? null);
    } catch (e) {
      if (!loadGuardRef.current.isLatest(seq)) return;
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
      setRequestId(err.requestId || null);
      setChapter(null);
      setAnnotations([]);
    } finally {
      if (loadGuardRef.current.isLatest(seq)) {
        setLoading(false);
      }
    }
  }, [chapterId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const content = chapter?.content_md ?? "";
  const { validAnnotations, validIds, invalidCount } = useMemo(() => {
    const valid: MemoryAnnotation[] = [];
    const validIds = new Set<string>();
    let invalid = 0;
    const textLen = content.length;
    for (const ann of annotations) {
      const position = ann.position;
      const length = ann.length;
      const ok = position >= 0 && length > 0 && position + length <= textLen;
      if (ok) {
        valid.push(ann);
        validIds.add(ann.id);
      } else {
        invalid += 1;
      }
    }
    return { validAnnotations: valid, validIds, invalidCount: invalid };
  }, [annotations, content]);

  const selectAnnotation = useCallback(
    (ann: MemoryAnnotation, opts?: { scroll?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      if (chapterId) next.set("chapterId", chapterId);
      if (next.get("annotationId") !== ann.id) {
        next.set("annotationId", ann.id);
        next.delete("revisionStatus");
        setSearchParams(next, { replace: true });
      }
      setActiveAnnotationId(ann.id);
      if (!opts?.scroll) return;
      if (!validIds.has(ann.id)) return;
      setScrollToAnnotationId(null);
      window.requestAnimationFrame(() => setScrollToAnnotationId(ann.id));
    },
    [chapterId, searchParams, setSearchParams, validIds],
  );

  useEffect(() => {
    const focusKey = chapterId && annotationId ? `${chapterId}:${annotationId}` : "";
    if (!focusKey) {
      consumedAnnotationFocusRef.current = "";
      return;
    }
    if (consumedAnnotationFocusRef.current === focusKey) return;

    const autoFocus = resolveChapterAnalysisAutoFocus(annotations, annotationId, validIds);
    if (!autoFocus.annotation) return;

    consumedAnnotationFocusRef.current = focusKey;
    selectAnnotation(autoFocus.annotation, { scroll: autoFocus.shouldScroll });
  }, [annotationId, annotations, chapterId, selectAnnotation, validIds]);

  const currentChapterLabel = chapter
    ? `第 ${chapter.number} 章 · ${(chapter.title ?? "").trim() || "（无标题）"}`
    : chapterId
      ? "正在载入已选章节"
      : "尚未选择章节";
  const matchedCount = validAnnotations.length;
  const activeAnnotation = useMemo(
    () => annotations.find((item) => item.id === activeAnnotationId) ?? null,
    [activeAnnotationId, annotations],
  );
  const activeAnnotationValid = activeAnnotation ? validIds.has(activeAnnotation.id) : false;
  const activeAnnotationLabel = activeAnnotation ? compactPreview(activeAnnotation.title || activeAnnotation.content, 72) : "尚未选择条目";
  const jumpActionLabel = !activeAnnotation ? "先选条目" : activeAnnotationValid ? "回到当前高亮" : "当前条目未定位";
  const analysisActionCopy = chapterId
    ? matchedCount > 0
      ? "先点正文高亮，再对照右侧命中详情；发现问题后直接回写作页修正。"
      : "当前没有可定位高亮，适合先检查章节内容是否为空，或刷新命中后再看。"
    : "先从写作页、通读页或细读页选中一章，再开始连续性检查。";
  const jumpToActiveAnnotation = useCallback(() => {
    if (!activeAnnotation || !validIds.has(activeAnnotation.id)) return;
    setScrollToAnnotationId(null);
    window.requestAnimationFrame(() => setScrollToAnnotationId(activeAnnotation.id));
  }, [activeAnnotation, validIds]);
  const activeAnnotationExcerpt =
    activeAnnotation && activeAnnotationValid
      ? content.slice(activeAnnotation.position, activeAnnotation.position + activeAnnotation.length).trim()
      : "";
  const activeRevisionQueueId = activeAnnotationId ?? annotationId;
  const activeAnnotationQueued = activeAnnotation ? revisionQueue.some((item) => item.id === activeAnnotation.id) : false;
  const revisionQueueFilterSummary = filterChapterAnalysisRevisionQueue({
    queue: revisionQueue,
    filter: revisionQueueFilter,
    activeId: activeRevisionQueueId,
  });
  const filteredRevisionQueue = revisionQueueFilterSummary.items;
  const revisionQueueNavigation = resolveChapterAnalysisQueueNavigation(filteredRevisionQueue, activeRevisionQueueId);
  const activeQueueItem = revisionQueue.find((item) => item.id === activeRevisionQueueId) ?? null;
  const activeRevisionProgressStatus =
    revisionStatus === "dirty" || revisionStatus === "saved" ? revisionStatus : activeQueueItem?.progressStatus ?? null;
  const activeTaskSummary = buildChapterAnalysisActiveTaskSummary({
    annotation: activeAnnotation,
    validIds,
    isQueued: activeAnnotationQueued,
    queueTotal: revisionQueue.length,
    queueActiveIndex: revisionQueueNavigation.activeIndex,
    hasNextQueuedItem: Boolean(revisionQueueNavigation.nextId),
    progressStatus: activeRevisionProgressStatus,
  });
  const savedReviewAction = buildChapterAnalysisSavedReviewAction({
    filter: revisionQueueFilter,
    activeId: activeRevisionQueueId,
    activeProgressStatus: activeRevisionProgressStatus,
    visibleQueue: filteredRevisionQueue,
  });
  const revisionReturnCallout =
    activeAnnotation && activeRevisionQueueId === activeAnnotation.id
      ? buildChapterAnalysisRevisionReturnCallout(revisionStatus)
      : null;
  const queueActiveAnnotation = useCallback(() => {
    if (!projectId || !chapterId || !activeAnnotation) return false;
    const seed = buildAnnotationRevisionQueueSeed(activeAnnotation, content, validIds);
    const nextItems = upsertContinuityRevisionQueueItems(projectId, chapterId, [
      {
        id: seed.id,
        chapterId,
        title: seed.title,
        type: seed.type,
        excerpt: seed.excerpt,
        hasExcerpt: seed.hasExcerpt,
      },
    ]);
    setRevisionQueue(nextItems);
    return true;
  }, [activeAnnotation, chapterId, content, projectId, validIds]);
  const openRevisionInWriting = useCallback(() => {
    if (!projectId || !chapterId || !activeAnnotation) return;
    queueActiveAnnotation();
    const next = applyContinuityRevisionSearchParams(new URLSearchParams(), {
      id: activeAnnotation.id,
      chapterId,
      title: activeAnnotation.title || compactPreview(activeAnnotation.content, 72),
      type: activeAnnotation.type,
      excerpt: activeAnnotationExcerpt,
    });
    next.set("chapterId", chapterId);
    const query = next.toString();
    const href = buildProjectWritePath(projectId);
    navigate(query ? `${href}?${query}` : href);
  }, [activeAnnotation, activeAnnotationExcerpt, chapterId, navigate, projectId, queueActiveAnnotation]);
  const addCurrentRevisionToQueue = useCallback(() => {
    if (!activeAnnotation) return;
    const queued = queueActiveAnnotation();
    if (!queued) return;
    toast.toastSuccess("已加入修订队列");
  }, [activeAnnotation, queueActiveAnnotation, toast]);
  const activateRevisionQueueItem = useCallback(
    (itemId: string) => {
      if (!chapterId) return;
      const item = revisionQueue.find((entry) => entry.id === itemId);
      if (!item) return;

      const next = new URLSearchParams(searchParams);
      next.set("chapterId", chapterId);
      next.set("annotationId", item.id);
      next.delete("revisionStatus");
      setSearchParams(next, { replace: true });

      const annotation = annotations.find((entry) => entry.id === item.id);
      if (!annotation) return;
      selectAnnotation(annotation, { scroll: validIds.has(annotation.id) });
    },
    [annotations, chapterId, revisionQueue, searchParams, selectAnnotation, setSearchParams, validIds],
  );
  const activatePreviousRevisionQueueItem = useCallback(() => {
    if (!revisionQueueNavigation.previousId) return;
    activateRevisionQueueItem(revisionQueueNavigation.previousId);
  }, [activateRevisionQueueItem, revisionQueueNavigation.previousId]);
  const activateNextRevisionQueueItem = useCallback(() => {
    if (!revisionQueueNavigation.nextId) return;
    activateRevisionQueueItem(revisionQueueNavigation.nextId);
  }, [activateRevisionQueueItem, revisionQueueNavigation.nextId]);
  const activateFirstFilteredRevisionQueueItem = useCallback(() => {
    const firstItem = filteredRevisionQueue[0];
    if (!firstItem) return;
    activateRevisionQueueItem(firstItem.id);
  }, [activateRevisionQueueItem, filteredRevisionQueue]);
  const completeRevisionReviewAndReturnToWriting = useCallback(() => {
    if (!projectId || !chapterId || !activeAnnotation || !activeAnnotationQueued) return;

    const nextTarget = resolveChapterAnalysisReturnTarget(revisionQueue, activeAnnotation.id);
    const nextItems = removeContinuityRevisionQueueItemFromStorage(projectId, chapterId, activeAnnotation.id);
    setRevisionQueue(nextItems);

    const next = new URLSearchParams();
    next.set("chapterId", chapterId);
    if (nextTarget) {
      const params = applyContinuityRevisionSearchParams(next, {
        id: nextTarget.id,
        chapterId: nextTarget.chapterId,
        title: nextTarget.title,
        type: nextTarget.type,
        excerpt: nextTarget.excerpt,
      });
      navigate(`${buildProjectWritePath(projectId)}?${params.toString()}`);
      toast.toastSuccess("当前问题已复核，已回写作继续下一条");
      return;
    }

    navigate(`${buildProjectWritePath(projectId)}?${next.toString()}`);
    toast.toastSuccess("当前问题已复核，已回写作");
  }, [activeAnnotation, activeAnnotationQueued, chapterId, navigate, projectId, revisionQueue, toast]);
  const clearSavedReviewStatusAndAdvance = useCallback(() => {
    if (!projectId || !chapterId || !activeRevisionQueueId || !savedReviewAction) return;

    const nextItems = setContinuityRevisionQueueItemProgress(projectId, chapterId, activeRevisionQueueId, null);
    setRevisionQueue(nextItems);

    if (savedReviewAction.nextTargetId) {
      activateRevisionQueueItem(savedReviewAction.nextTargetId);
      toast.toastSuccess(savedReviewAction.completionMessage);
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete("revisionStatus");
    setSearchParams(next, { replace: true });
    toast.toastSuccess(savedReviewAction.completionMessage);
  }, [
    activateRevisionQueueItem,
    activeRevisionQueueId,
    chapterId,
    projectId,
    savedReviewAction,
    searchParams,
    setSearchParams,
    toast,
  ]);

  return (
    <ToolContent className="grid min-w-0 gap-4 overflow-x-hidden">
      <EditorialHero
        kicker="连续性台"
        title="把正文里的关键句和记忆命中对齐，逐段检查是否前后一致。"
        subtitle="这页适合在细读之后继续排查设定冲突、人物状态错位和剧情事实打架。高亮只负责帮你定位问题，不会自动改正文。"
        items={[
          { key: "chapter", label: "当前章节", value: currentChapterLabel },
          { key: "matched", label: "已定位高亮", value: `${matchedCount} 条` },
          {
            key: "invalid",
            label: "潜在漏项",
            value: invalidCount ? `${invalidCount} 条未能映射回正文` : "当前没有未定位命中",
          },
        ]}
      />

      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <RequestIdBadge requestId={requestId} />
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                if (!projectId) return;
                const next = new URLSearchParams();
                if (chapterId) next.set("chapterId", chapterId);
                const qs = next.toString();
                const base = buildProjectWritePath(projectId);
                navigate(qs ? `${base}?${qs}` : base);
              }}
            >
              回到写作
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void refresh()}
              disabled={!chapterId || loading}
            >
              {loading ? UI_COPY.common.loading : "刷新命中"}
            </button>
            {chapterId ? (
              <button
                className="btn btn-ghost px-2 py-1 text-xs"
                type="button"
                title="仅清除 URL 中的 chapterId，不会删除章节。"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("chapterId");
                  next.delete("annotationId");
                  next.delete("revisionStatus");
                  setSearchParams(next, { replace: true });
                }}
              >
                清除选择
              </button>
            ) : null}
          </div>
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{chapterId ? "已选章节" : "等待选择章节"}</span>
          <span className="manuscript-chip">高亮 {matchedCount} 条</span>
          <span className="manuscript-chip">{invalidCount ? `未定位 ${invalidCount} 条` : "无未定位命中"}</span>
        </div>
      </section>

      <section className="review-track-panel">
        <div className="editorial-kicker">怎么用这页</div>
        <div className="mt-3 max-w-3xl text-sm leading-7 text-subtext">
          连续性页负责把正文里的关键句和记忆命中对齐。它不会替你改稿，但会尽量把问题位置和参考条目摆到同一视线里。
        </div>
        <div className="review-track-grid">
          <div className="review-track-card is-emphasis">
            <div className="review-track-label">先看什么</div>
            <div className="review-track-value">正文高亮</div>
            <div className="review-track-copy">先看高亮落点，再确认这段话和人物状态、设定事实是否一致。</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">怎么处理</div>
            <div className="review-track-value">侧栏核对</div>
            <div className="review-track-copy">{analysisActionCopy}</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">限制说明</div>
            <div className="review-track-value">只做定位</div>
            <div className="review-track-copy">
              高亮只展示能准确映射回正文的位置；未定位命中会保留在右侧列表里，方便继续排查。
            </div>
          </div>
        </div>
      </section>

      {invalidCount > 0 ? (
        <FeedbackCallout className="text-sm" tone="warning" title="有部分记忆还没定位到正文">
          有 {invalidCount} 条记忆未定位到正文，已从高亮中过滤；它们仍会保留在右侧侧栏，方便你继续排查。
        </FeedbackCallout>
      ) : null}

      <section className="research-guide-panel">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">当前核对范围</div>
            <div className="studio-cluster-copy">
              这一层先告诉我们“现在在看哪一章、当前是否选中了具体条目、右侧该如何配合正文工作”。
            </div>
          </div>
          <div className="studio-cluster-meta">{chapterId ? "已进入章节核对" : "等待选择章节"}</div>
        </div>
        <div className="result-overview-grid lg:grid-cols-4">
          <div className="result-overview-card is-emphasis">
            <div className="result-overview-label">正文状态</div>
            <div className="result-overview-value">{chapter ? currentChapterLabel : "尚未加载章节"}</div>
            <div className="result-overview-copy">
              {chapter?.content_md?.trim()
                ? "正文已就绪，可以直接对照高亮和右侧命中。"
                : "正文为空时只能先看侧栏，无法做高亮核对。"}
            </div>
          </div>
          <div className="result-overview-card">
            <div className="result-overview-label">当前命中</div>
            <div className="result-overview-value">
              已定位 {matchedCount} 条{invalidCount ? ` / 未定位 ${invalidCount} 条` : ""}
            </div>
            <div className="result-overview-copy">{analysisActionCopy}</div>
          </div>
          <div className="result-overview-card">
            <div className="result-overview-label">当前选中</div>
            <div className="result-overview-value">
              {activeAnnotation ? compactPreview(activeAnnotation.title || activeAnnotation.content, 80) : "尚未选择条目"}
            </div>
            <div className="result-overview-copy">
              {activeAnnotation
                ? `类型：${activeAnnotation.type} · 重要度 ${(activeAnnotation.importance * 10).toFixed(1)}`
                : "先点正文高亮或右侧条目，后续动作会更聚焦。"}
            </div>
          </div>
          <div className="result-overview-card">
            <div className="result-overview-label">推荐顺序</div>
            <div className="result-overview-value">正文定位 → 侧栏处理</div>
            <div className="result-overview-copy">
              先在正文里确认冲突位置，再到右侧编辑、合并或标记完成，判断会更稳。
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section className="manuscript-editor min-h-0 min-w-0">
          {loading ? (
            <div className="rounded-atelier border border-border bg-canvas p-4" aria-busy="true" aria-live="polite">
              <span className="sr-only">{UI_COPY.common.loading}</span>
              <div className="grid gap-2">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-4 w-11/12" />
                <div className="skeleton h-4 w-3/4" />
              </div>
            </div>
          ) : !chapterId ? (
            <FeedbackEmptyState
              className="rounded-atelier border border-border bg-canvas px-5 py-10"
              title="先选一章再开始连续性检查"
              description="可以先从写作页、细读页或通读页选中一章，再回到这里逐条核对正文与记忆命中。"
            />
          ) : !chapter ? (
            <FeedbackEmptyState
              className="rounded-atelier border border-border bg-canvas px-5 py-10"
              title="没有加载到当前章节"
              description="请先刷新命中结果；如果仍然为空，可以回写作页重新选择章节后再回来。"
            />
          ) : !(chapter.content_md ?? "").trim() ? (
            <FeedbackEmptyState
              className="rounded-atelier border border-border bg-canvas px-5 py-10"
              title="当前章节还没有正文"
              description="正文为空时暂时无法做连续性核对。先补一版内容，再回来检查人物状态和设定事实是否一致。"
            />
          ) : (
            <div className="manuscript-review-shell">
              <section className="manuscript-review-header">
                <div className="manuscript-review-header-row">
                  <div>
                    <div className="editorial-kicker">正文核对台</div>
                    <div className="manuscript-review-title">把冲突位置和当前条目稳定地放在同一视线里</div>
                    <div className="manuscript-review-copy">
                      这里优先服务“阅读判断”。先沿着正文读高亮，再决定是否切到右侧做治理动作，不要一上来就直接改记忆。
                    </div>
                  </div>
                </div>
                <div className="manuscript-status-list mt-4">
                  <span className="manuscript-chip">当前章节：{currentChapterLabel}</span>
                  <span className="manuscript-chip">已定位 {matchedCount} 条</span>
                  <span className="manuscript-chip">{invalidCount ? `未定位 ${invalidCount} 条` : "无未定位命中"}</span>
                  <span className="manuscript-chip">当前条目：{activeAnnotationLabel}</span>
                </div>
              </section>

              <div className="manuscript-paper p-4 sm:p-6">
                <div className="manuscript-paper-stage">
                  <div>
                    <div className="manuscript-paper-stage-title">正文阅读区</div>
                    <div className="manuscript-paper-stage-copy">
                      选中高亮后，右侧会同步聚焦当前条目；如果一段正文同时命中多个记忆点，优先处理重叠命中更高的地方。
                    </div>
                  </div>
                  <div className="manuscript-status-list">
                    <span className="manuscript-chip">{activeAnnotation ? `已选：${activeAnnotationLabel}` : "未选中高亮"}</span>
                    <span className="manuscript-chip">{matchedCount > 0 ? "可直接点正文定位" : "等待命中结果"}</span>
                  </div>
                </div>

                <AnnotatedText
                  content={content}
                  annotations={validAnnotations}
                  annotationLens={annotationLens}
                  activeAnnotationId={activeAnnotationId}
                  hoveredAnnotationIds={hoveredAnnotationIds}
                  scrollToAnnotationId={scrollToAnnotationId}
                  onAnnotationClick={(a, opts) => selectAnnotation(a, opts)}
                  onAnnotationLensChange={setAnnotationLens}
                  onHoverAnnotationIdsChange={setHoveredAnnotationIds}
                />
              </div>
            </div>
          )}
        </section>

        <div className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-11.5rem)] lg:overflow-auto">
          {loading ? (
            <aside className="min-w-0 grid gap-3" aria-busy="true" aria-live="polite">
              <span className="sr-only">{UI_COPY.common.loading}</span>
              <div className="rounded-atelier border border-border bg-surface p-3">
                <div className="skeleton h-4 w-24" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="skeleton h-7 w-20" />
                  <div className="skeleton h-7 w-24" />
                  <div className="skeleton h-7 w-16" />
                </div>
              </div>
              <div className="rounded-atelier border border-border bg-surface p-2">
                <div className="grid gap-2 p-3">
                  <div className="skeleton h-4 w-32" />
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                </div>
              </div>
            </aside>
          ) : (
            <div className="review-side-stack">
              <section className="research-guide-panel">
                <div className="studio-cluster-header">
                  <div>
                    <div className="studio-cluster-title">右侧核对工作台</div>
                    <div className="studio-cluster-copy">
                      右侧不是单纯的命中列表，而是这次连续性核对的操作区。先选条目，再决定编辑、合并还是标记完成。
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={addCurrentRevisionToQueue}
                      disabled={!activeAnnotation || !projectId || !chapterId}
                      title={activeAnnotation ? "把当前问题先加入整章修订队列" : "先选中一条正文高亮或右侧条目"}
                    >
                      加入修订队列
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={completeRevisionReviewAndReturnToWriting}
                      disabled={!activeAnnotation || !projectId || !chapterId || !activeAnnotationQueued}
                      title={
                        activeAnnotation
                          ? activeAnnotationQueued
                            ? "把当前条目视为已复核，并回写作页继续处理队列里的下一条"
                            : "先把当前条目加入修订队列，才能按队列顺序回写作继续处理"
                          : "先选中一条正文高亮或右侧条目"
                      }
                    >
                      复核完成，回写作继续下一条
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={openRevisionInWriting}
                      disabled={!activeAnnotation || !projectId || !chapterId}
                      title={
                        activeAnnotation
                          ? "把当前条目带回写作页，直接开始修订"
                          : "先选中一条正文高亮或右侧条目"
                      }
                    >
                      带着当前条目去改稿
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={jumpToActiveAnnotation}
                      disabled={!activeAnnotationValid}
                      title={
                        activeAnnotationValid
                          ? "把正文滚动回当前选中条目的高亮位置"
                          : activeAnnotation
                            ? "当前条目暂时未定位到正文，无法回跳"
                            : "先选中一条正文高亮或右侧条目"
                      }
                    >
                      {jumpActionLabel}
                    </button>
                    <div className="studio-cluster-meta">{activeAnnotation ? "已锁定当前条目" : "等待选择条目"}</div>
                  </div>
                </div>
                <div className="result-overview-grid lg:grid-cols-2">
                  <div className="result-overview-card is-emphasis">
                    <div className="result-overview-label">当前条目</div>
                    <div className="result-overview-value">
                      {activeAnnotation ? compactPreview(activeAnnotation.title || activeAnnotation.content, 64) : "尚未选择"}
                    </div>
                    <div className="result-overview-copy">
                      {activeAnnotation
                        ? activeAnnotationValid
                          ? "已经可以回到正文高亮并直接进入治理动作。"
                          : "当前条目还没法回正文定位，更适合先编辑内容或合并。"
                        : "点击正文高亮或侧栏命中项后，这里会同步聚焦。"}
                    </div>
                  </div>
                  <div className="result-overview-card">
                    <div className="result-overview-label">修订队列</div>
                    <div className="result-overview-value">
                      {activeAnnotation
                        ? activeAnnotationQueued
                          ? `当前条目已在队列中 · 共 ${revisionQueue.length} 条`
                          : `当前条目未入队 · 队列 ${revisionQueue.length} 条`
                        : `当前队列 ${revisionQueue.length} 条`}
                    </div>
                    <div className="result-overview-copy">
                      {activeAnnotation
                        ? activeAnnotationQueued
                          ? "复核完当前条目后，可以直接回写作页继续处理下一条，不必手动重新找上下文。"
                          : "先把当前条目加入修订队列，再回写作页，连续处理多条问题会更顺。"
                        : "先选中一条正文高亮或右侧条目，再决定是否把它纳入整章修订队列。"}
                    </div>
                  </div>
                </div>
                {activeTaskSummary ? (
                  <section className="mt-4 rounded-atelier border border-border bg-canvas/80 p-4">
                    {revisionReturnCallout ? (
                      <FeedbackCallout
                        className="mb-4"
                        tone={revisionReturnCallout.tone}
                        title={revisionReturnCallout.title}
                      >
                        {revisionReturnCallout.copy}
                      </FeedbackCallout>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.14em] text-subtext">当前修订任务</div>
                        <div className="mt-1 text-base font-semibold text-ink">{activeTaskSummary.title}</div>
                        <div className="mt-1 text-sm leading-6 text-subtext">{activeTaskSummary.summary}</div>
                      </div>
                      <span
                        className={clsx(
                          "manuscript-chip",
                          activeTaskSummary.tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : "",
                        )}
                      >
                        {activeTaskSummary.tone === "warning" ? "建议优先处理" : "适合当前复核"}
                      </span>
                    </div>
                    <div className="manuscript-status-list mt-3">
                      {activeTaskSummary.badges.map((badge) => (
                        <span key={badge.key} className="manuscript-chip">
                          {badge.label}：{badge.value}
                        </span>
                      ))}
                    </div>
                    {savedReviewAction ? (
                      <div className="mt-3 rounded-atelier border border-border bg-surface px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs leading-5 text-subtext">
                            仅清除“已保存待复核”状态，不会移出修订队列。
                          </div>
                          <button
                            className="btn btn-secondary btn-sm"
                            type="button"
                            onClick={clearSavedReviewStatusAndAdvance}
                          >
                            {savedReviewAction.label}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {activeTaskSummary.sections.map((section) => (
                        <div key={section.key} className="rounded-atelier border border-border bg-surface px-3 py-3">
                          <div className="text-xs font-medium uppercase tracking-[0.12em] text-subtext">{section.label}</div>
                          <div className="mt-2 text-sm font-semibold text-ink">{section.title}</div>
                          <div className="mt-1 text-xs leading-5 text-subtext">{section.copy}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {revisionQueue.length > 0 ? (
                  <section className="mt-4 rounded-atelier border border-border bg-canvas/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.14em] text-subtext">整章修订队列</div>
                        <div className="mt-1 text-base font-semibold text-ink">
                          {revisionQueueNavigation.activeIndex >= 0
                            ? `当前第 ${revisionQueueNavigation.activeIndex + 1} / ${revisionQueueNavigation.total} 条`
                            : `当前视图共 ${revisionQueueNavigation.total} 条`}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-subtext">
                          先在这里切到要处理的条目，再回正文看高亮，连续性核对会更稳。
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={activatePreviousRevisionQueueItem}
                          disabled={!revisionQueueFilterSummary.activeInView || !revisionQueueNavigation.previousId}
                        >
                          上一条
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={activateNextRevisionQueueItem}
                          disabled={!revisionQueueFilterSummary.activeInView || !revisionQueueNavigation.nextId}
                        >
                          下一条
                        </button>
                        <span className="manuscript-chip">队列 {revisionQueue.length} 条</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {([
                        ["all", "全部"],
                        ["dirty", "未保存改动"],
                        ["saved", "已保存待复核"],
                      ] as const).map(([filter, label]) => {
                        const active = revisionQueueFilter === filter;
                        return (
                          <button
                            key={filter}
                            className={clsx(
                              "rounded-full border px-3 py-1 text-xs transition-colors",
                              active ? "border-accent bg-accent/10 text-ink" : "border-border bg-surface text-subtext hover:border-accent/40",
                            )}
                            type="button"
                            onClick={() => setRevisionQueueFilter(filter)}
                          >
                            {label} {revisionQueueFilterSummary.counts[filter]}
                          </button>
                        );
                      })}
                    </div>
                    {!revisionQueueFilterSummary.activeInView && activeRevisionQueueId && filteredRevisionQueue.length > 0 ? (
                      <FeedbackCallout
                        className="mt-3 text-sm"
                        tone="info"
                        title="当前条目不在此过滤视图内"
                        actions={
                          <button
                            className="btn btn-secondary btn-sm"
                            type="button"
                            onClick={activateFirstFilteredRevisionQueueItem}
                          >
                            切到当前视图第一条
                          </button>
                        }
                      >
                        当前正文和任务卡仍保持原条目不变；如果要处理这个过滤视图里的问题，请直接点击下方列表项切换。
                      </FeedbackCallout>
                    ) : null}
                    {filteredRevisionQueue.length === 0 ? (
                      <FeedbackCallout
                        className="mt-3 text-sm"
                        tone="info"
                        title="这个视图里暂时没有条目"
                        actions={
                          revisionQueueFilter !== "all" ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              type="button"
                              onClick={() => setRevisionQueueFilter("all")}
                            >
                              查看全部队列
                            </button>
                          ) : null
                        }
                      >
                        {revisionQueueFilter === "dirty"
                          ? "当前没有“未保存改动”的修订项，说明还没有把改稿停在未保存状态。"
                          : revisionQueueFilter === "saved"
                            ? "当前没有“已保存待复核”的修订项，说明还没有需要回来复核的已保存改动。"
                            : "当前队列还没有条目。"}
                      </FeedbackCallout>
                    ) : null}
                    <div className="mt-3 grid gap-2">
                      {filteredRevisionQueue.map((item, index) => {
                        const itemActive = item.id === activeRevisionQueueId;
                        const progressBadge = getChapterAnalysisRevisionProgressBadge(item.progressStatus);
                        return (
                          <button
                            key={item.id}
                            className={clsx(
                              "flex w-full items-start justify-between gap-3 rounded-atelier border px-3 py-3 text-left transition-colors",
                              itemActive ? "border-accent bg-accent/5" : "border-border bg-surface hover:border-accent/40",
                            )}
                            type="button"
                            onClick={() => activateRevisionQueueItem(item.id)}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-subtext">#{index + 1}</span>
                                <div className="truncate text-sm font-semibold text-ink">{item.title}</div>
                                <span className="manuscript-chip">{labelForAnnotationType(item.type)}</span>
                                {progressBadge ? (
                                  <span
                                    className={clsx(
                                      "manuscript-chip",
                                      progressBadge.tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : "",
                                    )}
                                  >
                                    {progressBadge.label}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs leading-5 text-subtext">
                                {item.hasExcerpt ? item.excerpt || "已记录引用句，点击可回到对应条目。" : "当前条目没有可直接引用的正文片段。"}
                              </div>
                            </div>
                            <span className="manuscript-chip">{itemActive ? "当前条目" : "切换"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
                <FeedbackCallout className="mt-4" title="侧栏怎么配合正文使用">
                  右侧会按命中条目展示参考侧记。点击任一条目，正文会自动滚动到对应位置，方便你逐条核对。
                </FeedbackCallout>
              </section>
              <MemorySidebar
                projectId={projectId}
                chapterId={chapterId}
                content={content}
                annotations={annotations}
                validIds={validIds}
                annotationLens={annotationLens}
                activeAnnotationId={activeAnnotationId}
                hoveredAnnotationIds={hoveredAnnotationIds}
                onSelect={(a) => selectAnnotation(a, { scroll: true })}
                onAnnotationLensChange={setAnnotationLens}
                onHoverAnnotationIdsChange={setHoveredAnnotationIds}
                onRefresh={refresh}
                onSetActiveAnnotationId={setActiveAnnotationId}
              />
            </div>
          )}
        </div>
      </div>
    </ToolContent>
  );
}
