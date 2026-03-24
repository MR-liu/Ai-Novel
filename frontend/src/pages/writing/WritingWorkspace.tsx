import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

import { Drawer } from "../../components/ui/Drawer";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { ChapterListPanel } from "../../components/writing/ChapterListPanel";
import { WritingCompactDisclosure } from "../../components/writing/WritingCompactDisclosure";
import { WritingToolbar } from "../../components/writing/WritingToolbar";
import { humanizeChapterStatus } from "../../lib/humanize";
import type { ContinuityRevisionProgressStatus } from "../../services/continuityRevisionQueue";
import type { Chapter, ChapterListItem, ChapterStatus } from "../../types";

import { WritingEditorSection, type WritingEditorSectionProps } from "./WritingEditorSection";
import { getWritingChapterHeading, WRITING_DISCLOSURE_COPY, WRITING_PAGE_COPY } from "./writingPageCopy";
import {
  CHAPTER_LIST_SIDEBAR_WIDTH_CLASS,
  getWritingWorkbenchContinuitySection,
  getWritingWorkbenchMainActionGroup,
  getWritingWorkbenchNextStep,
  getWritingWorkbenchReadiness,
  getWritingWorkbenchReadinessItems,
  getWritingWorkbenchResearchSection,
  getWritingWorkbenchRuntimeNote,
  summarizeWritingContinuityRevisionQueue,
  summarizeWritingPlan,
} from "./writingPageModels";
import { estimateCharacterCount } from "./writingPageSectionUtils";

export type WritingWorkspaceProps = {
  toolbarProps: Omit<ComponentProps<typeof WritingToolbar>, "onOpenChapterList">;
  workbenchProps: {
    batchProgressText: string;
    onOpenPromptInspector: () => void;
    onOpenContextPreview: () => void;
    onOpenHistory: () => void;
    onOpenMemoryUpdate: () => void;
    onOpenForeshadow: () => void;
    onOpenTaskCenter: () => void;
    onOpenStudioTools: () => void;
  };
  chapterListProps: {
    chapters: ChapterListItem[];
    activeId: string | null;
    onSelectChapter: (chapterId: string) => void;
    onOpenDrawer: () => void;
  };
  editorProps: WritingEditorSectionProps;
};

type ResolvedWritingMainActionButton = {
  key: string;
  label: string;
  tone: "primary" | "secondary";
  disabled: boolean;
  onClick: () => void;
};

function WritingWorkbenchSection(props: {
  kicker: string;
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <section className="writing-workbench-section">
      <div className="writing-workbench-kicker">{props.kicker}</div>
      <div className="writing-workbench-title">{props.title}</div>
      <div className="writing-workbench-copy">{props.copy}</div>
      {props.children ? <div className="mt-3">{props.children}</div> : null}
    </section>
  );
}

function pickPreferredWritingAction(actions: ResolvedWritingMainActionButton[]): {
  primary: ResolvedWritingMainActionButton;
  secondary: ResolvedWritingMainActionButton[];
} | null {
  if (actions.length === 0) return null;

  const primaryIndex = actions.findIndex((action) => action.tone === "primary" && !action.disabled);
  const firstEnabledIndex = actions.findIndex((action) => !action.disabled);
  const resolvedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : firstEnabledIndex >= 0 ? firstEnabledIndex : 0;

  return {
    primary: actions[resolvedPrimaryIndex],
    secondary: actions.filter((_, index) => index !== resolvedPrimaryIndex),
  };
}

function resolveWritingMainActionButtons(args: {
  actions: Array<{ key: string; label: string; tone: "primary" | "secondary" }>;
  toolbarProps: Omit<ComponentProps<typeof WritingToolbar>, "onOpenChapterList">;
  workbenchProps: WritingWorkspaceProps["workbenchProps"];
  editorProps: WritingEditorSectionProps;
  activeChapter: Chapter | null;
}): ResolvedWritingMainActionButton[] {
  const chapterRequiredDisabled = !args.activeChapter || args.editorProps.loadingChapter;
  const memoryUpdateDisabled =
    chapterRequiredDisabled || args.editorProps.dirty || args.activeChapter?.status !== "done";

  return args.actions.map((action) => {
    let onClick: (() => void) | undefined;
    let disabled = false;
    let label = action.label;

    switch (action.key) {
      case "create_chapter":
        onClick = args.toolbarProps.onCreateChapter;
        break;
      case "open_chapter_list":
        onClick = args.editorProps.onOpenChapterList;
        disabled = !args.editorProps.hasChapters;
        break;
      case "save_chapter":
        onClick = args.toolbarProps.onSaveChapter;
        disabled = args.toolbarProps.saveDisabled;
        label = args.toolbarProps.saveLabel;
        break;
      case "open_ai_generate":
        onClick = args.toolbarProps.onOpenAiGenerate;
        disabled = args.toolbarProps.aiGenerateDisabled;
        break;
      case "open_review":
        onClick = args.toolbarProps.onOpenReview;
        disabled = !args.activeChapter;
        break;
      case "return_to_continuity":
        onClick = args.editorProps.onReturnToContinuityReview;
        disabled = !args.editorProps.continuityRevision;
        break;
      case "locate_continuity_excerpt":
        onClick = args.editorProps.onLocateContinuityRevision;
        disabled = !args.editorProps.continuityRevision?.hasExcerpt;
        break;
      case "open_memory_update":
        onClick = args.workbenchProps.onOpenMemoryUpdate;
        disabled = memoryUpdateDisabled;
        break;
      case "open_context_preview":
        onClick = args.workbenchProps.onOpenContextPreview;
        disabled = chapterRequiredDisabled;
        break;
      case "open_prompt_inspector":
        onClick = args.workbenchProps.onOpenPromptInspector;
        disabled = chapterRequiredDisabled;
        break;
      case "open_history":
        onClick = args.workbenchProps.onOpenHistory;
        break;
      case "open_foreshadow":
        onClick = args.workbenchProps.onOpenForeshadow;
        break;
      case "open_task_center":
        onClick = args.workbenchProps.onOpenTaskCenter;
        break;
      case "open_studio_tools":
        onClick = args.workbenchProps.onOpenStudioTools;
        break;
    }

    return {
      key: action.key,
      label,
      tone: action.tone,
      disabled,
      onClick: onClick ?? (() => undefined),
    };
  });
}

