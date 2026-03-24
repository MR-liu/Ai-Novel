import clsx from "clsx";

import { GhostwriterIndicator } from "../../components/atelier/GhostwriterIndicator";
import { MarkdownEditor } from "../../components/atelier/MarkdownEditor";
import { FeedbackCallout } from "../../components/ui/Feedback";
import type { AppMode } from "../../contexts/AppModeContext";
import { WritingCompactDisclosure } from "../../components/writing/WritingCompactDisclosure";
import { humanizeChapterStatus } from "../../lib/humanize";
import type { ContinuityRevisionProgressStatus } from "../../services/continuityRevisionQueue";
import type { Chapter, ChapterStatus } from "../../types";

import type { ChapterForm } from "./writingUtils";
import {
  getWritingChapterHeading,
  WRITING_DISCLOSURE_COPY,
  getWritingGenerateIndicatorLabel,
  getWritingReadonlyCallout,
  getWritingStatusHint,
  WRITING_PAGE_COPY,
} from "./writingPageCopy";
import {
  type WritingContinuityRevisionChecklistItem,
  type WritingContinuityRevisionQueueNavigation,
  getWritingContinuityRevisionProgressBadge,
  getWritingWorkbenchReadinessItems,
  summarizeWritingContinuityRevisionQueue,
} from "./writingPageModels";
import { compactPreview, estimateCharacterCount } from "./writingPageSectionUtils";

export type WritingEditorSectionProps = {
  appMode: AppMode;
  activeChapter: Chapter | null;
  hasChapters: boolean;
  form: ChapterForm | null;
  dirty: boolean;
  isDoneReadonly: boolean;
  loadingChapter: boolean;
  generating: boolean;
  saving: boolean;
  autoUpdatesTriggering: boolean;
  continuityRevision: {
    id: string;
    title: string;
    typeLabel: string;
    excerpt: string;
    hasExcerpt: boolean;
    progressStatus: ContinuityRevisionProgressStatus | null;
  } | null;
  continuityRevisionChecklist: WritingContinuityRevisionChecklistItem[];
  continuityRevisionQueue: Array<{
    id: string;
    title: string;
    typeLabel: string;
    isActive: boolean;
    progressStatus: ContinuityRevisionProgressStatus | null;
  }>;
  continuityRevisionQueueNavigation: WritingContinuityRevisionQueueNavigation;
  returnToContinuityAfterComplete: boolean;
  contentEditorTab: "edit" | "preview";
  onContentEditorTabChange: (tab: "edit" | "preview") => void;
  onTitleChange: (value: string) => void;
  onStatusChange: (status: ChapterStatus) => void;
  onPlanChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onContentTextareaRef: (element: HTMLTextAreaElement | null) => void;
  onOpenAnalysis: () => void;
  onOpenChapterTrace: () => void;
  onOpenChapterList: () => void;
  onCreateChapter: () => void;
  onDeleteChapter: () => void;
  onSaveAndTriggerAutoUpdates: () => void;
  onSaveChapter: () => void;
  onReopenDrafting: () => void;
  onLocateContinuityRevision: () => void;
  onReturnToContinuityReview: () => void;
  onDismissContinuityRevision: () => void;
  onActivateContinuityRevisionQueueItem: (itemId: string) => void;
  onRemoveContinuityRevisionQueueItem: (itemId: string) => void;
  onActivatePreviousContinuityRevision: () => void;
  onActivateNextContinuityRevision: () => void;
  onCompleteContinuityRevisionAndAdvance: () => void;
  onReturnToContinuityAfterCompleteChange: (value: boolean) => void;
  generationIndicatorLabel?: string;
};

function formatEditorSaveState(props: WritingEditorSectionProps): {
  label: string;
  toneClassName: string;
} {
  if (props.autoUpdatesTriggering) {
    return {
      label: WRITING_PAGE_COPY.editorSaveStateAutoUpdating,
      toneClassName: "is-busy",
    };
  }
  if (props.saving) {
    return {
      label: WRITING_PAGE_COPY.editorSaveStateSaving,
      toneClassName: "is-busy",
    };
  }
  if (props.dirty) {
    return {
      label: WRITING_PAGE_COPY.editorSaveStateDirty,
      toneClassName: "is-dirty",
    };
  }
  return {
    label: WRITING_PAGE_COPY.editorSaveStateSaved,
    toneClassName: "is-saved",
  };
}

