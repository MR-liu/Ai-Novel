import { Link, Navigate, useParams } from "react-router-dom";

import { AuthorPageIntro, AuthorPageTabs, StudioModeRequiredPanel } from "../components/layout/AuthorPageScaffold";
import { StudioWorkbenchPanel } from "../components/layout/StudioWorkbenchPanel";
import { useAppMode } from "../contexts/AppModeContext";
import { buildProjectReviewPath, buildProjectWritePath, buildStudioSystemPath, type StudioSystemTab } from "../lib/projectRoutes";

import { FractalPage } from "./FractalPage";
import { StructuredMemoryPage } from "./StructuredMemoryPage";
import { TaskCenterPage } from "./TaskCenterPage";
import { STUDIO_SYSTEM_TAB_COPY, STUDIO_SYSTEM_TABS } from "./studioWorkbenchModels";

export function StudioSystemPage() {
  const { mode } = useAppMode();
  const { projectId, tab } = useParams();
  const currentTab = (tab ?? "tasks") as StudioSystemTab;

  if (!projectId) return null;
  if (!STUDIO_SYSTEM_TABS.includes(currentTab)) {
    return <Navigate replace to={buildStudioSystemPath(projectId)} />;
  }

  const currentCopy = STUDIO_SYSTEM_TAB_COPY[currentTab];
  const tabItems = STUDIO_SYSTEM_TABS.map((studioTab) => ({
    key: studioTab,
    label: STUDIO_SYSTEM_TAB_COPY[studioTab].title,
    to: buildStudioSystemPath(projectId, studioTab),
  }));

  if (mode !== "studio") {
    return (
      <div className="grid gap-4">
        <AuthorPageIntro
          variant="compact"
          title="系统与任务"
          subtitle="这里承接任务运行、连续性底座和长期记忆等深层工作区，只在工作室模式开放。"
          whenToUse="要追任务进度、核对连续性底座，或查看更深层的记忆状态时。"
          outcome="你会得到完整的系统工作台与深层检查入口。"
          risk="这里更适合集中排查和整理，不适合作为日常写作首页。"
        />
        <StudioModeRequiredPanel />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pb-24">
      <AuthorPageIntro
        variant="compact"
        title="系统与任务"
        subtitle="把任务中心、连续性底座和长期记忆等深层能力收进工作室模式。"
        whenToUse="需要追任务、看连续性状态或进入更深的记忆系统时。"
        outcome="你会得到统一的系统工作台，不必把这些深层能力塞进主写作路径。"
        risk="这里偏状态核对与系统整理，不适合作为日常写作首页。"
      />
      <AuthorPageTabs
        current={currentTab}
        tabs={tabItems}
      />
      <StudioWorkbenchPanel
        title={currentCopy.title}
        text={currentCopy.text}
        bestFor={currentCopy.bestFor}
        nextStep={currentCopy.nextStep}
        caution={currentCopy.caution}
        actions={
          <>
            {currentTab !== "tasks" ? (
              <Link className="btn btn-secondary" to={buildStudioSystemPath(projectId, "tasks")}>
                去任务中心看运行状态
              </Link>
            ) : null}
            {currentTab !== "structured-memory" ? (
              <Link className="btn btn-secondary" to={buildProjectReviewPath(projectId, "analysis")}>
                去连续性检查验证正文冲突
              </Link>
            ) : null}
            <Link className="btn btn-secondary" to={buildProjectWritePath(projectId)}>
              回写作页修正文稿
            </Link>
          </>
        }
      />
      {currentTab === "tasks" ? <TaskCenterPage /> : null}
      {currentTab === "structured-memory" ? <StructuredMemoryPage /> : null}
      {currentTab === "fractal" ? <FractalPage /> : null}
    </div>
  );
}
