import { Link, Navigate, useParams } from "react-router-dom";

import { AuthorPageIntro, AuthorPageTabs, StudioModeRequiredPanel } from "../components/layout/AuthorPageScaffold";
import { StudioWorkbenchPanel } from "../components/layout/StudioWorkbenchPanel";
import { useAppMode } from "../contexts/AppModeContext";
import { buildProjectWritePath, buildStudioResearchPath, type StudioResearchTab } from "../lib/projectRoutes";

import { lazyPage, PageContentLoader } from "./lazyPage";
import { STUDIO_RESEARCH_TAB_COPY, STUDIO_RESEARCH_TABS } from "./studioWorkbenchModels";

const LazyGraphPage = lazyPage(() => import("./GraphPage"), (mod) => mod.GraphPage);
const LazyImportPage = lazyPage(() => import("./ImportPage"), (mod) => mod.ImportPage);
const LazyRagPage = lazyPage(() => import("./RagPage"), (mod) => mod.RagPage);
const LazySearchPage = lazyPage(() => import("./SearchPage"), (mod) => mod.SearchPage);

export function StudioResearchPage() {
  const { mode } = useAppMode();
  const { projectId, tab } = useParams();
  const currentTab = (tab ?? "import-docs") as StudioResearchTab;

  if (!projectId) return null;
  if (!STUDIO_RESEARCH_TABS.includes(currentTab)) {
    return <Navigate replace to={buildStudioResearchPath(projectId)} />;
  }

  const currentCopy = STUDIO_RESEARCH_TAB_COPY[currentTab];
  const tabItems = STUDIO_RESEARCH_TABS.map((studioTab) => ({
    key: studioTab,
    label: STUDIO_RESEARCH_TAB_COPY[studioTab].title,
    to: buildStudioResearchPath(projectId, studioTab),
  }));

  if (mode !== "studio") {
    return (
      <div className="grid gap-4">
        <AuthorPageIntro
          variant="compact"
          title="资料检索"
          subtitle="这里承接文档导入、资料库、搜索和关系图，只在工作室模式显示完整能力。"
          whenToUse="要导入参考资料、确认资料是否可查、做全项目搜索或关系追踪时。"
          outcome="你会得到完整的资料整理与检索能力。"
          risk="这里偏资料治理，不适合在专注写作时长期停留。"
        />
        <StudioModeRequiredPanel />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pb-24">
      <AuthorPageIntro
        variant="compact"
        title="资料检索"
        subtitle="把导入文档、资料库、搜索与关系图收在一个资料工作台。"
        whenToUse="需要导入外部资料、确认资料是否生效、定位信息或查看关系网络时。"
        outcome="你会得到统一的资料入口，不必在资料库、搜索、关系图之间跳来跳去。"
        risk="导入和重建可能耗时，也会带来更多系统信息；适合在工作室模式集中处理。"
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
            {currentTab !== "knowledge-base" ? (
              <Link className="btn btn-secondary" to={buildStudioResearchPath(projectId, "knowledge-base")}>
                去资料库确认资料是否可用
              </Link>
            ) : null}
            {currentTab !== "search" ? (
              <Link className="btn btn-secondary" to={buildStudioResearchPath(projectId, "search")}>
                去搜索验证命中效果
              </Link>
            ) : null}
            <Link className="btn btn-secondary" to={buildProjectWritePath(projectId)}>
              回写作页处理正文引用
            </Link>
          </>
        }
      />
      <PageContentLoader>
        {currentTab === "import-docs" ? <LazyImportPage /> : null}
        {currentTab === "knowledge-base" ? <LazyRagPage /> : null}
        {currentTab === "search" ? <LazySearchPage /> : null}
        {currentTab === "graph" ? <LazyGraphPage /> : null}
      </PageContentLoader>
    </div>
  );
}
