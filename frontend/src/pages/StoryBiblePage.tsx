import { Link, Navigate, useParams } from "react-router-dom";

import { StudioModeRequiredPanel, AuthorPageIntro, AuthorPageTabs } from "../components/layout/AuthorPageScaffold";
import { useAppMode } from "../contexts/AppModeContext";
import { useProjects } from "../contexts/projects";
import { useWizardProgress } from "../hooks/useWizardProgress";
import { buildStoryBiblePath, type StoryBibleTab } from "../lib/projectRoutes";

import {
  getStoryBibleContinuityLinks,
  getStoryBibleOverviewCards,
  STORY_BIBLE_TAB_COPY,
  STORY_BIBLE_TABS,
} from "./authorWorkbenchModels";
import { lazyPage, PageContentLoader } from "./lazyPage";

const LazyCharactersPage = lazyPage(() => import("./CharactersPage"), (mod) => mod.CharactersPage);
const LazyGlossaryPage = lazyPage(() => import("./GlossaryPage"), (mod) => mod.GlossaryPage);
const LazyNumericTablesPage = lazyPage(() => import("./NumericTablesPage"), (mod) => mod.NumericTablesPage);
const LazyWorldBookPage = lazyPage(() => import("./WorldBookPage"), (mod) => mod.WorldBookPage);