function WritingStudioWorkbench(props: {
  toolbarProps: Omit<ComponentProps<typeof WritingToolbar>, "onOpenChapterList">;
  workbenchProps: WritingWorkspaceProps["workbenchProps"];
  editorProps: WritingEditorSectionProps;
}) {
  const activeChapter = props.editorProps.activeChapter;
  const form = props.editorProps.form;
  const readiness = getWritingWorkbenchReadiness(form?.plan, form?.content_md, form?.summary);
  const nextStep = getWritingWorkbenchNextStep({
    status: activeChapter?.status,
    dirty: props.editorProps.dirty,
    hasPlan: Boolean(String(form?.plan || "").trim()),
    hasContent: Boolean(String(form?.content_md || "").trim()),
    generating: props.editorProps.generating,
    saving: props.editorProps.saving,
    autoUpdatesTriggering: props.editorProps.autoUpdatesTriggering,
    continuityRevisionActive: Boolean(props.editorProps.continuityRevision),
    continuityRevisionProgressStatus: props.editorProps.continuityRevision?.progressStatus ?? null,
  });
  const runtimeNote = getWritingWorkbenchRuntimeNote({
    generating: props.editorProps.generating,
    autoUpdatesTriggering: props.editorProps.autoUpdatesTriggering,
    batchProgressText: props.workbenchProps.batchProgressText,
  });
  const chapterTitle = activeChapter
    ? activeChapter.title || getWritingChapterHeading(activeChapter.number)
    : "还没有打开章节";
  const mainActionGroup = getWritingWorkbenchMainActionGroup({
    hasActiveChapter: Boolean(activeChapter),
    hasChapters: props.editorProps.hasChapters,
    hasContent: Boolean(String(form?.content_md || "").trim()),
    status: activeChapter?.status,
    dirty: props.editorProps.dirty,
    saving: props.editorProps.saving,
    continuityRevisionActive: Boolean(props.editorProps.continuityRevision),
    continuityRevisionHasExcerpt: Boolean(props.editorProps.continuityRevision?.hasExcerpt),
    continuityRevisionProgressStatus: props.editorProps.continuityRevision?.progressStatus ?? null,
  });
  const mainActionButtons = resolveWritingMainActionButtons({
    actions: mainActionGroup.actions,
    toolbarProps: props.toolbarProps,
    workbenchProps: props.workbenchProps,
    editorProps: props.editorProps,
    activeChapter,
  });
  const researchSection = getWritingWorkbenchResearchSection({
    hasActiveChapter: Boolean(activeChapter),
    hasContent: Boolean(String(form?.content_md || "").trim()),
    generating: props.editorProps.generating,
    continuityRevisionActive: Boolean(props.editorProps.continuityRevision),
    continuityRevisionProgressStatus: props.editorProps.continuityRevision?.progressStatus ?? null,
  });
  const researchButtons = resolveWritingMainActionButtons({
    actions: researchSection.actions,
    toolbarProps: props.toolbarProps,
    workbenchProps: props.workbenchProps,
    editorProps: props.editorProps,
    activeChapter,
  });
  const continuitySection = getWritingWorkbenchContinuitySection({
    hasActiveChapter: Boolean(activeChapter),
    status: activeChapter?.status,
    dirty: props.editorProps.dirty,
    autoUpdatesTriggering: props.editorProps.autoUpdatesTriggering,
    batchProgressText: props.workbenchProps.batchProgressText,
    continuityRevisionActive: Boolean(props.editorProps.continuityRevision),
    continuityRevisionProgressStatus: props.editorProps.continuityRevision?.progressStatus ?? null,
  });
  const continuityButtons = resolveWritingMainActionButtons({
    actions: continuitySection.actions,
    toolbarProps: props.toolbarProps,
    workbenchProps: props.workbenchProps,
    editorProps: props.editorProps,
    activeChapter,
  });

  return (
    <aside className="manuscript-inspector writing-workbench hidden xl:block">
      <div className="writing-workbench-header">
        <div className="writing-workbench-kicker">作者工作台</div>
        <div className="mt-2 font-content text-2xl text-ink">{chapterTitle}</div>
        <div className="mt-2 text-sm leading-6 text-subtext">
          这里收纳当前章节状态、下一步建议和研究入口，让主稿始终留在注意力中心。
        </div>
        {runtimeNote ? <div className="mt-3 inline-flex manuscript-chip">{runtimeNote}</div> : null}
      </div>

      <div className="grid gap-3 p-4">
        <WritingWorkbenchSection
          kicker="当前章状态"
          title={activeChapter ? humanizeChapterStatus(activeChapter.status) : "未选择章节"}
          copy={
            props.editorProps.dirty
              ? "这章还有未保存修改。先保存，再切章节、进校对或做连续性更新会更稳。"
              : "当前章节已与编辑状态同步，可以继续扩写，也可以转去校对或资料检查。"
          }
        >
          <div className="writing-workbench-metrics">
            <div className="writing-workbench-metric">
              <div className="writing-workbench-metric-label">保存状态</div>
              <div className="writing-workbench-metric-value">
                {props.editorProps.saving
                  ? "正在保存"
                  : props.editorProps.dirty
                    ? "等待保存"
                    : "已保存"}
              </div>
            </div>
            <div className="writing-workbench-metric">
              <div className="writing-workbench-metric-label">正文长度</div>
              <div className="writing-workbench-metric-value">
                {form?.content_md ? `${estimateCharacterCount(form.content_md)} 字` : "尚未起笔"}
              </div>
            </div>
          </div>
        </WritingWorkbenchSection>

        <WritingWorkbenchSection kicker="下一步建议" title={nextStep.title} copy={nextStep.description} />

        <WritingWorkbenchSection kicker="本章航线" title="写前写后都能回看" copy={summarizeWritingPlan(form?.plan)}>
          <div className="flex flex-wrap gap-2">
            {readiness.map((item) => (
              <span key={item} className="manuscript-chip">
                {item}
              </span>
            ))}
          </div>
        </WritingWorkbenchSection>

        <WritingWorkbenchSection
          kicker="主线动作"
          title={mainActionGroup.title}
          copy={mainActionGroup.copy}
        >
          <div className="writing-workbench-actions">
            {mainActionButtons.map((action) => (
              <button
                key={action.key}
                className={clsx(
                  action.tone === "primary" ? "btn btn-primary justify-start" : "btn btn-secondary justify-start",
                )}
                onClick={action.onClick}
                disabled={action.disabled}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        </WritingWorkbenchSection>

        <WritingWorkbenchSection
          kicker="研究与校验"
          title={researchSection.title}
          copy={researchSection.copy}
        >
          <div className="writing-workbench-actions">
            {researchButtons.map((action) => (
              <button
                key={action.key}
                className={clsx(
                  action.tone === "primary" ? "btn btn-primary justify-start" : "btn btn-secondary justify-start",
                )}
                onClick={action.onClick}
                disabled={action.disabled}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        </WritingWorkbenchSection>

        <WritingWorkbenchSection
          kicker="连续性与任务"
          title={continuitySection.title}
          copy={continuitySection.copy}
        >
          <div className="writing-workbench-actions">
            {continuityButtons.map((action) => (
              <button
                key={action.key}
                className={clsx(
                  action.tone === "primary" ? "btn btn-primary justify-start" : "btn btn-secondary justify-start",
                )}
                onClick={action.onClick}
                disabled={action.disabled}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        </WritingWorkbenchSection>
      </div>
    </aside>
  );
}

export function WritingWorkspace(props: WritingWorkspaceProps) {
  const activeChapter = props.editorProps.activeChapter;
  const activeForm = props.editorProps.form;
  const characterCount = estimateCharacterCount(activeForm?.content_md ?? "");
  const studioMode = props.editorProps.appMode === "studio";
  const readinessItems = getWritingWorkbenchReadinessItems(activeForm?.plan, activeForm?.content_md, activeForm?.summary);
  const readinessCompleteCount = readinessItems.filter((item) => item.ready).length;
  const readinessPercent = Math.round((readinessCompleteCount / Math.max(1, readinessItems.length)) * 100);
  const continuityRevisionQueueSummary = summarizeWritingContinuityRevisionQueue(props.editorProps.continuityRevisionQueue);
  const toolbarMainActionGroup = getWritingWorkbenchMainActionGroup({
    hasActiveChapter: Boolean(activeChapter),
    hasChapters: props.editorProps.hasChapters,
    hasContent: Boolean(String(activeForm?.content_md || "").trim()),
    status: activeChapter?.status,
    dirty: props.editorProps.dirty,
    saving: props.editorProps.saving,
    continuityRevisionActive: Boolean(props.editorProps.continuityRevision),
    continuityRevisionHasExcerpt: Boolean(props.editorProps.continuityRevision?.hasExcerpt),
    continuityRevisionProgressStatus: props.editorProps.continuityRevision?.progressStatus ?? null,
  });
  const toolbarMainActions = resolveWritingMainActionButtons({
    actions: toolbarMainActionGroup.actions,
    toolbarProps: props.toolbarProps,
    workbenchProps: props.workbenchProps,
    editorProps: props.editorProps,
    activeChapter,
  });
  const mobileResearchSection = getWritingWorkbenchResearchSection({
    hasActiveChapter: Boolean(activeChapter),
    hasContent: Boolean(String(activeForm?.content_md || "").trim()),
    generating: props.editorProps.generating,
    continuityRevisionActive: Boolean(props.editorProps.continuityRevision),
    continuityRevisionProgressStatus: props.editorProps.continuityRevision?.progressStatus ?? null,
  });
  const mobileResearchActions = resolveWritingMainActionButtons({
    actions: mobileResearchSection.actions,
    toolbarProps: props.toolbarProps,
    workbenchProps: props.workbenchProps,
    editorProps: props.editorProps,
    activeChapter,
  });
  const mobileContinuitySection = getWritingWorkbenchContinuitySection({
    hasActiveChapter: Boolean(activeChapter),
    status: activeChapter?.status,
    dirty: props.editorProps.dirty,
    autoUpdatesTriggering: props.editorProps.autoUpdatesTriggering,
    batchProgressText: props.workbenchProps.batchProgressText,
    continuityRevisionActive: Boolean(props.editorProps.continuityRevision),
    continuityRevisionProgressStatus: props.editorProps.continuityRevision?.progressStatus ?? null,
  });
  const mobileContinuityActions = resolveWritingMainActionButtons({
    actions: mobileContinuitySection.actions,
    toolbarProps: props.toolbarProps,
    workbenchProps: props.workbenchProps,
    editorProps: props.editorProps,
    activeChapter,
  });
  const nextStep = getWritingWorkbenchNextStep({
    status: activeChapter?.status,
    dirty: props.editorProps.dirty,
    hasPlan: Boolean(String(activeForm?.plan || "").trim()),
    hasContent: Boolean(String(activeForm?.content_md || "").trim()),
    generating: props.editorProps.generating,
    saving: props.editorProps.saving,
    autoUpdatesTriggering: props.editorProps.autoUpdatesTriggering,
    continuityRevisionActive: Boolean(props.editorProps.continuityRevision),
    continuityRevisionProgressStatus: props.editorProps.continuityRevision?.progressStatus ?? null,
  });
  const chapterDisplayTitle = activeChapter
    ? activeChapter.title?.trim() || getWritingChapterHeading(activeChapter.number)
    : "还没有打开章节";
  const primaryAction =
    !activeChapter
      ? {
          label: "新建章节",
          onClick: props.toolbarProps.onCreateChapter,
          disabled: false,
          className: "btn btn-primary",
        }
      : props.editorProps.dirty || props.editorProps.saving
        ? {
            label: props.toolbarProps.saveLabel,
            onClick: props.toolbarProps.onSaveChapter,
            disabled: props.toolbarProps.saveDisabled,
            className: "btn btn-primary",
          }
        : props.editorProps.continuityRevision?.progressStatus === "saved"
          ? {
              label: "回连续性台复核",
              onClick: props.editorProps.onReturnToContinuityReview,
              disabled: false,
              className: "btn btn-primary",
            }
          : !String(activeForm?.content_md ?? "").trim()
            ? {
                label: "AI 起草",
                onClick: props.toolbarProps.onOpenAiGenerate,
                disabled: props.toolbarProps.aiGenerateDisabled,
                className: "btn btn-primary",
              }
            : activeChapter.status === "done"
              ? {
                  label: "进入校对",
                  onClick: props.toolbarProps.onOpenReview,
                  disabled: false,
                  className: "btn btn-primary",
                }
              : null;
  const runtimeStatus = props.editorProps.generating
    ? {
        kicker: "生成进行中",
        title: WRITING_PAGE_COPY.runtimeGeneratingTitle,
        copy: WRITING_PAGE_COPY.runtimeGeneratingCopy,
        actionLabel: WRITING_PAGE_COPY.streamFloatingExpand,
        onAction: props.toolbarProps.onOpenAiGenerate,
      }
    : props.editorProps.autoUpdatesTriggering
      ? {
          kicker: "后台同步",
          title: WRITING_PAGE_COPY.runtimeAutoUpdateTitle,
          copy: WRITING_PAGE_COPY.runtimeAutoUpdateCopy,
          actionLabel: WRITING_PAGE_COPY.openTaskCenter,
          onAction: props.workbenchProps.onOpenTaskCenter,
        }
      : props.workbenchProps.batchProgressText
        ? {
            kicker: "批量任务",
            title: WRITING_PAGE_COPY.runtimeBatchTitle,
            copy: `${WRITING_PAGE_COPY.runtimeBatchCopyPrefix}${props.workbenchProps.batchProgressText}，如需查看排队与完成情况，可去任务中心。`,
            actionLabel: WRITING_PAGE_COPY.openTaskCenter,
            onAction: props.workbenchProps.onOpenTaskCenter,
          }
        : null;
  const mobileStatusDetailOpen =
    continuityRevisionQueueSummary.total > 0 ||
    continuityRevisionQueueSummary.dirtyCount > 0 ||
    continuityRevisionQueueSummary.savedCount > 0 ||
    readinessCompleteCount < readinessItems.length;

  return (
    <>
      <WritingToolbar
        {...props.toolbarProps}
        onOpenChapterList={props.chapterListProps.onOpenDrawer}
        mainActionTitle={toolbarMainActionGroup.title}
        mainActionCopy={toolbarMainActionGroup.copy}
        mainActions={toolbarMainActions}
      />
      <div className="manuscript-shell">
        <aside className={clsx("manuscript-sidebar hidden overflow-hidden xl:block", CHAPTER_LIST_SIDEBAR_WIDTH_CLASS)}>
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">章节目录</div>
            <div className="mt-1 text-sm text-ink">沿章节推进故事主线</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="manuscript-chip">共 {props.chapterListProps.chapters.length} 章</span>
              <span className="manuscript-chip">
                {activeChapter ? `当前：${getWritingChapterHeading(activeChapter.number)}` : "未选择章节"}
              </span>
            </div>
          </div>
          <div className="p-2">
            <ChapterListPanel
              chapters={props.chapterListProps.chapters}
              activeId={props.chapterListProps.activeId}
              onSelectChapter={props.chapterListProps.onSelectChapter}
              emptyState={
                <div className="writing-sidebar-empty">
                  <div className="writing-empty-kicker">章节目录</div>
                  <div className="writing-empty-title">{WRITING_PAGE_COPY.chapterListEmptyTitle}</div>
                  <div className="writing-empty-copy">{WRITING_PAGE_COPY.chapterListEmptyCopy}</div>
                  <div className="writing-empty-actions">
                    <button className="btn btn-primary" onClick={props.toolbarProps.onCreateChapter} type="button">
                      {WRITING_PAGE_COPY.emptyStatePrimaryAction}
                    </button>
                  </div>
                </div>
              }
            />
          </div>
        </aside>

        <section className="manuscript-main">
          <div className="writing-progress-band">
            <div className="writing-progress-summary">
              <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">创作状态带</div>
              <div className="writing-progress-title">{chapterDisplayTitle}</div>
              <div className="mt-2 text-sm text-ink">{nextStep.title}</div>
              <div className="mt-2 text-sm leading-6 text-subtext">
                {studioMode ? "工作室模式：右侧保留资料、校验和任务入口。" : "专注模式：把工具退后，让主稿留在注意力中心。"}{" "}
                {nextStep.description}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 sm:hidden">
                <span className="manuscript-chip">
                  {activeChapter ? humanizeChapterStatus(activeChapter.status) : "未选择章节"}
                </span>
                <span className="manuscript-chip">{props.editorProps.dirty ? "未保存修改" : "已同步"}</span>
                <span className="manuscript-chip">{characterCount} 字</span>
              </div>
              <WritingCompactDisclosure
                title={WRITING_DISCLOSURE_COPY.statusDetails}
                defaultOpen={mobileStatusDetailOpen}
                className="writing-progress-mobile-disclosure sm:hidden"
              >
                <div className="writing-progress-mobile-detail-grid">
                  <div className="writing-progress-mobile-detail-card">
                    <div className="writing-progress-mobile-detail-label">当前状态</div>
                    <div className="writing-progress-mobile-detail-value">
                      {activeChapter ? humanizeChapterStatus(activeChapter.status) : "等待选择章节"}
                    </div>
                    <div className="writing-progress-mobile-detail-copy">
                      {props.editorProps.dirty ? "这章还有未保存修改。" : "当前章节已与本地编辑状态同步。"}
                    </div>
                  </div>
                  <div className="writing-progress-mobile-detail-card">
                    <div className="writing-progress-mobile-detail-label">本章准备度</div>
                    <div className="writing-progress-mobile-detail-value">
                      {readinessCompleteCount}/{readinessItems.length} 项就绪
                    </div>
                    <div className="writing-progress-mobile-detail-copy">{summarizeWritingPlan(activeForm?.plan, 72)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {props.editorProps.continuityRevision ? (
                    <span className="manuscript-chip">待修订：{props.editorProps.continuityRevision.typeLabel}</span>
                  ) : null}
                  {props.editorProps.continuityRevisionQueue.length > 0 ? (
                    <span className="manuscript-chip">修订队列 {props.editorProps.continuityRevisionQueue.length} 条</span>
                  ) : null}
                  {continuityRevisionQueueSummary.dirtyCount > 0 ? (
                    <span className="manuscript-chip border-warning/40 bg-warning/10 text-warning">
                      未保存改动 {continuityRevisionQueueSummary.dirtyCount} 条
                    </span>
                  ) : null}
                  {continuityRevisionQueueSummary.savedCount > 0 ? (
                    <span className="manuscript-chip">待复核 {continuityRevisionQueueSummary.savedCount} 条</span>
                  ) : null}
                  {activeChapter?.updated_at ? <span className="manuscript-chip">更新于 {activeChapter.updated_at}</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {readinessItems.map((item) => (
                    <span key={item.key} className={clsx("writing-progress-pill", item.ready ? "is-ready" : "is-pending")}>
                      {item.summary}
                    </span>
                  ))}
                </div>
              </WritingCompactDisclosure>
              <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                <span className="manuscript-chip">
                  {activeChapter ? humanizeChapterStatus(activeChapter.status) : "未选择章节"}
                </span>
                <span className="manuscript-chip">{props.editorProps.dirty ? "未保存修改" : "已同步"}</span>
                <span className="manuscript-chip">{characterCount} 字</span>
                {props.editorProps.continuityRevision ? (
                  <span className="manuscript-chip">待修订：{props.editorProps.continuityRevision.typeLabel}</span>
                ) : null}
                {props.editorProps.continuityRevisionQueue.length > 0 ? (
                  <span className="manuscript-chip">修订队列 {props.editorProps.continuityRevisionQueue.length} 条</span>
                ) : null}
                {continuityRevisionQueueSummary.dirtyCount > 0 ? (
                  <span className="manuscript-chip border-warning/40 bg-warning/10 text-warning">
                    未保存改动 {continuityRevisionQueueSummary.dirtyCount} 条
                  </span>
                ) : null}
                {continuityRevisionQueueSummary.savedCount > 0 ? (
                  <span className="manuscript-chip">待复核 {continuityRevisionQueueSummary.savedCount} 条</span>
                ) : null}
                {activeChapter?.updated_at ? <span className="manuscript-chip">更新于 {activeChapter.updated_at}</span> : null}
              </div>
            </div>

            <div className="hidden sm:grid writing-progress-metrics">
              <div className="writing-progress-card">
                <div className="writing-progress-card-label">当前状态</div>
                <div className="writing-progress-card-value">
                  {activeChapter ? humanizeChapterStatus(activeChapter.status) : "等待选择章节"}
                </div>
                <div className="writing-progress-card-copy">
                  {props.editorProps.dirty ? "这章还有未保存修改。" : "当前章节已与本地编辑状态同步。"}
                </div>
              </div>
              <div className="writing-progress-card">
                <div className="writing-progress-card-label">本章准备度</div>
                <div className="writing-progress-card-value">
                  {readinessCompleteCount}/{readinessItems.length} 项就绪
                </div>
                <ProgressBar ariaLabel="本章准备度" className="mt-3" value={readinessPercent} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {readinessItems.map((item) => (
                    <span key={item.key} className={clsx("writing-progress-pill", item.ready ? "is-ready" : "is-pending")}>
                      {item.summary}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className={clsx("writing-progress-actions", studioMode && "hidden xl:grid")}>
              {runtimeStatus ? (
                <div className="writing-progress-card is-runtime">
                  <div className="writing-progress-card-label">{runtimeStatus.kicker}</div>
                  <div className="writing-progress-card-value">{runtimeStatus.title}</div>
                  <div className="writing-progress-card-copy">{runtimeStatus.copy}</div>
                  <div className="mt-4">
                    <button className="btn btn-secondary" onClick={runtimeStatus.onAction} type="button">
                      {runtimeStatus.actionLabel}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="writing-progress-card">
                <div className="writing-progress-card-label">下一步动作</div>
                <div className="writing-progress-card-value">{nextStep.title}</div>
                <div className="writing-progress-card-copy">{nextStep.description}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {primaryAction ? (
                    <button
                      className={primaryAction.className}
                      disabled={primaryAction.disabled}
                      onClick={primaryAction.onClick}
                      type="button"
                    >
                      {primaryAction.label}
                    </button>
                  ) : (
                    <span className="writing-progress-inline-note">现在最适合直接继续写正文。</span>
                  )}
                  <button className="btn btn-secondary" onClick={props.toolbarProps.onOpenAiGenerate} disabled={props.toolbarProps.aiGenerateDisabled} type="button">
                    AI 起草
                  </button>
                  <button className="btn btn-secondary" onClick={props.toolbarProps.onOpenReview} type="button">
                    进入校对
                  </button>
                </div>
              </div>
            </div>
          </div>

          {studioMode ? (
            <div className="writing-mobile-workflow xl:hidden">
              {runtimeStatus ? (
                <div className="writing-mobile-workflow-runtime">
                  <div className="writing-progress-card-label">{runtimeStatus.kicker}</div>
                  <div className="writing-mobile-workflow-runtime-title">{runtimeStatus.title}</div>
                  <div className="writing-mobile-workflow-runtime-copy">{runtimeStatus.copy}</div>
                  <div className="mt-3">
                    <button className="btn btn-secondary" onClick={runtimeStatus.onAction} type="button">
                      {runtimeStatus.actionLabel}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="writing-mobile-workflow-grid">
                <WritingMobileWorkflowCard
                  kicker="写作阶段"
                  title={toolbarMainActionGroup.title}
                  copy={toolbarMainActionGroup.copy}
                  actions={toolbarMainActions}
                  disclosureTitle={WRITING_DISCLOSURE_COPY.workflowMoreWriting}
                  defaultOpen={!activeChapter || props.editorProps.dirty}
                />
                <WritingMobileWorkflowCard
                  kicker="校验阶段"
                  title={mobileResearchSection.title}
                  copy={mobileResearchSection.copy}
                  actions={mobileResearchActions}
                  disclosureTitle={WRITING_DISCLOSURE_COPY.workflowMoreResearch}
                  defaultOpen={!String(activeForm?.content_md || "").trim() || Boolean(props.editorProps.continuityRevision)}
                />
                <WritingMobileWorkflowCard
                  kicker="连续性阶段"
                  title={mobileContinuitySection.title}
                  copy={mobileContinuitySection.copy}
                  actions={mobileContinuityActions}
                  disclosureTitle={WRITING_DISCLOSURE_COPY.workflowMoreContinuity}
                  defaultOpen={
                    Boolean(props.editorProps.continuityRevision) ||
                    continuityRevisionQueueSummary.total > 0 ||
                    Boolean(props.workbenchProps.batchProgressText) ||
                    props.editorProps.autoUpdatesTriggering
                  }
                />
              </div>
            </div>
          ) : null}

          <WritingEditorSection {...props.editorProps} />
        </section>

        {studioMode ? (
          <WritingStudioWorkbench
            toolbarProps={props.toolbarProps}
            workbenchProps={props.workbenchProps}
            editorProps={props.editorProps}
          />
        ) : null}
      </div>
    </>
  );
}

export type WritingChapterListDrawerProps = {
  open: boolean;
  chapters: ChapterListItem[];
  activeId: string | null;
  onClose: () => void;
  onSelectChapter: (chapterId: string) => void;
};

export function WritingChapterListDrawer(props: WritingChapterListDrawerProps) {
  const activeChapter = props.chapters.find((chapter) => chapter.id === props.activeId) ?? null;

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      side="left"
      overlayClassName="lg:hidden"
      ariaLabel="章节列表"
      panelClassName={`h-full ${CHAPTER_LIST_SIDEBAR_WIDTH_CLASS} overflow-hidden border-r border-border bg-[rgb(var(--color-sidebar-bg)/0.96)] shadow-sm`}
    >
      <div className="writing-mobile-drawer-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="writing-mobile-drawer-kicker">章节目录</div>
            <div className="writing-mobile-drawer-title">
              {activeChapter ? getWritingChapterHeading(activeChapter.number) : "按章节推进故事"}
            </div>
            <div className="writing-mobile-drawer-copy">
              {activeChapter
                ? "切到别章前，如果当前稿面还有未保存修改，系统会先提醒你确认。"
                : "先选一章进入主稿，继续写作或回看已有内容。"}
            </div>
          </div>
          <button className="btn btn-secondary" onClick={props.onClose} type="button">
            关闭
          </button>
        </div>

        <div className="writing-mobile-drawer-meta">
          <span className="manuscript-chip">共 {props.chapters.length} 章</span>
          <span className="manuscript-chip">
            {activeChapter ? `当前：${getWritingChapterHeading(activeChapter.number)}` : "未选择章节"}
          </span>
        </div>
      </div>

      <div className="h-full p-2 pb-4">
        <ChapterListPanel
          chapters={props.chapters}
          activeId={props.activeId}
          containerClassName="writing-mobile-drawer-panel h-full"
          emptyState={
            <div className="writing-sidebar-empty">
              <div className="writing-empty-kicker">章节目录</div>
              <div className="writing-empty-title">{WRITING_PAGE_COPY.chapterListEmptyTitle}</div>
              <div className="writing-empty-copy">{WRITING_PAGE_COPY.chapterListEmptyCopy}</div>
            </div>
          }
          onSelectChapter={(chapterId) => {
            props.onClose();
            props.onSelectChapter(chapterId);
          }}
        />
      </div>
    </Drawer>
  );
}

export type WritingStudioToolsDrawerProps = {
  open: boolean;
  batchProgressText: string;
  hasActiveChapter: boolean;
  hasChapters: boolean;
  hasPlan: boolean;
  activeChapterStatus: ChapterStatus | null;
  hasContent: boolean;
  loadingChapter: boolean;
  dirty: boolean;
  generating: boolean;
  saving: boolean;
  autoUpdatesTriggering: boolean;
  continuityRevisionActive: boolean;
  continuityRevisionHasExcerpt: boolean;
  continuityRevisionProgressStatus: ContinuityRevisionProgressStatus | null;
  onClose: () => void;
  onOpenChapterList: () => void;
  onCreateChapter: () => void;
  onOpenBatch: () => void;
  onOpenHistory: () => void;
  onOpenAiGenerate: () => void;
  onSaveChapter: () => void;
  onOpenReview: () => void;
  onOpenPromptInspector: () => void;
  onOpenContextPreview: () => void;
  onOpenMemoryUpdate: () => void;
  onOpenForeshadow: () => void;
  onOpenTables: () => void;
  onOpenTaskCenter: () => void;
  onLocateContinuityRevision: () => void;
  onReturnToContinuityReview: () => void;
};

function runDrawerAction(onClose: () => void, action: () => void) {
  onClose();
  action();
}

function resolveWritingDrawerButtons(
  props: WritingStudioToolsDrawerProps,
  actions: Array<{ key: string; label: string; tone: "primary" | "secondary" }>,
): ResolvedWritingMainActionButton[] {
  const chapterRequiredDisabled = !props.hasActiveChapter || props.loadingChapter;
  const memoryUpdateDisabled = chapterRequiredDisabled || props.dirty || props.activeChapterStatus !== "done";
  const saveDisabled = !props.dirty || props.saving || props.loadingChapter || props.generating;

  return actions
    .filter((action) => action.key !== "open_studio_tools")
    .map((action) => {
      let onClick: (() => void) | undefined;
      let disabled = false;

      switch (action.key) {
        case "create_chapter":
          onClick = props.onCreateChapter;
          break;
        case "open_chapter_list":
          onClick = props.onOpenChapterList;
          break;
        case "save_chapter":
          onClick = props.onSaveChapter;
          disabled = saveDisabled;
          break;
        case "open_ai_generate":
          onClick = props.onOpenAiGenerate;
          disabled = chapterRequiredDisabled;
          break;
        case "open_review":
          onClick = props.onOpenReview;
          disabled = !props.hasActiveChapter;
          break;
        case "open_context_preview":
          onClick = props.onOpenContextPreview;
          disabled = chapterRequiredDisabled;
          break;
        case "open_prompt_inspector":
          onClick = props.onOpenPromptInspector;
          disabled = chapterRequiredDisabled;
          break;
        case "open_history":
          onClick = props.onOpenHistory;
          break;
        case "open_memory_update":
          onClick = props.onOpenMemoryUpdate;
          disabled = memoryUpdateDisabled;
          break;
        case "open_foreshadow":
          onClick = props.onOpenForeshadow;
          break;
        case "open_task_center":
          onClick = props.onOpenTaskCenter;
          break;
        case "return_to_continuity":
          onClick = props.onReturnToContinuityReview;
          disabled = !props.continuityRevisionActive;
          break;
        case "locate_continuity_excerpt":
          onClick = props.onLocateContinuityRevision;
          disabled = !props.continuityRevisionHasExcerpt;
          break;
      }

      return {
        key: action.key,
        label: action.label,
        tone: action.tone,
        disabled,
        onClick: onClick ? () => runDrawerAction(props.onClose, onClick!) : () => undefined,
      };
    });
}

function renderWritingActionButton(action: ResolvedWritingMainActionButton) {
  return (
    <button
      key={action.key}
      className={clsx(
        action.tone === "primary" ? "btn btn-primary justify-start" : "btn btn-secondary justify-start",
      )}
      onClick={action.onClick}
      disabled={action.disabled}
      type="button"
    >
      {action.label}
    </button>
  );
}

function WritingMobileSectionActions(props: {
  actions: ResolvedWritingMainActionButton[];
  disclosureTitle?: string;
  defaultOpen?: boolean;
}) {
  const resolvedActions = pickPreferredWritingAction(props.actions);
  if (!resolvedActions) return null;

  const primaryAction = resolvedActions.primary;
  const secondaryActions = resolvedActions.secondary;

  return (
    <div className="writing-workbench-actions">
      {renderWritingActionButton(primaryAction)}
      {secondaryActions.length > 0 ? (
        <WritingCompactDisclosure
          title={props.disclosureTitle ?? `更多入口（${secondaryActions.length}）`}
          defaultOpen={props.defaultOpen}
          className="writing-mobile-drawer-disclosure"
        >
          <div className="writing-workbench-actions">{secondaryActions.map(renderWritingActionButton)}</div>
        </WritingCompactDisclosure>
      ) : null}
    </div>
  );
}

function WritingMobileWorkflowCard(props: {
  kicker: string;
  title: string;
  copy: string;
  actions: ResolvedWritingMainActionButton[];
  disclosureTitle?: string;
  defaultOpen?: boolean;
}) {
  return (
    <section className="writing-mobile-workflow-card">
      <div className="writing-mobile-workflow-kicker">{props.kicker}</div>
      <div className="writing-mobile-workflow-title">{props.title}</div>
      <div className="writing-mobile-workflow-copy">{props.copy}</div>
      <div className="mt-3">
        <WritingMobileSectionActions
          actions={props.actions}
          disclosureTitle={props.disclosureTitle}
          defaultOpen={props.defaultOpen}
        />
      </div>
    </section>
  );
}

export function WritingStudioToolsDrawer(props: WritingStudioToolsDrawerProps) {
  const mainActionGroup = getWritingWorkbenchMainActionGroup({
    hasActiveChapter: props.hasActiveChapter,
    hasChapters: props.hasChapters,
    hasContent: props.hasContent,
    status: props.activeChapterStatus,
    dirty: props.dirty,
    saving: props.saving,
    continuityRevisionActive: props.continuityRevisionActive,
    continuityRevisionHasExcerpt: props.continuityRevisionHasExcerpt,
    continuityRevisionProgressStatus: props.continuityRevisionProgressStatus,
  });
  const nextStep = props.hasActiveChapter
    ? getWritingWorkbenchNextStep({
        status: props.activeChapterStatus,
        dirty: props.dirty,
        hasPlan: props.hasPlan,
        hasContent: props.hasContent,
        generating: props.generating,
        saving: props.saving,
        autoUpdatesTriggering: props.autoUpdatesTriggering,
        continuityRevisionActive: props.continuityRevisionActive,
        continuityRevisionProgressStatus: props.continuityRevisionProgressStatus,
      })
    : {
        title: mainActionGroup.title,
        description: mainActionGroup.copy,
      };
  const mainActionButtons = resolveWritingDrawerButtons(props, mainActionGroup.actions);
  const researchSection = getWritingWorkbenchResearchSection({
    hasActiveChapter: props.hasActiveChapter,
    hasContent: props.hasContent,
    generating: props.generating,
    continuityRevisionActive: props.continuityRevisionActive,
    continuityRevisionProgressStatus: props.continuityRevisionProgressStatus,
  });
  const researchButtons = resolveWritingDrawerButtons(props, researchSection.actions);
  const continuitySection = getWritingWorkbenchContinuitySection({
    hasActiveChapter: props.hasActiveChapter,
    status: props.activeChapterStatus,
    dirty: props.dirty,
    autoUpdatesTriggering: props.autoUpdatesTriggering,
    batchProgressText: props.batchProgressText,
    continuityRevisionActive: props.continuityRevisionActive,
    continuityRevisionProgressStatus: props.continuityRevisionProgressStatus,
  });
  const continuityButtons = resolveWritingDrawerButtons(props, continuitySection.actions);
  const runtimeNote = getWritingWorkbenchRuntimeNote({
    generating: props.generating,
    autoUpdatesTriggering: props.autoUpdatesTriggering,
    batchProgressText: props.batchProgressText,
  });
  const chapterStatusLabel = props.hasActiveChapter ? humanizeChapterStatus(props.activeChapterStatus ?? "drafting") : "未选择章节";
  const draftStateLabel = props.autoUpdatesTriggering
    ? "正在同步"
    : props.generating
      ? "生成中"
      : props.saving
        ? "保存中"
        : props.dirty
          ? "待保存"
          : "已保存";
  const continuityStateLabel = !props.continuityRevisionActive
    ? "当前无修订"
    : props.continuityRevisionProgressStatus === "saved"
      ? "待复核"
      : props.continuityRevisionProgressStatus === "dirty"
        ? "待保存"
        : "处理中";
  const draftingButtons: ResolvedWritingMainActionButton[] = [
    {
      key: "open_batch",
      label: `批量生成${props.batchProgressText}`,
      tone: "primary",
      disabled: false,
      onClick: () => runDrawerAction(props.onClose, props.onOpenBatch),
    },
    {
      key: "open_history",
      label: "生成记录",
      tone: "secondary",
      disabled: false,
      onClick: () => runDrawerAction(props.onClose, props.onOpenHistory),
    },
  ];

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      side="right"
      ariaLabel="作者工作台"
      panelClassName="h-full w-full max-w-md overflow-y-auto border-l border-border bg-canvas p-5 shadow-sm"
    >
      <div className="writing-mobile-drawer-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="writing-mobile-drawer-kicker">作者工作台</div>
            <div className="writing-mobile-drawer-title">本章工作台</div>
            <div className="writing-mobile-drawer-copy">
              生成、资料检查和连续性处理统一收在这里，让移动端也能把主稿留在注意力中心。
            </div>
          </div>
          <button className="btn btn-secondary" onClick={props.onClose} type="button">
            关闭
          </button>
        </div>

        <div className="writing-mobile-drawer-meta">
          <span className="manuscript-chip">移动端工作台</span>
          {props.batchProgressText ? <span className="manuscript-chip">批量任务 {props.batchProgressText}</span> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 pb-4">
        <div className="writing-mobile-drawer-panel">
          <div className="writing-mobile-drawer-status-grid">
            <div className="writing-mobile-drawer-status-card">
              <div className="writing-mobile-drawer-status-label">当前章节</div>
              <div className="writing-mobile-drawer-status-value">{chapterStatusLabel}</div>
            </div>
            <div className="writing-mobile-drawer-status-card">
              <div className="writing-mobile-drawer-status-label">稿面状态</div>
              <div className="writing-mobile-drawer-status-value">{draftStateLabel}</div>
            </div>
            <div className="writing-mobile-drawer-status-card">
              <div className="writing-mobile-drawer-status-label">章节计划</div>
              <div className="writing-mobile-drawer-status-value">{props.hasPlan ? "已整理" : "待补充"}</div>
            </div>
            <div className="writing-mobile-drawer-status-card">
              <div className="writing-mobile-drawer-status-label">连续性</div>
              <div className="writing-mobile-drawer-status-value">{continuityStateLabel}</div>
            </div>
          </div>
          {runtimeNote ? <div className="writing-mobile-drawer-runtime-note">{runtimeNote}</div> : null}
        </div>

        <WritingWorkbenchSection kicker="现在先做什么" title={nextStep.title} copy={nextStep.description}>
          <div className="writing-workbench-actions">
            {mainActionButtons.map(renderWritingActionButton)}
          </div>
        </WritingWorkbenchSection>

        <WritingWorkbenchSection kicker="生成与回看" title="把草稿推进下去" copy="适合开始连写、回看最近产出，或在批量任务跑动时跟踪进度。">
          <WritingMobileSectionActions
            actions={draftingButtons}
            disclosureTitle={WRITING_DISCLOSURE_COPY.drawerMoreReview}
            defaultOpen={Boolean(props.batchProgressText)}
          />
        </WritingWorkbenchSection>

        <WritingWorkbenchSection kicker="资料与校验" title={researchSection.title} copy={researchSection.copy}>
          <WritingMobileSectionActions
            actions={[
              ...researchButtons,
              {
                key: "open_tables",
                label: "表格面板",
                tone: "secondary",
                disabled: false,
                onClick: () => runDrawerAction(props.onClose, props.onOpenTables),
              },
            ]}
            disclosureTitle={WRITING_DISCLOSURE_COPY.drawerMoreResearch}
            defaultOpen={!props.hasContent || props.continuityRevisionActive}
          />
        </WritingWorkbenchSection>

        <WritingWorkbenchSection kicker="连续性与后台" title={continuitySection.title} copy={continuitySection.copy}>
          <WritingMobileSectionActions
            actions={continuityButtons}
            disclosureTitle={WRITING_DISCLOSURE_COPY.drawerMoreContinuity}
            defaultOpen={props.continuityRevisionActive || Boolean(props.batchProgressText) || props.autoUpdatesTriggering}
          />
        </WritingWorkbenchSection>
      </div>
    </Drawer>
  );
}

export type WritingStreamFloatingCardProps = {
  open: boolean;
  requestId: string | null;
  chapterLabel?: string;
  message?: string;
  progress: number;
  onExpand: () => void;
  onCancel: () => void;
};

export function WritingStreamFloatingCard(props: WritingStreamFloatingCardProps) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-x-4 bottom-24 z-40 flex justify-center sm:inset-auto sm:bottom-8 sm:right-8 sm:justify-end">
      <div className="writing-stream-card w-full max-w-sm rounded-atelier border border-border p-4 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="writing-stream-kicker">生成进行中</div>
            <div className="writing-stream-title">{WRITING_PAGE_COPY.streamFloatingTitle}</div>
            {props.chapterLabel ? <div className="mt-2 text-xs text-subtext">{props.chapterLabel}</div> : null}
            <div className="mt-2 text-sm leading-6 text-subtext">
              {props.message ?? WRITING_PAGE_COPY.streamFloatingPending}
            </div>
            <div className="mt-2 text-[11px] leading-6 text-subtext">{WRITING_PAGE_COPY.streamFloatingHint}</div>
            {props.requestId ? (
              <div className="writing-stream-meta mt-2 truncate">request_id: {props.requestId}</div>
            ) : null}
          </div>
          <div className="writing-stream-progress-badge shrink-0">
            {Math.max(0, Math.min(100, props.progress))}%
          </div>
        </div>
        <ProgressBar ariaLabel="写作页流式生成进度" className="mt-3" value={props.progress} />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={props.onExpand} type="button">
            {WRITING_PAGE_COPY.streamFloatingExpand}
          </button>
          <button className="btn btn-secondary" onClick={props.onCancel} type="button">
            {WRITING_PAGE_COPY.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
