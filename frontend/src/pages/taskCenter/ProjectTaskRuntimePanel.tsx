import { getLatestRuntimeCheckpoint, type ProjectTaskRuntime } from "../../services/projectTaskRuntime";
import { FeedbackCallout, FeedbackEmptyState } from "../../components/ui/Feedback";
import { StatusBadge } from "./StatusBadge";
import { TASK_CENTER_COPY } from "./taskCenterCopy";
import {
  formatRuntimeBatchFlags,
  formatRuntimeBatchItemSummary,
  formatRuntimeBatchProgress,
  formatRuntimeCheckpointSummary,
  formatRuntimeTimelineMeta,
  formatRuntimeTimelineStep,
  formatTaskCenterErrorText,
} from "./taskCenterModels";

export function ProjectTaskRuntimePanel(props: {
  runtime: ProjectTaskRuntime | null;
  loading: boolean;
  actionLoading: boolean;
  onRefresh: () => void;
  onPauseBatch: () => void;
  onResumeBatch: () => void;
  onRetryFailedBatch: () => void;
  onSkipFailedBatch: () => void;
  onCancelBatch: () => void;
}) {
  const batch = props.runtime?.batch ?? null;
  const batchItems = batch?.items ?? [];
  const failedItems = batchItems.filter((item) => item.status === "failed");
  const latestCheckpoint = getLatestRuntimeCheckpoint(props.runtime);
  const canPause = Boolean(batch && (batch.task.status === "queued" || batch.task.status === "running"));
  const canResume = Boolean(batch && batch.task.status === "paused" && failedItems.length === 0);
  const canRetryFailed = Boolean(batch && batch.task.status === "paused" && failedItems.length > 0);
  const canSkipFailed = Boolean(batch && batch.task.status === "paused" && failedItems.length > 0);
  const canCancel = Boolean(
    batch && (batch.task.status === "queued" || batch.task.status === "running" || batch.task.status === "paused"),
  );
  const runtimeSummary = !props.runtime
    ? "还没有拿到运行现场。"
    : latestCheckpoint
      ? "系统已经记录到最近一次检查点，可以继续看批处理进度或时间线。"
      : "已经拿到运行现场，但还没有检查点摘要，建议继续刷新观察。";
  const batchNextStep = !batch
    ? "这类任务没有批处理现场，重点查看时间线和结果落点即可。"
    : failedItems.length > 0
      ? "当前有失败章节，建议先看失败项，再决定重试、跳过还是继续暂停排查。"
      : canPause
        ? "批处理仍在推进中，先观察进度和时间线，再决定是否暂停。"
        : canResume
          ? "批处理已暂停且没有失败项，确认无误后可以继续执行。"
          : "先看当前进度和章节状态，再决定下一步操作。";

  return (
    <>
      <section
        className="rounded-atelier border border-border bg-surface p-3"
        aria-label="projecttask_runtime_overview"
      >
        <div className="studio-cluster-header">
          <div>
            <div className="text-sm text-ink">{TASK_CENTER_COPY.runtimeTitle}</div>
            <div className="mt-1 text-xs leading-6 text-subtext">{runtimeSummary}</div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            aria-label="Refresh runtime detail (taskcenter_projecttask_runtime_refresh)"
            onClick={props.onRefresh}
            type="button"
          >
            {TASK_CENTER_COPY.runtimeRefreshButton}
          </button>
        </div>
        {props.loading ? (
          <FeedbackCallout className="mt-2 text-xs" title="正在读取运行现场">
            {TASK_CENTER_COPY.loading}
          </FeedbackCallout>
        ) : null}
        {!props.loading && !props.runtime ? (
          <FeedbackEmptyState
            className="mt-2"
            variant="compact"
            title="当前还没有运行现场"
            description={TASK_CENTER_COPY.runtimeEmpty}
          />
        ) : null}
        {props.runtime ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">时间线</div>
              <div className="mt-2 text-sm text-ink">{props.runtime.timeline.length}</div>
            </div>
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">检查点</div>
              <div className="mt-2 text-sm text-ink">{props.runtime.checkpoints.length}</div>
            </div>
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">步骤</div>
              <div className="mt-2 text-sm text-ink">{props.runtime.steps.length}</div>
            </div>
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-subtext">结果落点</div>
              <div className="mt-2 text-sm text-ink">{props.runtime.artifacts.length}</div>
            </div>
            {latestCheckpoint ? (
              <FeedbackCallout className="lg:col-span-4 text-xs" title="最近一次检查点摘要">
                {formatRuntimeCheckpointSummary(latestCheckpoint)}
              </FeedbackCallout>
            ) : null}
          </div>
        ) : null}
      </section>

      {batch ? (
        <section className="rounded-atelier border border-border bg-surface p-3" aria-label="projecttask_runtime_batch">
          <div className="studio-cluster-header">
            <div>
              <div className="text-sm text-ink">{TASK_CENTER_COPY.runtimeBatchTitle}</div>
              <div className="mt-1 text-xs leading-6 text-subtext">{batchNextStep}</div>
            </div>
            <div className="text-xs text-subtext">失败章节：{failedItems.length}</div>
          </div>
          <div className="manuscript-status-list mt-3">
            <span className="manuscript-chip">
              状态：
              <StatusBadge status={batch.task.status} kind="task" />
            </span>
            <span className="manuscript-chip">{formatRuntimeBatchProgress(batch.task)}</span>
            <span className="manuscript-chip">{formatRuntimeBatchFlags(batch.task)}</span>
          </div>
          {failedItems.length > 0 ? (
            <FeedbackCallout className="mt-3 text-xs" tone="warning" title="当前批处理存在失败章节">
              当前批处理里有失败章节。建议先滚动下方列表查看失败提示，再决定是重试还是跳过。
            </FeedbackCallout>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canPause ? (
              <button
                className="btn btn-secondary btn-sm"
                aria-label="Pause batch (taskcenter_batch_pause)"
                disabled={props.actionLoading}
                onClick={props.onPauseBatch}
                type="button"
              >
                {props.actionLoading ? TASK_CENTER_COPY.runtimeBatchWorking : TASK_CENTER_COPY.runtimeBatchPause}
              </button>
            ) : null}
            {canResume ? (
              <button
                className="btn btn-secondary btn-sm"
                aria-label="Resume batch (taskcenter_batch_resume)"
                disabled={props.actionLoading}
                onClick={props.onResumeBatch}
                type="button"
              >
                {props.actionLoading ? TASK_CENTER_COPY.runtimeBatchWorking : TASK_CENTER_COPY.runtimeBatchResume}
              </button>
            ) : null}
            {canRetryFailed ? (
              <button
                className="btn btn-secondary btn-sm"
                aria-label="Retry failed chapters (taskcenter_batch_retry_failed)"
                disabled={props.actionLoading}
                onClick={props.onRetryFailedBatch}
                type="button"
              >
                {props.actionLoading ? TASK_CENTER_COPY.runtimeBatchWorking : TASK_CENTER_COPY.runtimeBatchRetryFailed}
              </button>
            ) : null}
            {canSkipFailed ? (
              <button
                className="btn btn-secondary btn-sm"
                aria-label="Skip failed chapters (taskcenter_batch_skip_failed)"
                disabled={props.actionLoading}
                onClick={props.onSkipFailedBatch}
                type="button"
              >
                {props.actionLoading ? TASK_CENTER_COPY.runtimeBatchWorking : TASK_CENTER_COPY.runtimeBatchSkipFailed}
              </button>
            ) : null}
            {canCancel ? (
              <button
                className="btn btn-secondary btn-sm"
                aria-label="Cancel batch (taskcenter_batch_cancel)"
                disabled={props.actionLoading}
                onClick={props.onCancelBatch}
                type="button"
              >
                {props.actionLoading ? TASK_CENTER_COPY.runtimeBatchWorking : TASK_CENTER_COPY.runtimeBatchCancel}
              </button>
            ) : null}
          </div>
          <div
            className="mt-3 max-h-64 overflow-auto rounded-atelier border border-border bg-canvas"
            aria-label="projecttask_runtime_batch_items"
          >
            {batchItems.length === 0 ? (
              <div className="p-3">
                <FeedbackEmptyState
                  variant="compact"
                  title="当前没有批处理条目"
                  description={TASK_CENTER_COPY.runtimeNoBatchItems}
                />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {batchItems.map((item) => (
                  <div key={item.id} className="grid gap-1 px-3 py-2 text-xs text-subtext">
                    <div className="text-ink">第 {item.chapter_number} 章</div>
                    <div>{formatRuntimeBatchItemSummary(item)}</div>
                    {item.error_message ? (
                      <FeedbackCallout className="text-xs" tone="danger" title="章节执行失败">
                        {formatTaskCenterErrorText(null, item.error_message)}
                      </FeedbackCallout>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {props.runtime?.artifacts.length ? (
        <section
          className="rounded-atelier border border-border bg-surface p-3"
          aria-label="projecttask_runtime_artifacts"
        >
          <div className="studio-cluster-header">
            <div>
              <div className="text-sm text-ink">{TASK_CENTER_COPY.runtimeArtifactsTitle}</div>
              <div className="mt-1 text-xs leading-6 text-subtext">这里列出任务已经实际写出的运行记录或其他产物，适合确认结果有没有真正落地。</div>
            </div>
          </div>
          <div className="mt-2 grid gap-2 text-xs text-subtext">
            {props.runtime.artifacts.map((artifact) => (
              <div key={`${artifact.kind}-${artifact.id}`} className="flex flex-wrap items-center gap-2">
                <span>
                  {artifact.kind}: <span className="font-mono text-ink">{artifact.id}</span>
                </span>
                {artifact.kind === "generation_run" ? (
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`/api/generation_runs/${encodeURIComponent(artifact.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {TASK_CENTER_COPY.runtimeOpenGenerationRun}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {props.runtime ? (
        <section
          className="rounded-atelier border border-border bg-surface p-3"
          aria-label="projecttask_runtime_timeline"
        >
          <div className="studio-cluster-header">
            <div>
              <div className="text-sm text-ink">{TASK_CENTER_COPY.runtimeTimelineTitle}</div>
              <div className="mt-1 text-xs leading-6 text-subtext">按发生顺序回看这个任务经历了什么，适合排查“卡住、失败、回滚或重复执行”这类问题。</div>
            </div>
          </div>
          {props.runtime.timeline.length === 0 ? (
            <FeedbackEmptyState
              className="mt-2"
              variant="compact"
              title="当前还没有时间线事件"
              description={TASK_CENTER_COPY.runtimeNoTimeline}
            />
          ) : (
            <div className="mt-3 max-h-72 space-y-2 overflow-auto">
              {props.runtime.timeline.map((entry) => (
                <div
                  key={`${entry.seq}-${entry.event_type}`}
                  className="rounded-atelier border border-border bg-canvas px-3 py-2 text-xs text-subtext"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-ink">
                    <span>
                      #{entry.seq} | {entry.event_type}
                    </span>
                    <span>{entry.created_at || "-"}</span>
                  </div>
                  <div className="mt-1">{formatRuntimeTimelineMeta(entry)}</div>
                  {formatRuntimeTimelineStep(entry.step) ? (
                    <div className="mt-1">{formatRuntimeTimelineStep(entry.step)}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