function StoryBibleOverview(props: { projectId: string }) {
  const { projects } = useProjects();
  const { mode } = useAppMode();
  const { progress } = useWizardProgress(props.projectId);
  const project = projects.find((item) => item.id === props.projectId) ?? null;
  const cards = getStoryBibleOverviewCards(props.projectId);
  const mainCards = cards.slice(0, 4);
  const continuityCard = cards.find((item) => item.key === "continuity")!;
  const engineCard = cards.find((item) => item.key === "engine")!;

  return (
    <div className="author-workbench-shell">
      <section className="author-workbench-hero">
        <div className="author-workbench-grid xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div className="min-w-0">
            <div className="author-workbench-kicker">资料总卷宗</div>
            <div className="author-workbench-title">{project?.name ?? "当前项目"} 的故事资料</div>
            <div className="author-workbench-copy">
              先按作者语义找资料，再决定要不要进入工作室模式的更深工具。这样你不会一上来就被技术页和系统页打断。
            </div>
            <div className="author-workbench-chip-row">
              <span className="manuscript-chip">主资料区：4 个入口</span>
              <span className="manuscript-chip">连续性：2 条主轨道</span>
              <span className="manuscript-chip">
                {progress.nextStep ? `准备阶段下一步：${progress.nextStep.title}` : "准备阶段已基本打通"}
              </span>
            </div>
          </div>

          <div className="author-workbench-metric-grid">
            <div className="author-workbench-metric-card is-emphasis">
              <div className="author-workbench-metric-label">主资料区</div>
              <div className="author-workbench-metric-value">4</div>
              <div className="author-workbench-metric-copy">角色、世界、术语和表格资料都集中在这一层作者入口里。</div>
            </div>
            <div className="author-workbench-metric-card">
              <div className="author-workbench-metric-label">连续性轨道</div>
              <div className="author-workbench-metric-value">2</div>
              <div className="author-workbench-metric-copy">连续性检查和伏笔状态会一起承接设定冲突与开环线索。</div>
            </div>
            <div className="author-workbench-metric-card">
              <div className="author-workbench-metric-label">当前模式</div>
              <div className="author-workbench-metric-value">{mode === "studio" ? "工作室" : "专注"}</div>
              <div className="author-workbench-metric-copy">
                {mode === "studio" ? "可以继续进入更深的连续性引擎与底层工具。" : "先用作者入口整理资料，需要更深工具时再切工作室模式。"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="dossier-overview-shell">
        <section className="author-workbench-panel">
          <div className="author-workbench-kicker">主资料区</div>
          <div className="author-workbench-title">先进入真正会被反复翻看的四类资料</div>
          <div className="author-workbench-copy">
            角色、世界、术语和结构化资料保持在同一层入口里。先找到卷宗，再决定是否需要进入连续性或工作室工具。
          </div>
          <div className="dossier-overview-grid">
            {mainCards.map((card) => (
              <Link key={card.key} className="dossier-overview-link" to={card.to}>
                <div className="author-workbench-kicker">{card.kicker}</div>
                <div className="dossier-overview-link-title">{card.title}</div>
                <div className="dossier-overview-link-copy">{card.description}</div>
              </Link>
            ))}
          </div>
        </section>

        <aside className="author-workbench-stack">
          <Link className="author-workbench-panel panel-interactive text-left is-emphasis" to={continuityCard.to}>
            <div className="author-workbench-kicker">{continuityCard.kicker}</div>
            <div className="mt-3 font-content text-2xl text-ink">{continuityCard.title}</div>
            <div className="mt-3 text-sm leading-7 text-subtext">{continuityCard.description}</div>
          </Link>

          {mode === "studio" ? (
            <Link className="author-workbench-panel panel-interactive text-left" to={engineCard.to}>
              <div className="author-workbench-kicker">{engineCard.kicker}</div>
              <div className="mt-3 font-content text-2xl text-ink">{engineCard.title}</div>
              <div className="mt-3 text-sm leading-7 text-subtext">{engineCard.description}</div>
            </Link>
          ) : (
            <StudioModeRequiredPanel />
          )}

          <div className="author-workbench-panel">
            <div className="workbench-rail-section">
              <div className="author-workbench-kicker">这页更像资料总卷宗</div>
              <div className="author-workbench-bullet-list mt-0">
                <div>先按作者语义找到资料。</div>
                <div>先判断要补设定、统一称呼，还是排查连续性。</div>
                <div>只有需要更深系统能力时，再切到工作室模式。</div>
              </div>
            </div>
            <div className="workbench-rail-divider" />
            <div className="workbench-rail-section">
              <div className="author-workbench-kicker">什么时候切到工作室</div>
              <div className="author-workbench-bullet-list mt-0">
                <div>需要结构化记忆、系统任务或底层连续性数据时。</div>
                <div>需要查更深的研究链路，而不是只补作者资料时。</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ContinuityOverview(props: { projectId: string }) {
  const { mode } = useAppMode();
  const links = getStoryBibleContinuityLinks(props.projectId);

  return (
    <div className="author-workbench-shell">
      <section className="review-track-panel">
        <div className="editorial-kicker">连续性轨道</div>
        <div className="mt-3 font-content text-2xl text-ink">把设定冲突、人物状态错位和伏笔闭环放到同一条检查链路里。</div>
        <div className="mt-2 max-w-3xl text-sm leading-7 text-subtext">
          先决定这次是去排查正文里的冲突，还是去追踪尚未回收的线索。真正修稿时，再回到写作页处理正文。
        </div>
      </section>

      <div className="dossier-overview-shell xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
        <section className="author-workbench-panel">
          <div className="author-workbench-kicker">检查路径</div>
          <div className="author-workbench-title">先判断是排查冲突，还是追踪伏笔</div>
          <div className="author-workbench-copy">这两条路径都服务于修稿判断，不直接替代正文修改。定位问题后，仍然回到写作页或校对页处理章节内容。</div>
          <div className="dossier-overview-grid">
            {links.map((item) => (
              <Link key={item.key} className="dossier-overview-link" to={item.to}>
                <div className="author-workbench-kicker">{item.label}</div>
                <div className="dossier-overview-link-title">{item.label}</div>
                <div className="dossier-overview-link-copy">{item.text}</div>
              </Link>
            ))}
          </div>
        </section>

        <aside className="author-workbench-stack">
          {mode === "studio" ? (
            <Link className="author-workbench-panel panel-interactive text-left is-emphasis" to={getStoryBibleOverviewCards(props.projectId).find((item) => item.key === "engine")!.to}>
              <div className="author-workbench-kicker">工作室</div>
              <div className="mt-3 font-content text-2xl text-ink">进入连续性引擎</div>
              <div className="mt-3 text-sm leading-7 text-subtext">在工作室模式里继续查看结构化记忆、关系推演与更底层的连续性数据。</div>
            </Link>
          ) : (
            <StudioModeRequiredPanel />
          )}

          <div className="author-workbench-panel">
            <div className="workbench-rail-section">
              <div className="author-workbench-kicker">修稿提醒</div>
              <div className="author-workbench-bullet-list mt-0">
                <div>先找出哪一章开始发生偏移，再决定是否整体返工。</div>
                <div>连续性工具负责定位，正文修订仍回写作与校对链路完成。</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function StoryBiblePage() {
  const { projectId, tab } = useParams();
  const currentTab = (tab ?? "overview") as StoryBibleTab;
  const tabCopy = STORY_BIBLE_TAB_COPY[currentTab];

  if (!projectId) return null;
  if (!STORY_BIBLE_TABS.includes(currentTab)) {
    return <Navigate replace to={buildStoryBiblePath(projectId)} />;
  }

  return (
    <div className="grid gap-4 pb-24">
      <AuthorPageIntro
        title="故事资料"
        subtitle="把角色、世界设定、术语和连续性资料收进同一层作者语义。"
        whenToUse="需要补设定、查资料、统一称呼，或者检查故事前后是否一致。"
        outcome="你会得到一个统一资料入口，不必在多个技术页面之间反复跳转。"
        risk="连续性的更深层底座仍在工作室模式；这里只承接作者最常用的入口与判断。"
        variant="compact"
      />
      <AuthorPageTabs
        current={currentTab}
        tabs={[
          { key: "overview", label: "总览", to: buildStoryBiblePath(projectId, "overview") },
          { key: "characters", label: "角色", to: buildStoryBiblePath(projectId, "characters") },
          { key: "world", label: "世界", to: buildStoryBiblePath(projectId, "world") },
          { key: "glossary", label: "术语", to: buildStoryBiblePath(projectId, "glossary") },
          { key: "continuity", label: "连续性", to: buildStoryBiblePath(projectId, "continuity") },
          { key: "tables", label: "表格", to: buildStoryBiblePath(projectId, "tables") },
        ]}
      />
      {currentTab !== "overview" && currentTab !== "continuity" ? (
        <section className="review-track-panel">
          <div className="editorial-kicker">当前资料轨道</div>
          <div className="mt-3 font-content text-2xl text-ink">{tabCopy.title}</div>
          <div className="mt-2 max-w-3xl text-sm leading-7 text-subtext">{tabCopy.text}</div>
          <div className="review-track-grid">
            <div className="review-track-card is-emphasis">
              <div className="review-track-label">{tabCopy.focusLabel}</div>
              <div className="review-track-value">{tabCopy.focusValue}</div>
              <div className="review-track-copy">{tabCopy.focusCopy}</div>
            </div>
            <div className="review-track-card">
              <div className="review-track-label">{tabCopy.nextLabel}</div>
              <div className="review-track-value">{tabCopy.nextValue}</div>
              <div className="review-track-copy">{tabCopy.nextCopy}</div>
            </div>
            <div className="review-track-card">
              <div className="review-track-label">{tabCopy.riskLabel}</div>
              <div className="review-track-value">{tabCopy.riskValue}</div>
              <div className="review-track-copy">{tabCopy.riskCopy}</div>
            </div>
          </div>
        </section>
      ) : null}
      <PageContentLoader>
        {currentTab === "overview" ? <StoryBibleOverview projectId={projectId} /> : null}
        {currentTab === "characters" ? <LazyCharactersPage /> : null}
        {currentTab === "world" ? <LazyWorldBookPage /> : null}
        {currentTab === "glossary" ? <LazyGlossaryPage /> : null}
        {currentTab === "continuity" ? <ContinuityOverview projectId={projectId} /> : null}
        {currentTab === "tables" ? <LazyNumericTablesPage /> : null}
      </PageContentLoader>
    </div>
  );
}