export function WritingEditorSection(props: WritingEditorSectionProps) {
  if (!props.activeChapter || !props.form) {
    return (
      <div className="manuscript-editor manuscript-paper p-8">
        <div className="writing-empty-state">
          <div className="writing-empty-kicker">开始写作</div>
          <div className="writing-empty-title">
            {props.hasChapters ? WRITING_PAGE_COPY.emptyStateSelectChapterTitle : WRITING_PAGE_COPY.emptyStateNoChapterTitle}
          </div>
          <div className="writing-empty-copy">
            {props.hasChapters ? WRITING_PAGE_COPY.emptyStateSelectChapterCopy : WRITING_PAGE_COPY.emptyStateNoChapterCopy}
          </div>

          <div className="writing-empty-step-row">
            <span className="writing-progress-pill is-pending">{WRITING_PAGE_COPY.emptyStateStepPlan}</span>
            <span className="writing-progress-pill is-pending">{WRITING_PAGE_COPY.emptyStateStepDraft}</span>
            <span className="writing-progress-pill is-pending">{WRITING_PAGE_COPY.emptyStateStepReview}</span>
          </div>

          <div className="writing-empty-actions">
            <button className="btn btn-primary" onClick={props.onCreateChapter} type="button">
              {WRITING_PAGE_COPY.emptyStatePrimaryAction}
            </button>
            {props.hasChapters ? (
              <button className="btn btn-secondary" onClick={props.onOpenChapterList} type="button">
                {WRITING_PAGE_COPY.emptyStateOpenDirectory}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const characterCount = estimateCharacterCount(props.form.content_md);
  const readinessItems = getWritingWorkbenchReadinessItems(
    props.form.plan,
    props.form.content_md,
    props.form.summary,
  );
  const saveState = formatEditorSaveState(props);
  const editorFootnote = props.isDoneReadonly
    ? WRITING_PAGE_COPY.editorReadonlyFootnote
    : props.dirty
      ? WRITING_PAGE_COPY.editorDirtyFootnote
      : WRITING_PAGE_COPY.editorSavedFootnote;
  const runtimeNote = props.generating
    ? props.generationIndicatorLabel ?? getWritingGenerateIndicatorLabel()
    : props.autoUpdatesTriggering
      ? WRITING_PAGE_COPY.editorSaveStateAutoUpdating
      : null;
  const continuityRevisionProgressBadge = props.continuityRevision
    ? getWritingContinuityRevisionProgressBadge(props.continuityRevision.progressStatus)
    : null;
  const continuityRevisionQueueSummary = summarizeWritingContinuityRevisionQueue(props.continuityRevisionQueue);
  const planReady = Boolean(String(props.form.plan || "").trim());
  const summaryReady = Boolean(String(props.form.summary || "").trim());
  const supportDisclosureDefaultOpen = !planReady || !summaryReady || props.dirty;
  const headerSecondaryActions: Array<{
    key: string;
    label: string;
    disabled: boolean;
    className: string;
    onClick: () => void;
  }> = [
    ...(props.appMode === "studio"
      ? [
          {
            key: "analysis",
            label: WRITING_PAGE_COPY.analysis,
            disabled: props.loadingChapter || props.generating,
            className: "btn btn-secondary",
            onClick: props.onOpenAnalysis,
          },
          {
            key: "trace",
            label: WRITING_PAGE_COPY.trace,
            disabled: props.loadingChapter || props.generating,
            className: "btn btn-secondary",
            onClick: props.onOpenChapterTrace,
          },
          {
            key: "save_and_trigger",
            label: props.autoUpdatesTriggering ? WRITING_PAGE_COPY.saveAndTriggerPending : WRITING_PAGE_COPY.saveAndTrigger,
            disabled:
              props.loadingChapter || props.generating || props.saving || props.autoUpdatesTriggering || !props.dirty,
            className: "btn btn-secondary",
            onClick: props.onSaveAndTriggerAutoUpdates,
          },
        ]
      : []),
    {
      key: "delete",
      label: WRITING_PAGE_COPY.delete,
      disabled: props.loadingChapter || props.generating,
      className: "btn btn-ghost text-accent hover:bg-accent/10",
      onClick: props.onDeleteChapter,
    },
  ];

  return (
    <div className="manuscript-editor manuscript-paper p-5 sm:p-6">
      {props.isDoneReadonly ? (
        <div className="manuscript-editor-notice is-readonly mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm leading-6">{getWritingReadonlyCallout()}</div>
          <button className="btn btn-secondary" onClick={props.onReopenDrafting} type="button">
            {WRITING_PAGE_COPY.readonlyCalloutAction}
          </button>
        </div>
      ) : null}

      {props.continuityRevision ? (
        <FeedbackCallout
          className="mb-4"
          tone={props.continuityRevision.hasExcerpt ? "info" : "warning"}
          title="从连续性台带来的修订提醒"
          actions={
            <>
              <button
                className="btn btn-secondary px-3 py-1 text-xs"
                type="button"
                onClick={props.onLocateContinuityRevision}
                disabled={!props.continuityRevision.hasExcerpt}
              >
                定位引用句
              </button>
              <button
                className="btn btn-secondary px-3 py-1 text-xs"
                type="button"
                onClick={props.onReturnToContinuityReview}
              >
                回连续性台
              </button>
            </>
          }
        >
          <div className="font-medium text-ink">{props.continuityRevision.title}</div>
          <div className="mt-1 text-sm leading-6">
            当前问题类型：{props.continuityRevision.typeLabel}。建议先把这一处改顺，再继续扩写，避免带着冲突把后文越写越偏。
          </div>
          <div className="mt-2 text-xs leading-5 text-subtext">
            {props.continuityRevision.hasExcerpt
              ? `引用句：${compactPreview(props.continuityRevision.excerpt, 140)}`
              : "当前条目没有可直接定位的正文片段，可以先根据标题和类型处理，再回连续性台复核。"}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {props.continuityRevisionQueueNavigation.total > 0 ? (
              <span className="manuscript-chip">
                当前第 {Math.max(1, props.continuityRevisionQueueNavigation.activeIndex + 1)} / {props.continuityRevisionQueueNavigation.total} 条
              </span>
            ) : null}
            {continuityRevisionProgressBadge ? (
              <span
                className={clsx(
                  "manuscript-chip",
                  continuityRevisionProgressBadge.tone === "warning" && "border-warning/40 bg-warning/10 text-warning",
                )}
              >
                {continuityRevisionProgressBadge.label}
              </span>
            ) : null}
            <button
              className="btn btn-secondary px-3 py-1 text-xs"
              type="button"
              onClick={props.onActivatePreviousContinuityRevision}
              disabled={!props.continuityRevisionQueueNavigation.previousId}
            >
              上一条
            </button>
            <button
              className="btn btn-secondary px-3 py-1 text-xs"
              type="button"
              onClick={props.onActivateNextContinuityRevision}
              disabled={!props.continuityRevisionQueueNavigation.nextId}
            >
              下一条
            </button>
            <button
              className="btn btn-primary px-3 py-1 text-xs"
              type="button"
              onClick={props.onCompleteContinuityRevisionAndAdvance}
            >
              {props.returnToContinuityAfterComplete
                ? "处理完成并回连续性台"
                : props.continuityRevisionQueueNavigation.nextId
                  ? "处理完成并继续下一条"
                  : "处理完成并移出队列"}
            </button>
            <button
              className="btn btn-ghost px-3 py-1 text-xs"
              type="button"
              onClick={props.onDismissContinuityRevision}
            >
              收起提醒
            </button>
          </div>
          <label className="mt-3 inline-flex items-start gap-2 text-xs leading-5 text-subtext">
            <input
              className="checkbox mt-0.5 shrink-0"
              type="checkbox"
              checked={props.returnToContinuityAfterComplete}
              onChange={(event) => props.onReturnToContinuityAfterCompleteChange(event.target.checked)}
            />
            <span>
              处理完成后先回连续性台复核这一条。开启后，本次完成不会自动切到下一条，适合逐条改完就回看判断。
            </span>
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {props.continuityRevisionChecklist.map((item) => (
              <div
                key={item.key}
                className={clsx(
                  "rounded-atelier border px-3 py-3",
                  item.done ? "border-success/30 bg-success/10" : "border-border bg-canvas/70",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-subtext">{item.title}</div>
                  <span className={clsx("manuscript-chip", item.done && "border-success/40 bg-success/10")}>
                    {item.done ? "已完成" : "待处理"}
                  </span>
                </div>
                <div className="mt-2 text-xs leading-5 text-subtext">{item.hint}</div>
              </div>
            ))}
          </div>
        </FeedbackCallout>
      ) : null}

      {props.continuityRevisionQueue.length > 0 ? (
        <section className="mb-4 rounded-atelier border border-border bg-canvas/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-subtext">整章修订队列</div>
              <div className="mt-1 text-base font-semibold text-ink">这一章还有 {props.continuityRevisionQueue.length} 条连续性问题待处理</div>
              <div className="mt-1 text-sm leading-6 text-subtext">
                可以先处理当前条目，也可以切换到下一条继续改。移出队列不会改正文，只是把这条从当前修订列表拿掉。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="manuscript-chip">队列 {continuityRevisionQueueSummary.total} 条</span>
              {continuityRevisionQueueSummary.dirtyCount > 0 ? (
                <span className="manuscript-chip border-warning/40 bg-warning/10 text-warning">
                  未保存改动 {continuityRevisionQueueSummary.dirtyCount} 条
                </span>
              ) : null}
              {continuityRevisionQueueSummary.savedCount > 0 ? (
                <span className="manuscript-chip">已保存待复核 {continuityRevisionQueueSummary.savedCount} 条</span>
              ) : null}
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {props.continuityRevisionQueue.map((item, index) => {
              const progressBadge = getWritingContinuityRevisionProgressBadge(item.progressStatus);
              return (
                <div
                  key={item.id}
                  className={clsx(
                    "flex flex-wrap items-start justify-between gap-3 rounded-atelier border px-3 py-3",
                    item.isActive ? "border-accent bg-accent/5" : "border-border bg-surface",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-subtext">#{index + 1}</span>
                      <div className="truncate text-sm font-semibold text-ink">{item.title}</div>
                      <span className="manuscript-chip">{item.typeLabel}</span>
                      {item.isActive ? <span className="manuscript-chip border-accent/40 bg-accent/10">当前处理</span> : null}
                      {progressBadge ? (
                        <span
                          className={clsx(
                            "manuscript-chip",
                            progressBadge.tone === "warning" && "border-warning/40 bg-warning/10 text-warning",
                          )}
                        >
                          {progressBadge.label}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-secondary px-3 py-1 text-xs"
                      type="button"
                      onClick={() => props.onActivateContinuityRevisionQueueItem(item.id)}
                      disabled={item.isActive}
                    >
                      {item.isActive ? "正在处理" : "设为当前条目"}
                    </button>
                    <button
                      className="btn btn-ghost px-3 py-1 text-xs"
                      type="button"
                      onClick={() => props.onRemoveContinuityRevisionQueueItem(item.id)}
                    >
                      移出队列
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="manuscript-draft-header">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-subtext">主稿页</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="font-content text-3xl text-[rgb(var(--color-editor-ink))]">
              {getWritingChapterHeading(props.activeChapter.number)}
            </div>
            <span className={clsx("manuscript-save-pill", saveState.toneClassName)}>{saveState.label}</span>
          </div>
          <div className="mt-2 text-sm leading-6 text-subtext">
            {props.activeChapter.title?.trim()
              ? `这章当前标题是「${props.activeChapter.title.trim()}」。把主冲突和推进方向写清，后面会更好回看。`
              : "这章还没有明确标题，先给它一个你自己回头一眼就能认出的名字。"}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="manuscript-chip">
              {WRITING_PAGE_COPY.updatedAtPrefix} {props.activeChapter.updated_at}
            </span>
            <span className="manuscript-chip">{characterCount} 字</span>
            <span className="manuscript-chip">{humanizeChapterStatus(props.form.status)}</span>
            {runtimeNote ? <span className="manuscript-chip">{runtimeNote}</span> : null}
          </div>
        </div>
        <div className="manuscript-draft-header-actions">
          <div className="manuscript-draft-header-actions-mobile sm:hidden">
            <button
              className="btn btn-primary"
              disabled={!props.dirty || props.saving || props.loadingChapter || props.generating}
              onClick={props.onSaveChapter}
              type="button"
            >
              {props.saving ? WRITING_PAGE_COPY.saving : WRITING_PAGE_COPY.save}
            </button>
            {headerSecondaryActions.length > 0 ? (
              <WritingCompactDisclosure
                title={WRITING_DISCLOSURE_COPY.headerMoreActions}
                className="manuscript-draft-header-disclosure"
              >
                <div className="manuscript-draft-header-disclosure-actions">
                  {headerSecondaryActions.map((action) => (
                    <button
                      key={action.key}
                      className={action.className}
                      disabled={action.disabled}
                      onClick={action.onClick}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </WritingCompactDisclosure>
            ) : null}
          </div>
          <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
            {props.appMode === "studio" ? (
              <>
                <button
                  className="btn btn-secondary"
                  disabled={props.loadingChapter || props.generating}
                  onClick={props.onOpenAnalysis}
                  type="button"
                >
                  {WRITING_PAGE_COPY.analysis}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={props.loadingChapter || props.generating}
                  onClick={props.onOpenChapterTrace}
                  type="button"
                >
                  {WRITING_PAGE_COPY.trace}
                </button>
              </>
            ) : null}
            <button
              className="btn btn-ghost text-accent hover:bg-accent/10"
              disabled={props.loadingChapter || props.generating}
              onClick={props.onDeleteChapter}
              type="button"
            >
              {WRITING_PAGE_COPY.delete}
            </button>
            {props.appMode === "studio" ? (
              <button
                className="btn btn-secondary"
                disabled={
                  props.loadingChapter || props.generating || props.saving || props.autoUpdatesTriggering || !props.dirty
                }
                onClick={props.onSaveAndTriggerAutoUpdates}
                type="button"
              >
                {props.autoUpdatesTriggering ? WRITING_PAGE_COPY.saveAndTriggerPending : WRITING_PAGE_COPY.saveAndTrigger}
              </button>
            ) : null}
            <button
              className="btn btn-primary"
              disabled={!props.dirty || props.saving || props.loadingChapter || props.generating}
              onClick={props.onSaveChapter}
              type="button"
            >
              {props.saving ? WRITING_PAGE_COPY.saving : WRITING_PAGE_COPY.save}
            </button>
          </div>
        </div>
      </div>

      {props.generating ? (
        <GhostwriterIndicator
          className="mt-4 manuscript-runtime-indicator"
          label={props.generationIndicatorLabel ?? getWritingGenerateIndicatorLabel()}
        />
      ) : null}

      <div className="manuscript-title-grid">
        <label className="manuscript-field-card sm:col-span-2">
          <span className="manuscript-field-kicker">{WRITING_PAGE_COPY.titleLabel}</span>
          <div className="manuscript-field-heading">给这一章一个明确路标</div>
          <div className="manuscript-field-copy">{WRITING_PAGE_COPY.titleHelper}</div>
          <input
            className="input-underline manuscript-title-input font-content"
            name="title"
            value={props.form.title}
            readOnly={props.isDoneReadonly}
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
        </label>
        <label className="manuscript-field-card sm:col-span-1">
          <span className="manuscript-field-kicker">{WRITING_PAGE_COPY.statusLabel}</span>
          <div className="manuscript-field-heading">决定这章处在哪个阶段</div>
          <div className="manuscript-field-copy">{getWritingStatusHint()}</div>
          <select
            className="select"
            name="status"
            value={props.form.status}
            onChange={(event) => props.onStatusChange(event.target.value as ChapterStatus)}
          >
            <option value="planned">{humanizeChapterStatus("planned")}</option>
            <option value="drafting">{humanizeChapterStatus("drafting")}</option>
            <option value="done">{humanizeChapterStatus("done")}</option>
          </select>
        </label>
      </div>

      <div className="manuscript-editor-pills">
        {readinessItems.map((item) => (
          <span key={item.key} className={clsx("writing-progress-pill", item.ready ? "is-ready" : "is-pending")}>
            {item.summary}
          </span>
        ))}
      </div>

      <div className="manuscript-support-mobile">
        <WritingCompactDisclosure
          title={planReady ? WRITING_DISCLOSURE_COPY.planReady : WRITING_DISCLOSURE_COPY.planPending}
          defaultOpen={supportDisclosureDefaultOpen}
          className="manuscript-support-disclosure"
        >
          <label className="manuscript-field-card">
            <span className="manuscript-field-kicker">{WRITING_PAGE_COPY.planLabel}</span>
            <div className="manuscript-field-heading">先写清这一章要发生什么</div>
            <div className="manuscript-field-copy">{WRITING_PAGE_COPY.planHelper}</div>
            <textarea
              className="textarea manuscript-support-textarea atelier-content bg-[rgb(var(--color-editor-paper)/0.72)] text-[rgb(var(--color-editor-ink))]"
              name="plan"
              rows={5}
              value={props.form.plan}
              readOnly={props.isDoneReadonly}
              onChange={(event) => props.onPlanChange(event.target.value)}
            />
          </label>
        </WritingCompactDisclosure>
        <WritingCompactDisclosure
          title={summaryReady ? WRITING_DISCLOSURE_COPY.summaryReady : WRITING_DISCLOSURE_COPY.summaryPending}
          defaultOpen={supportDisclosureDefaultOpen}
          className="manuscript-support-disclosure"
        >
          <label className="manuscript-field-card">
            <span className="manuscript-field-kicker">{WRITING_PAGE_COPY.summaryLabel}</span>
            <div className="manuscript-field-heading">顺手记下已经落定的事实</div>
            <div className="manuscript-field-copy">{WRITING_PAGE_COPY.summaryHelper}</div>
            <textarea
              className="textarea manuscript-support-textarea atelier-content bg-[rgb(var(--color-editor-paper)/0.72)] text-[rgb(var(--color-editor-ink))]"
              name="summary"
              rows={5}
              value={props.form.summary}
              readOnly={props.isDoneReadonly}
              onChange={(event) => props.onSummaryChange(event.target.value)}
            />
          </label>
        </WritingCompactDisclosure>
      </div>

      <div className="manuscript-support-grid">
        <label className="manuscript-field-card">
          <span className="manuscript-field-kicker">{WRITING_PAGE_COPY.planLabel}</span>
          <div className="manuscript-field-heading">先写清这一章要发生什么</div>
          <div className="manuscript-field-copy">{WRITING_PAGE_COPY.planHelper}</div>
          <textarea
            className="textarea manuscript-support-textarea atelier-content bg-[rgb(var(--color-editor-paper)/0.72)] text-[rgb(var(--color-editor-ink))]"
            name="plan"
            rows={5}
            value={props.form.plan}
            readOnly={props.isDoneReadonly}
            onChange={(event) => props.onPlanChange(event.target.value)}
          />
        </label>
        <label className="manuscript-field-card">
          <span className="manuscript-field-kicker">{WRITING_PAGE_COPY.summaryLabel}</span>
          <div className="manuscript-field-heading">顺手记下已经落定的事实</div>
          <div className="manuscript-field-copy">{WRITING_PAGE_COPY.summaryHelper}</div>
          <textarea
            className="textarea manuscript-support-textarea atelier-content bg-[rgb(var(--color-editor-paper)/0.72)] text-[rgb(var(--color-editor-ink))]"
            name="summary"
            rows={5}
            value={props.form.summary}
            readOnly={props.isDoneReadonly}
            onChange={(event) => props.onSummaryChange(event.target.value)}
          />
        </label>
      </div>

      <section className="manuscript-main-section">
        <div className="manuscript-main-section-header">
          <div className="min-w-0">
            <div className="manuscript-field-kicker">{WRITING_PAGE_COPY.contentLabel}</div>
            <div className="manuscript-field-heading">把这一章真正写出来</div>
            <div className="manuscript-field-copy">{WRITING_PAGE_COPY.contentHelper}</div>
          </div>
          <div className="manuscript-main-section-meta">
            <span className="manuscript-chip">{props.contentEditorTab === "edit" ? "编辑模式" : "预览模式"}</span>
            <span className="manuscript-chip">{characterCount} 字</span>
          </div>
        </div>
        <div className="manuscript-main-frame">
          <MarkdownEditor
            value={props.form.content_md}
            onChange={props.onContentChange}
            placeholder={WRITING_PAGE_COPY.contentPlaceholder}
            minRows={16}
            name="content_md"
            readOnly={props.isDoneReadonly}
            tab={props.contentEditorTab}
            onTabChange={props.onContentEditorTabChange}
            textareaRef={props.onContentTextareaRef}
          />
        </div>
      </section>

      <div className="manuscript-editor-footnote">
        <span>{WRITING_PAGE_COPY.hotkeyHint}</span>
        <span>{editorFootnote}</span>
      </div>
    </div>
  );
}
