import type { ComponentProps } from "react";
import { useCallback, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { WizardNextBar } from "../../components/atelier/WizardNextBar";
import { useConfirm } from "../../components/ui/confirm";
import { useToast } from "../../components/ui/toast";
import { useAppMode } from "../../contexts/AppModeContext";
import { usePersistentOutletIsActive } from "../../hooks/usePersistentOutlet";
import { useWizardProgress } from "../../hooks/useWizardProgress";
import { buildProjectReviewPath } from "../../lib/projectRoutes";
import { ApiError, apiJson } from "../../services/apiClient";

import type {
  WritingChapterListDrawerProps,
  WritingEditorSectionProps,
  WritingPageOverlaysProps,
  WritingStreamFloatingCardProps,
  WritingWorkspaceProps,
} from "./WritingPageSections";
import { useApplyGenerationRun } from "./useApplyGenerationRun";
import { useBatchGeneration } from "./useBatchGeneration";
import { useChapterAnalysis } from "./useChapterAnalysis";
import { useChapterCrud } from "./useChapterCrud";
import { useChapterEditor } from "./useChapterEditor";
import { useChapterGeneration } from "./useChapterGeneration";
import { useContinuityRevisionState } from "./useContinuityRevisionState";
import { useGenerationHistory } from "./useGenerationHistory";
import { useOutlineSwitcher } from "./useOutlineSwitcher";
import { useWritingProjectQueryState } from "./useWritingProjectQueryState";
import { useWritingUiState } from "./useWritingUiState";
import type { ChapterForm } from "./writingUtils";
import {
  buildBatchTaskCenterHref,
  buildProjectTaskCenterHref,
  buildWritingTaskCenterHref,
  pickFirstProjectTaskId,
  type ChapterAutoUpdatesTriggerResult,
} from "./writingPageModels";
import {
  getWritingAnalysisHref,
  getWritingDoneOnlyWarning,
  getWritingGenerateIndicatorLabel,
  getWritingNextChapterReplaceTitle,
  WRITING_PAGE_COPY,
} from "./writingPageCopy";

export type WritingPageState = {
  loading: boolean;
  dirty: boolean;
  showUnsavedGuard: boolean;
  workspaceProps: WritingWorkspaceProps;
  chapterListDrawerProps: WritingChapterListDrawerProps;
  overlaysProps: WritingPageOverlaysProps;
  streamFloatingProps: WritingStreamFloatingCardProps;
  wizardBarProps: ComponentProps<typeof WizardNextBar>;
};

export function useWritingPageState(): WritingPageState {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedChapterId = searchParams.get("chapterId");
  const applyRunId = searchParams.get("applyRunId");
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { mode } = useAppMode();
  const appMode = mode ?? "focus";
  const outletActive = usePersistentOutletIsActive();
  const wizard = useWizardProgress(projectId);
  const refreshWizard = wizard.refresh;
  const bumpWizardLocal = wizard.bumpLocal;
  const {
    chapterListOpen,
    setChapterListOpen,
    contentEditorTab,
    setContentEditorTab,
    contentTextareaRef,
    autoGenerateNextRef,
    aiOpen,
    setAiOpen,
    studioToolsOpen,
    setStudioToolsOpen,
    promptInspectorOpen,
    setPromptInspectorOpen,
    postEditCompareOpen,
    setPostEditCompareOpen,
    contentOptimizeCompareOpen,
    setContentOptimizeCompareOpen,
    tablesOpen,
    setTablesOpen,
    contextPreviewOpen,
    setContextPreviewOpen,
    memoryUpdateOpen,
    setMemoryUpdateOpen,
    foreshadowOpen,
    setForeshadowOpen,
    autoUpdatesTriggering,
    setAutoUpdatesTriggering,
  } = useWritingUiState(appMode);

  const chapterEditor = useChapterEditor({
    projectId,
    requestedChapterId,
    searchParams,
    setSearchParams,
    toast,
    confirm,
    refreshWizard,
    bumpWizardLocal,
  });
  const {
    loading,
    chapters,
    refreshChapters,
    activeId,
    setActiveId,
    activeChapter,
    baseline,
    form,
    setForm,
    dirty,
    saveChapter,
    requestSelectChapter: requestSelectChapterBase,
    loadingChapter,
    saving,
  } = chapterEditor;
  const { outlines, outline, preset, characters, refreshWriting } = useWritingProjectQueryState({
    projectId,
    outletActive,
    dirty,
    refreshChapters,
    refreshWizard,
  });

  useEffect(() => {
    if (!activeChapter) autoGenerateNextRef.current = null;
  }, [activeChapter]);

  const isDoneReadonly = Boolean(baseline && form && baseline.status === "done" && form.status === "done");

  useApplyGenerationRun({
    applyRunId,
    activeChapter,
    form,
    dirty,
    confirm,
    toast,
    saveChapter,
    searchParams,
    setSearchParams,
    setForm,
  });

  const requestSelectChapter = useCallback(
    async (chapterId: string) => {
      autoGenerateNextRef.current = null;
      await requestSelectChapterBase(chapterId);
    },
    [requestSelectChapterBase],
  );

  const chapterCrud = useChapterCrud({
    projectId,
    chapters,
    activeChapter,
    setActiveId,
    requestSelectChapter,
    toast,
    confirm,
    bumpWizardLocal,
    refreshWizard,
  });

  const generation = useChapterGeneration({
    projectId,
    activeChapter,
    chapters,
    form,
    setForm,
    preset,
    dirty,
    saveChapter,
    requestSelectChapter,
    toast,
    confirm,
  });
  const {
    generating,
    genRequestId,
    genStreamProgress,
    genForm,
    setGenForm,
    postEditCompare,
    applyPostEditVariant,
    contentOptimizeCompare,
    applyContentOptimizeVariant,
    generate,
    abortGenerate,
  } = generation;

  const batch = useBatchGeneration({
    projectId,
    preset,
    activeChapter,
    chapters,
    genForm,
    searchParams,
    setSearchParams,
    requestSelectChapter,
    toast,
  });
  const analysis = useChapterAnalysis({ activeChapter, preset, genForm, form, setForm, dirty, saveChapter, toast });
  const history = useGenerationHistory({ projectId, toast });

  const activeOutlineId = outline?.id ?? "";
  const switchOutline = useOutlineSwitcher({
    projectId,
    activeOutlineId,
    dirty,
    confirm,
    toast,
    saveChapter,
    bumpWizardLocal,
    refreshWizard,
    refreshChapters,
    refreshWriting,
  });
  const {
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
  } = useContinuityRevisionState({
    projectId,
    activeChapter,
    form,
    dirty,
    searchParams,
    setSearchParams,
    navigate,
    toast,
    setContentEditorTab,
    contentTextareaRef,
  });

  const saveAndTriggerAutoUpdates = useCallback(async () => {
    if (!projectId || !activeChapter || autoUpdatesTriggering || !dirty) return;

    setAutoUpdatesTriggering(true);
    try {
      const ok = await saveChapter({ silent: true });
      if (!ok) return;

      const response = await apiJson<ChapterAutoUpdatesTriggerResult>(
        `/api/chapters/${activeChapter.id}/trigger_auto_updates`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      const taskId = pickFirstProjectTaskId(response.data.tasks);
      toast.toastSuccess(
        WRITING_PAGE_COPY.autoUpdatesCreated,
        response.request_id,
        taskId
          ? {
              label: WRITING_PAGE_COPY.openTaskCenter,
              onClick: () => {
                const href = buildProjectTaskCenterHref(projectId, taskId);
                if (href) navigate(href);
              },
            }
          : undefined,
      );
    } catch (error) {
      const err =
        error instanceof ApiError
          ? error
          : new ApiError({ code: "UNKNOWN", message: String(error), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setAutoUpdatesTriggering(false);
    }
  }, [activeChapter, autoUpdatesTriggering, dirty, navigate, projectId, saveChapter, toast]);

  const saveAndGenerateNext = useCallback(async () => {
    if (!activeChapter) return;

    const ok = await saveChapter();
    if (!ok) return;

    const sorted = [...chapters].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    const currentIndex = sorted.findIndex((chapter) => chapter.id === activeChapter.id);
    const nextChapter =
      currentIndex >= 0
        ? (sorted[currentIndex + 1] ?? null)
        : (sorted.find((chapter) => (chapter.number ?? 0) > (activeChapter.number ?? 0)) ?? null);

    if (!nextChapter) {
      toast.toastSuccess(WRITING_PAGE_COPY.saveAndGenerateLastChapter);
      return;
    }

    const nextHasContent = Boolean(nextChapter.has_content || nextChapter.has_summary);
    if (nextHasContent) {
      const replaceOk = await confirm.confirm({
        title: getWritingNextChapterReplaceTitle(nextChapter.number),
        description: WRITING_PAGE_COPY.confirms.nextChapterReplace.description,
        confirmText: WRITING_PAGE_COPY.confirms.nextChapterReplace.confirmText,
        cancelText: WRITING_PAGE_COPY.confirms.nextChapterReplace.cancelText,
        danger: true,
      });
      if (!replaceOk) return;
    }

    autoGenerateNextRef.current = { chapterId: nextChapter.id, mode: "replace" };
    setActiveId(nextChapter.id);
    setAiOpen(true);
  }, [activeChapter, chapters, confirm, saveChapter, setActiveId, toast]);

  useEffect(() => {
    const pending = autoGenerateNextRef.current;
    if (!pending || !activeChapter || !form || generating) return;
    if (activeChapter.id !== pending.chapterId) return;
    autoGenerateNextRef.current = null;
    void generate(pending.mode);
  }, [activeChapter, form, generate, generating]);

  const batchProgressText =
    batch.batchTask && (batch.batchTask.status === "queued" || batch.batchTask.status === "running")
      ? `（${batch.batchTask.completed_count}/${batch.batchTask.total_count}）`
      : "";

  const openMemoryUpdate = useCallback(() => {
    if (!activeChapter) return;
    if (dirty) {
      toast.toastWarning(WRITING_PAGE_COPY.memoryUpdateNeedsSaveFirst);
      return;
    }
    if (activeChapter.status !== "done") {
      toast.toastWarning(getWritingDoneOnlyWarning());
      return;
    }
    setMemoryUpdateOpen(true);
  }, [activeChapter, dirty, toast]);

  const openTaskCenter = useCallback(() => {
    if (!projectId) return;
    navigate(buildWritingTaskCenterHref(projectId, activeId));
  }, [activeId, navigate, projectId]);

  const hasActiveChapter = Boolean(activeChapter);
  const hasChapters = chapters.length > 0;
  const hasPlan = Boolean(String(form?.plan || "").trim());
  const hasContent = Boolean(String(form?.content_md || "").trim());
  const continuityRevisionActive = Boolean(activeContinuityRevision);

  const workspaceProps: WritingWorkspaceProps = {
    toolbarProps: {
      appMode,
      outlines,
      activeOutlineId,
      chaptersCount: chapters.length,
      aiGenerateDisabled: !hasActiveChapter || loadingChapter,
      saveDisabled: !dirty || saving || loadingChapter || generating,
      saveLabel: saving ? WRITING_PAGE_COPY.saving : WRITING_PAGE_COPY.save,
      onSwitchOutline: (outlineId) => void switchOutline(outlineId),
      onOpenAiGenerate: () => setAiOpen(true),
      onCreateChapter: chapterCrud.openCreate,
      onSaveChapter: () => void saveChapter(),
      onOpenReview: () => {
        if (!projectId) return;
        navigate(buildProjectReviewPath(projectId));
      },
      onOpenStudioTools: () => setStudioToolsOpen(true),
    },
    workbenchProps: {
      batchProgressText,
      onOpenPromptInspector: () => setPromptInspectorOpen(true),
      onOpenContextPreview: () => setContextPreviewOpen(true),
      onOpenHistory: history.openDrawer,
      onOpenMemoryUpdate: openMemoryUpdate,
      onOpenForeshadow: () => setForeshadowOpen(true),
      onOpenTaskCenter: openTaskCenter,
      onOpenStudioTools: () => setStudioToolsOpen(true),
    },
    chapterListProps: {
      chapters,
      activeId,
      onSelectChapter: (chapterId) => void requestSelectChapter(chapterId),
      onOpenDrawer: () => setChapterListOpen(true),
    },
    editorProps: {
      appMode,
      activeChapter,
      hasChapters,
      form,
      dirty,
      isDoneReadonly,
      loadingChapter,
      generating,
      saving,
      autoUpdatesTriggering,
      continuityRevision: activeContinuityRevision
        ? {
            id: activeContinuityRevision.id,
            title: activeContinuityRevision.title,
            typeLabel: activeContinuityRevision.typeLabel,
            excerpt: activeContinuityRevision.excerpt,
            hasExcerpt: activeContinuityRevision.hasExcerpt,
            progressStatus: activeContinuityRevisionProgressStatus,
          }
        : null,
      continuityRevisionChecklist,
      continuityRevisionQueue: continuityRevisionQueueView,
      continuityRevisionQueueNavigation,
      returnToContinuityAfterComplete,
      contentEditorTab,
      onContentEditorTabChange: setContentEditorTab,
      onTitleChange: (value) => setForm((prev) => (prev ? { ...prev, title: value } : prev)),
      onStatusChange: (status) => setForm((prev) => (prev ? { ...prev, status } : prev)),
      onPlanChange: (value) => setForm((prev) => (prev ? { ...prev, plan: value } : prev)),
      onContentChange: (value) => setForm((prev) => (prev ? { ...prev, content_md: value } : prev)),
      onSummaryChange: (value) => setForm((prev) => (prev ? { ...prev, summary: value } : prev)),
      onContentTextareaRef: (element) => {
        contentTextareaRef.current = element;
      },
      onOpenAnalysis: analysis.openModal,
      onOpenChapterTrace: () => {
        if (!projectId || !activeChapter) return;
        navigate(getWritingAnalysisHref(projectId, activeChapter.id));
      },
      onOpenChapterList: () => setChapterListOpen(true),
      onCreateChapter: chapterCrud.openCreate,
      onDeleteChapter: () => void chapterCrud.deleteChapter(),
      onSaveAndTriggerAutoUpdates: () => void saveAndTriggerAutoUpdates(),
      onSaveChapter: () => void saveChapter(),
      onReopenDrafting: () => setForm((prev: ChapterForm | null) => (prev ? { ...prev, status: "drafting" } : prev)),
      onLocateContinuityRevision: locateContinuityRevision,
      onReturnToContinuityReview: returnToContinuityReview,
      onDismissContinuityRevision: clearContinuityRevision,
      onActivateContinuityRevisionQueueItem: activateContinuityRevisionQueueItem,
      onRemoveContinuityRevisionQueueItem: removeContinuityRevisionQueueItem,
      onActivatePreviousContinuityRevision: activatePreviousContinuityRevision,
      onActivateNextContinuityRevision: activateNextContinuityRevision,
      onCompleteContinuityRevisionAndAdvance: completeContinuityRevisionAndAdvance,
      onReturnToContinuityAfterCompleteChange: setReturnToContinuityAfterComplete,
      generationIndicatorLabel:
        genForm.stream && genStreamProgress
          ? getWritingGenerateIndicatorLabel(genStreamProgress.message, genStreamProgress.progress)
          : undefined,
    } satisfies WritingEditorSectionProps,
  };

  const chapterListDrawerProps: WritingChapterListDrawerProps = {
    open: chapterListOpen,
    chapters,
    activeId,
    onClose: () => setChapterListOpen(false),
    onSelectChapter: (chapterId) => void requestSelectChapter(chapterId),
  };

  const overlaysProps: WritingPageOverlaysProps = {
    studioToolsDrawerProps: {
      open: studioToolsOpen,
      batchProgressText,
      hasActiveChapter,
      hasChapters,
      hasPlan,
      activeChapterStatus: activeChapter?.status ?? null,
      hasContent,
      loadingChapter,
      dirty,
      generating,
      saving,
      autoUpdatesTriggering,
      continuityRevisionActive,
      continuityRevisionHasExcerpt: Boolean(activeContinuityRevision?.hasExcerpt),
      continuityRevisionProgressStatus: activeContinuityRevisionProgressStatus,
      onClose: () => setStudioToolsOpen(false),
      onOpenChapterList: () => setChapterListOpen(true),
      onCreateChapter: chapterCrud.openCreate,
      onOpenBatch: batch.openModal,
      onOpenHistory: history.openDrawer,
      onOpenAiGenerate: () => setAiOpen(true),
      onSaveChapter: () => void saveChapter(),
      onOpenReview: () => {
        if (!projectId) return;
        navigate(buildProjectReviewPath(projectId));
      },
      onOpenPromptInspector: () => setPromptInspectorOpen(true),
      onOpenContextPreview: () => setContextPreviewOpen(true),
      onOpenMemoryUpdate: openMemoryUpdate,
      onOpenForeshadow: () => setForeshadowOpen(true),
      onOpenTables: () => setTablesOpen(true),
      onOpenTaskCenter: openTaskCenter,
      onLocateContinuityRevision: locateContinuityRevision,
      onReturnToContinuityReview: returnToContinuityReview,
    },
    createChapterDialogProps: {
      open: chapterCrud.createOpen,
      saving: chapterCrud.createSaving,
      form: chapterCrud.createForm,
      setForm: chapterCrud.setCreateForm,
      onClose: () => chapterCrud.setCreateOpen(false),
      onSubmit: () => void chapterCrud.createChapter(),
    },
    batchGenerationModalProps: {
      open: batch.open,
      batchLoading: batch.batchLoading,
      activeChapterNumber: activeChapter?.number ?? null,
      batchCount: batch.batchCount,
      setBatchCount: batch.setBatchCount,
      batchIncludeExisting: batch.batchIncludeExisting,
      setBatchIncludeExisting: batch.setBatchIncludeExisting,
      batchTask: batch.batchTask,
      batchItems: batch.batchItems,
      batchRuntime: batch.batchRuntime,
      projectTaskStreamStatus: batch.projectTaskStreamStatus,
      taskCenterHref: buildBatchTaskCenterHref(projectId, batch.batchTask?.project_task_id),
      onClose: batch.closeModal,
      onCancelTask: () => void batch.cancelBatchGeneration(),
      onPauseTask: () => void batch.pauseBatchGeneration(),
      onResumeTask: () => void batch.resumeBatchGeneration(),
      onRetryFailedTask: () => void batch.retryFailedBatchGeneration(),
      onSkipFailedTask: () => void batch.skipFailedBatchGeneration(),
      onStartTask: () => void batch.startBatchGeneration(),
      onApplyItemToEditor: (item) => void batch.applyBatchItemToEditor(item),
    },
    chapterAnalysisModalProps: {
      open: analysis.open,
      analysisLoading: analysis.analysisLoading,
      rewriteLoading: analysis.rewriteLoading,
      applyLoading: analysis.applyLoading,
      analysisFocus: analysis.analysisFocus,
      setAnalysisFocus: analysis.setAnalysisFocus,
      analysisResult: analysis.analysisResult,
      rewriteInstruction: analysis.rewriteInstruction,
      setRewriteInstruction: analysis.setRewriteInstruction,
      onClose: analysis.closeModal,
      onAnalyze: () => void analysis.analyzeChapter(),
      onApplyAnalysisToMemory: () => void analysis.applyAnalysisToMemory(),
      onLocateInEditor: locateInEditor,
      onRewriteFromAnalysis: () => void analysis.rewriteFromAnalysis(),
    },
    aiGenerateDrawerProps: {
      open: aiOpen,
      generating,
      preset,
      projectId,
      activeChapter: Boolean(activeChapter),
      appMode,
      dirty,
      saving: saving || loadingChapter,
      genForm,
      setGenForm,
      characters,
      streamProgress: genStreamProgress,
      onClose: () => setAiOpen(false),
      onSave: () => void saveChapter(),
      onSaveAndGenerateNext: () => void saveAndGenerateNext(),
      onGenerateAppend: () => void generate("append"),
      onGenerateReplace: () => void generate("replace"),
      onCancelGenerate: abortGenerate,
      onOpenPromptInspector: () => setPromptInspectorOpen(true),
      postEditCompareAvailable: Boolean(postEditCompare),
      onOpenPostEditCompare: () => setPostEditCompareOpen(true),
      contentOptimizeCompareAvailable: Boolean(contentOptimizeCompare),
      onOpenContentOptimizeCompare: () => setContentOptimizeCompareOpen(true),
    },
    postEditCompareDrawerProps: {
      open: postEditCompareOpen && Boolean(postEditCompare),
      onClose: () => setPostEditCompareOpen(false),
      rawContentMd: postEditCompare?.rawContentMd ?? "",
      editedContentMd: postEditCompare?.editedContentMd ?? "",
      requestId: postEditCompare?.requestId ?? null,
      appliedChoice: postEditCompare?.appliedChoice ?? "post_edit",
      onApplyRaw: () => void applyPostEditVariant("raw"),
      onApplyPostEdit: () => void applyPostEditVariant("post_edit"),
    },
    contentOptimizeCompareDrawerProps: {
      open: contentOptimizeCompareOpen && Boolean(contentOptimizeCompare),
      onClose: () => setContentOptimizeCompareOpen(false),
      rawContentMd: contentOptimizeCompare?.rawContentMd ?? "",
      optimizedContentMd: contentOptimizeCompare?.optimizedContentMd ?? "",
      requestId: contentOptimizeCompare?.requestId ?? null,
      appliedChoice: contentOptimizeCompare?.appliedChoice ?? "content_optimize",
      onApplyRaw: () => void applyContentOptimizeVariant("raw"),
      onApplyOptimized: () => void applyContentOptimizeVariant("content_optimize"),
    },
    promptInspectorDrawerProps: {
      open: promptInspectorOpen,
      onClose: () => setPromptInspectorOpen(false),
      preset,
      chapterId: activeChapter?.id ?? undefined,
      chapterPlan: form?.plan ?? "",
      draftContentMd: form?.content_md ?? "",
      generating,
      genForm,
      setGenForm,
      onGenerate: generate,
    },
    contextPreviewDrawerProps: {
      open: contextPreviewOpen,
      onClose: () => setContextPreviewOpen(false),
      projectId,
      memoryInjectionEnabled: genForm.memory_injection_enabled,
      genInstruction: genForm.instruction,
      genChapterPlan: activeChapter?.plan ?? "",
      genMemoryQueryText: genForm.memory_query_text,
      genMemoryModules: genForm.memory_modules,
      onChangeMemoryInjectionEnabled: (enabled) =>
        setGenForm((prev) => ({ ...prev, memory_injection_enabled: Boolean(enabled) })),
    },
    tablesPanelProps: {
      open: tablesOpen,
      onClose: () => setTablesOpen(false),
      projectId,
    },
    memoryUpdateDrawerProps: {
      open: memoryUpdateOpen,
      onClose: () => setMemoryUpdateOpen(false),
      projectId,
      chapterId: activeId ?? undefined,
    },
    foreshadowDrawerProps: {
      open: foreshadowOpen,
      onClose: () => setForeshadowOpen(false),
      projectId,
      activeChapterId: activeId ?? undefined,
    },
    generationHistoryDrawerProps: {
      open: history.open,
      onClose: history.closeDrawer,
      loading: history.runsLoading,
      runs: history.runs,
      selectedRun: history.selectedRun,
      onSelectRun: (run) => void history.selectRun(run),
    },
  };

  const streamFloatingProps: WritingStreamFloatingCardProps = {
    open: generating && genForm.stream && !aiOpen,
    requestId: genRequestId,
    chapterLabel: activeChapter ? activeChapter.title || `第 ${activeChapter.number} 章` : undefined,
    message: genStreamProgress?.message,
    progress: genStreamProgress?.progress ?? 0,
    onExpand: () => setAiOpen(true),
    onCancel: abortGenerate,
  };

  return {
    loading,
    dirty,
    showUnsavedGuard: dirty && outletActive,
    workspaceProps,
    chapterListDrawerProps,
    overlaysProps,
    streamFloatingProps,
    wizardBarProps: {
      projectId,
      currentStep: "writing",
      progress: wizard.progress,
      loading: wizard.loading,
      dirty,
      saving: saving || loadingChapter || generating,
      onSave: saveChapter,
    },
  };
}
