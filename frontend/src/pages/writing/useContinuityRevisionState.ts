import { useCallback, useEffect, useRef, useState } from "react";
import type { NavigateFunction, SetURLSearchParams } from "react-router-dom";

import { labelForAnnotationType } from "../../components/chapterAnalysis/types";
import {
  applyContinuityRevisionSearchParams,
  clearContinuityRevisionSearchParams,
  parseContinuityRevisionSearchParams,
} from "../../lib/continuityRevisionBridge";
import {
  readContinuityRevisionQueue,
  removeContinuityRevisionQueueItem as removeContinuityRevisionQueueItemFromStorage,
  setContinuityRevisionQueueItemProgress,
  type ContinuityRevisionProgressStatus,
} from "../../services/continuityRevisionQueue";
import type { Chapter } from "../../types";

import type { ChapterForm } from "./writingUtils";
import {
  getWritingContinuityRevisionChecklist,
  getWritingContinuityRevisionQueueNavigation,
} from "./writingPageModels";
import { getWritingAnalysisHref, type WritingRevisionStatus, WRITING_PAGE_COPY } from "./writingPageCopy";

type ContinuityRevisionToastApi = {
  toastError: (message: string) => void;
  toastSuccess: (message: string) => void;
};

type ContinuityRevisionQueueItem = {
  id: string;
  title: string;
  type: string;
  excerpt: string;
  hasExcerpt: boolean;
  progressStatus: ContinuityRevisionProgressStatus | null;
};

