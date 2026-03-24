import { Link, Navigate, useParams } from "react-router-dom";

import { AuthorPageIntro, AuthorPageTabs, StudioModeRequiredPanel } from "../components/layout/AuthorPageScaffold";
import { StudioWorkbenchPanel } from "../components/layout/StudioWorkbenchPanel";
import { useAppMode } from "../contexts/AppModeContext";
import { buildProjectWritePath, buildStudioAiPath, type StudioAiTab } from "../lib/projectRoutes";

import { lazyPage, PageContentLoader } from "./lazyPage";
import { STUDIO_AI_TAB_COPY, STUDIO_AI_TABS } from "./studioWorkbenchModels";

const LazyPromptStudioPage = lazyPage(() => import("./PromptStudioPage"), (mod) => mod.PromptStudioPage);
const LazyPromptTemplatesPage = lazyPage(() => import("./PromptTemplatesPage"), (mod) => mod.PromptTemplatesPage);
const LazyPromptsPage = lazyPage(() => import("./PromptsPage"), (mod) => mod.PromptsPage);
const LazyStylesPage = lazyPage(() => import("./StylesPage"), (mod) => mod.StylesPage);

export function StudioAiPage() {
  const { mode } = useAppMode();
  const { projectId, tab } = useParams();
  const currentTab = (tab ?? "models") as StudioAiTab;

  if (!projectId) return null;
  if (!STUDIO_AI_TABS.includes(currentTab)) {
    return <Navigate replace to={buildStudioAiPath(projectId)} />;
  }

  const currentCopy = STUDIO_AI_TAB_COPY[currentTab];
  const tabItems = STUDIO_AI_TABS.map((studioTab) => ({
    key: studioTab,
    label: STUDIO_AI_TAB_COPY[studioTab].title,
    to: buildStudioAiPath(projectId, studioTab),
  }));

  if (mode !== "studio") {
    return (
      <div className="grid gap-4">
        <AuthorPageIntro
          variant="compact"
          title="AI 工作室"
          subtitle="这里承接模型、提示词和风格配置，默认只在工作室模式开放。"
          whenToUse="需要调整模型、提示词策略、模板和风格时。"
          outcome="你会得到更深的 AI 控制力，而不会打断专注写作路径。"
          risk="这里有明显的技术词与更多配置项，第一次使用时更适合在工作室模式进入。"
        />
        <StudioModeRequiredPanel />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pb-24">
      <AuthorPageIntro
        variant="compact"
        title="AI 工作室"
        subtitle="把模型、提示词、模板和风格配置重组为任务导向的 AI 配置区。"
        whenToUse="想控制生成风格、模型表现或排查提示词策略时。"
        outcome="你会得到更清晰的 AI 配置入口，而不是分散在多个技术页里。"
        risk="这里偏高级配置；修改后可能影响后续生成结果，需要边改边验证。"
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
            {currentTab !== "templates" ? (
              <Link className="btn btn-secondary" to={buildStudioAiPath(projectId, "templates")}>
                去模板库沉淀稳态方案
              </Link>
            ) : null}
            {currentTab !== "prompt-studio" ? (
              <Link className="btn btn-secondary" to={buildStudioAiPath(projectId, "prompt-studio")}>
                去蓝图编排台细调片段
              </Link>
            ) : null}
            <Link className="btn btn-secondary" to={buildProjectWritePath(projectId)}>
              回写作页验证实际效果
            </Link>
          </>
        }
      />
      <PageContentLoader>
        {currentTab === "models" ? <LazyPromptsPage /> : null}
        {currentTab === "prompts" ? <LazyPromptsPage /> : null}
        {currentTab === "prompt-studio" ? <LazyPromptStudioPage /> : null}
        {currentTab === "templates" ? <LazyPromptTemplatesPage /> : null}
        {currentTab === "styles" ? <LazyStylesPage /> : null}
      </PageContentLoader>
    </div>
  );
}
