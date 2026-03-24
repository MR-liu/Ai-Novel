import { DebugPageShell } from "../components/atelier/DebugPageShell";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { UI_COPY } from "../lib/uiCopy";

import {
  TaskCenterChangeSetsSection,
  TaskCenterDetailDrawer,
  TaskCenterHealthBanner,
  TaskCenterHelpSection,
  TaskCenterProjectTasksSection,
  TaskCenterTasksSection,
} from "./taskCenter/TaskCenterPageSections";
import { TASK_CENTER_COPY } from "./taskCenter/taskCenterCopy";
import { useTaskCenterPageState } from "./taskCenter/useTaskCenterPageState";
import { SYSTEM_WORKBENCH_COPY } from "./systemWorkbenchModels";

export function TaskCenterPage() {
  const state = useTaskCenterPageState();
  const healthStatus = state.healthBannerProps.health?.data.status ?? "未检测";
  const queueBackend =
    state.healthBannerProps.health?.data.effective_backend ??
    state.healthBannerProps.health?.data.queue_backend ??
    "未检测";
  const runningTotal = state.tasksSectionProps.summary.running + state.projectTasksSectionProps.summary.running;
  const failedTotal =
    state.changeSetsSectionProps.summary.failed +
    state.tasksSectionProps.summary.failed +
    state.projectTasksSectionProps.summary.failed;
  const proposedCount = state.changeSetsSectionProps.summary.proposed;
  const nextActionText =
    failedTotal > 0
      ? "先处理失败项，再判断问题是卡在执行、变更落地还是应用阶段。"
      : runningTotal > 0
        ? "当前还有任务在跑，先看运行状态和实时回报，再决定要不要深入详情。"
        : proposedCount > 0
          ? "当前没有明显失败，但还有待应用的变更集，下一步适合检查是否要落地。"
          : "系统当前没有明显积压，适合抽查最近一次写作或自动更新是否真的生效。";

  if (!state.projectId) return <div className="text-subtext">{TASK_CENTER_COPY.missingProjectId}</div>;

  return (
    <DebugPageShell
      eyebrow="系统与任务"
      title={UI_COPY.taskCenter.title}
      description="把变更集、任务状态、运行回报和检查入口放在一起，方便你判断系统有没有卡住、失败或需要重试。"
      whenToUse="写作生成、导入、自动更新或连续性任务跑完后，想确认结果是否成功落地时。"
      outcome="你会看到任务健康状态、失败原因、变更集和下一步检查入口。"
      risk="这里会展示定位编号、错误信息和运行状态，更适合集中检查，不适合作为日常首页。"
      actions={
        <button
          className="btn btn-secondary"
          onClick={state.onRefreshAll}
          aria-label="刷新 (taskcenter_refresh)"
          type="button"
        >
          {TASK_CENTER_COPY.refresh}
        </button>
      }
    >
      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">{nextActionText}</div>
          <div className="text-xs text-subtext">
            建议顺序：先看健康状态，再看失败/运行中任务，最后再深入具体详情和变更集。
          </div>
        </div>
        <div className="manuscript-status-list">
          <span className="manuscript-chip">健康状态：{healthStatus}</span>
          <span className="manuscript-chip">任务通道：{queueBackend}</span>
          <span className="manuscript-chip">运行中：{runningTotal}</span>
          <span className="manuscript-chip">失败项：{failedTotal}</span>
          <span className="manuscript-chip">待应用变更：{proposedCount}</span>
          <span className="manuscript-chip">实时回报：{state.projectTasksSectionProps.liveStatusLabel}</span>
        </div>
      </section>

      <ResearchWorkbenchPanel eyebrow="当前检查路径" {...SYSTEM_WORKBENCH_COPY.tasks} variant="compact" />

      <div className="studio-cluster">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">运行状态与检查入口</div>
            <div className="studio-cluster-copy">
              先确认任务通道和执行状态是不是正常，再决定要不要继续看失败任务、变更集或写作侧的落地结果。
            </div>
          </div>
        </div>
        <TaskCenterHealthBanner {...state.healthBannerProps} />
        <TaskCenterHelpSection {...state.helpSectionProps} />
      </div>

      <div className="studio-cluster">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">任务与变更清单</div>
            <div className="studio-cluster-copy">
              建议按“失败任务 → 项目任务 → 变更集”的顺序检查，能更快定位问题是卡在执行、落地还是应用阶段。
            </div>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TaskCenterChangeSetsSection {...state.changeSetsSectionProps} />
          <TaskCenterTasksSection {...state.tasksSectionProps} />
          <TaskCenterProjectTasksSection {...state.projectTasksSectionProps} />
        </div>
      </div>

      <TaskCenterDetailDrawer {...state.detailDrawerProps} />
    </DebugPageShell>
  );
}