export function useContinuityRevisionState(args: {
  projectId?: string;
  activeChapter: Chapter | null;
  form: ChapterForm | null;
  dirty: boolean;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  navigate: NavigateFunction;
  toast: ContinuityRevisionToastApi;
  setContentEditorTab: (tab: "edit" | "preview") => void;
  contentTextareaRef: { current: HTMLTextAreaElement | null };
}) {
  const continuityRevision = parseContinuityRevisionSearchParams(args.searchParams);
  const [continuityRevisionLocated, setContinuityRevisionLocated] = useState(false);
  const [returnToContinuityAfterComplete, setReturnToContinuityAfterComplete] = useState(false);
  const [continuityRevisionQueue, setContinuityRevisionQueue] = useState<ContinuityRevisionQueueItem[]>([]);
  const continuityRevisionSessionRef = useRef("");
  const continuityRevisionBaselineContentRef = useRef<string | null>(null);

  const locateInEditor = useCallback(
    (excerpt: string) => {
      if (!excerpt || !args.form) return;
      const needleRaw = excerpt.trim();
      if (!needleRaw) return;

      const haystack = args.form.content_md ?? "";
      let needle = needleRaw;
      let index = haystack.indexOf(needle);
      if (index < 0 && needle.length > 20) {
        needle = needle.slice(0, 20);
        index = haystack.indexOf(needle);
      }
      if (index < 0) {
        args.toast.toastError(WRITING_PAGE_COPY.locateExcerptFailed);
        return;
      }

      args.setContentEditorTab("edit");
      window.requestAnimationFrame(() => {
        const element = args.contentTextareaRef.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(index, Math.min(haystack.length, index + needle.length));
      });
    },
    [args.contentTextareaRef, args.form, args.setContentEditorTab, args.toast],
  );

  const clearContinuityRevision = useCallback(() => {
    const next = clearContinuityRevisionSearchParams(new URLSearchParams(args.searchParams));
    args.setSearchParams(next, { replace: true });
  }, [args.searchParams, args.setSearchParams]);

  useEffect(() => {
    if (!continuityRevision || !args.activeChapter) return;
    if (args.activeChapter.id === continuityRevision.chapterId) return;
    const next = clearContinuityRevisionSearchParams(new URLSearchParams(args.searchParams));
    args.setSearchParams(next, { replace: true });
  }, [args.activeChapter, continuityRevision, args.searchParams, args.setSearchParams]);

  const activeContinuityRevision =
    continuityRevision && args.activeChapter?.id === continuityRevision.chapterId
      ? {
          ...continuityRevision,
          typeLabel: labelForAnnotationType(continuityRevision.type),
        }
      : null;
  const activeContinuityRevisionSessionKey = activeContinuityRevision
    ? `${activeContinuityRevision.chapterId}:${activeContinuityRevision.title}:${activeContinuityRevision.excerpt}`
    : "";

  useEffect(() => {
    if (!activeContinuityRevision || !args.form) {
      continuityRevisionSessionRef.current = "";
      continuityRevisionBaselineContentRef.current = null;
      setContinuityRevisionLocated(false);
      return;
    }
    if (continuityRevisionSessionRef.current === activeContinuityRevisionSessionKey) return;
    continuityRevisionSessionRef.current = activeContinuityRevisionSessionKey;
    continuityRevisionBaselineContentRef.current = args.form.content_md ?? "";
    setContinuityRevisionLocated(false);
  }, [activeContinuityRevision, activeContinuityRevisionSessionKey, args.form]);

  const continuityRevisionDraftChanged = Boolean(
    activeContinuityRevision &&
      args.form &&
      continuityRevisionBaselineContentRef.current !== null &&
      args.form.content_md !== continuityRevisionBaselineContentRef.current,
  );
  const continuityRevisionChecklist = activeContinuityRevision
    ? getWritingContinuityRevisionChecklist({
        hasExcerpt: activeContinuityRevision.hasExcerpt,
        located: continuityRevisionLocated,
        draftChanged: continuityRevisionDraftChanged,
        dirty: args.dirty,
      })
    : [];
  const continuityRevisionReturnStatus: WritingRevisionStatus = activeContinuityRevision
    ? continuityRevisionDraftChanged
      ? args.dirty
        ? "dirty"
        : "saved"
      : "unchanged"
    : "unchanged";
  const continuityRevisionReturnStatusParam =
    continuityRevisionReturnStatus === "unchanged" ? undefined : continuityRevisionReturnStatus;

  useEffect(() => {
    if (!args.projectId || !args.activeChapter?.id) {
      setContinuityRevisionQueue([]);
      return;
    }
    const items = readContinuityRevisionQueue(args.projectId, args.activeChapter.id).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      excerpt: item.excerpt,
      hasExcerpt: item.hasExcerpt,
      progressStatus: item.progressStatus,
    }));
    setContinuityRevisionQueue(items);
  }, [args.activeChapter?.id, args.projectId]);

  const activeContinuityRevisionProgressStatus: ContinuityRevisionProgressStatus | null =
    activeContinuityRevision
      ? continuityRevisionReturnStatusParam ??
        continuityRevisionQueue.find((item) => item.id === activeContinuityRevision.id)?.progressStatus ??
        null
      : null;
  const continuityRevisionQueueView = continuityRevisionQueue.map((item) => ({
    id: item.id,
    title: item.title,
    typeLabel: labelForAnnotationType(item.type),
    isActive: activeContinuityRevision?.id === item.id,
    progressStatus:
      activeContinuityRevision?.id === item.id ? activeContinuityRevisionProgressStatus : item.progressStatus,
  }));
  const continuityRevisionQueueNavigation = getWritingContinuityRevisionQueueNavigation(
    continuityRevisionQueueView.map((item) => ({ id: item.id, isActive: item.isActive })),
  );

  const activateContinuityRevisionQueueEntry = useCallback(
    (item: { id: string; title: string; type: string; excerpt: string }) => {
      if (!args.activeChapter) return;
      const next = applyContinuityRevisionSearchParams(new URLSearchParams(args.searchParams), {
        id: item.id,
        chapterId: args.activeChapter.id,
        title: item.title,
        type: item.type,
        excerpt: item.excerpt,
      });
      next.set("chapterId", args.activeChapter.id);
      args.setSearchParams(next, { replace: true });
    },
    [args.activeChapter, args.searchParams, args.setSearchParams],
  );

  const locateContinuityRevision = useCallback(() => {
    if (!activeContinuityRevision?.hasExcerpt) return;
    setContinuityRevisionLocated(true);
    locateInEditor(activeContinuityRevision.excerpt);
  }, [activeContinuityRevision, locateInEditor]);

  const returnToContinuityReview = useCallback(() => {
    if (!args.projectId || !activeContinuityRevision) return;
    if (continuityRevisionReturnStatusParam) {
      setContinuityRevisionQueueItemProgress(
        args.projectId,
        activeContinuityRevision.chapterId,
        activeContinuityRevision.id,
        continuityRevisionReturnStatusParam,
      );
    }
    args.navigate(
      getWritingAnalysisHref(
        args.projectId,
        activeContinuityRevision.chapterId,
        activeContinuityRevision.id,
        continuityRevisionReturnStatusParam,
      ),
    );
  }, [activeContinuityRevision, continuityRevisionReturnStatusParam, args.navigate, args.projectId]);

  const activateContinuityRevisionQueueItem = useCallback(
    (itemId: string) => {
      const item = continuityRevisionQueue.find((entry) => entry.id === itemId);
      if (!item) return;
      activateContinuityRevisionQueueEntry(item);
    },
    [activateContinuityRevisionQueueEntry, continuityRevisionQueue],
  );

  const removeContinuityRevisionQueueItem = useCallback(
    (itemId: string) => {
      if (!args.projectId || !args.activeChapter?.id) return;
      const nextItems = removeContinuityRevisionQueueItemFromStorage(args.projectId, args.activeChapter.id, itemId).map(
        (item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          excerpt: item.excerpt,
          hasExcerpt: item.hasExcerpt,
          progressStatus: item.progressStatus,
        }),
      );
      setContinuityRevisionQueue(nextItems);
      if (activeContinuityRevision?.id === itemId) {
        const next = clearContinuityRevisionSearchParams(new URLSearchParams(args.searchParams));
        args.setSearchParams(next, { replace: true });
      }
    },
    [args.activeChapter?.id, activeContinuityRevision?.id, args.projectId, args.searchParams, args.setSearchParams],
  );

  const activatePreviousContinuityRevision = useCallback(() => {
    if (!continuityRevisionQueueNavigation.previousId) return;
    const item = continuityRevisionQueue.find((entry) => entry.id === continuityRevisionQueueNavigation.previousId);
    if (!item) return;
    activateContinuityRevisionQueueEntry(item);
  }, [activateContinuityRevisionQueueEntry, continuityRevisionQueue, continuityRevisionQueueNavigation.previousId]);

  const activateNextContinuityRevision = useCallback(() => {
    if (!continuityRevisionQueueNavigation.nextId) return;
    const item = continuityRevisionQueue.find((entry) => entry.id === continuityRevisionQueueNavigation.nextId);
    if (!item) return;
    activateContinuityRevisionQueueEntry(item);
  }, [activateContinuityRevisionQueueEntry, continuityRevisionQueue, continuityRevisionQueueNavigation.nextId]);

  const completeContinuityRevisionAndAdvance = useCallback(() => {
    if (!args.projectId || !args.activeChapter?.id || !activeContinuityRevision) return;
    const completedRevisionId = activeContinuityRevision.id;
    const completedChapterId = args.activeChapter.id;
    const currentIndex = continuityRevisionQueue.findIndex((item) => item.id === activeContinuityRevision.id);
    const nextItems = removeContinuityRevisionQueueItemFromStorage(
      args.projectId,
      args.activeChapter.id,
      activeContinuityRevision.id,
    ).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      excerpt: item.excerpt,
      hasExcerpt: item.hasExcerpt,
      progressStatus: item.progressStatus,
    }));
    setContinuityRevisionQueue(nextItems);
    if (returnToContinuityAfterComplete) {
      const next = clearContinuityRevisionSearchParams(new URLSearchParams(args.searchParams));
      args.setSearchParams(next, { replace: true });
      args.navigate(getWritingAnalysisHref(args.projectId, completedChapterId, completedRevisionId, continuityRevisionReturnStatusParam));
      args.toast.toastSuccess("当前问题已移出队列，已回连续性台复核");
      return;
    }
    const nextTarget =
      (currentIndex >= 0 ? nextItems[currentIndex] : null) ??
      (currentIndex > 0 ? nextItems[currentIndex - 1] : null) ??
      null;
    if (nextTarget) {
      activateContinuityRevisionQueueEntry(nextTarget);
      args.toast.toastSuccess("当前问题已移出队列，已切到下一条");
      return;
    }
    const next = clearContinuityRevisionSearchParams(new URLSearchParams(args.searchParams));
    args.setSearchParams(next, { replace: true });
    args.toast.toastSuccess("当前问题已移出队列");
  }, [
    activateContinuityRevisionQueueEntry,
    args.activeChapter?.id,
    activeContinuityRevision,
    continuityRevisionQueue,
    returnToContinuityAfterComplete,
    continuityRevisionReturnStatusParam,
    args.projectId,
    args.searchParams,
    args.setSearchParams,
    args.navigate,
    args.toast,
  ]);

  return {
    activeContinuityRevision,
    activeContinuityRevisionProgressStatus,
    continuityRevisionChecklist,
    continuityRevisionQueueView,
    continuityRevisionQueueNavigation,
    returnToContinuityAfterComplete,
    setReturnToContinuityAfterComplete,
    locateContinuityRevision,
    returnToContinuityReview,
    clearContinuityRevision,
    activateContinuityRevisionQueueItem,
    removeContinuityRevisionQueueItem,
    activatePreviousContinuityRevision,
    activateNextContinuityRevision,
    completeContinuityRevisionAndAdvance,
    locateInEditor,
  };
}
