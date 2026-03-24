import { Link, Navigate, useParams } from "react-router-dom";

import { AuthorPageIntro, AuthorPageTabs } from "../components/layout/AuthorPageScaffold";
import { useProjects } from "../contexts/projects";
import { useWizardProgress } from "../hooks/useWizardProgress";
import {
  buildProjectHomePath,
  buildProjectReviewPath,
  buildProjectWritePath,
  type ProjectHomeTab,
} from "../lib/projectRoutes";

import {
  getProjectHomeQuickLinks,
  PROJECT_HOME_TAB_COPY,
  PROJECT_HOME_TABS,
} from "./authorWorkbenchModels";
import { lazyPage, PageContentLoader } from "./lazyPage";

const LazyProjectWizardPage = lazyPage(() => import("./ProjectWizardPage"), (mod) => mod.ProjectWizardPage);
const LazySettingsPage = lazyPage(() => import("./SettingsPage"), (mod) => mod.SettingsPage);

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "暂无更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function ProjectHomeOverview(props: { projectId: string }) {
  const { projects } = useProjects();
  const { loading, progress } = useWizardProgress(props.projectId);
  const project = projects.find((item) => item.id === props.projectId) ?? null;
  const nextHref = progress.nextStep?.href ?? buildProjectWritePath(props.projectId);
  const nextLabel = progress.nextStep ? `下一步：${progress.nextStep.title}` : "进入写作";
  const quickLinks = getProjectHomeQuickLinks(props.projectId);
  const updatedLabel = formatDateLabel(project?.updated_at);
  const nextStepTitle = progress.nextStep?.title ?? "主线已跑通";
  const completedSteps = progress.steps.filter((step) => step.state === "done").length;

  return (
    <div className="author-workbench-shell">
      <section className="author-workbench-hero">
        <div className="author-workbench-grid xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div className="min-w-0">
            <div className="author-workbench-kicker">项目桌面</div>
            <div className="author-workbench-title">{project?.name ?? "未命名项目"}</div>
            <div className="author-workbench-copy">
              {project?.logline?.trim() || "还没有一句话简介。先把故事往前推也没关系，等主线更清楚后再回来补。"}
            </div>
            <div className="author-workbench-chip-row">
              <span className="manuscript-chip">题材：{project?.genre?.trim() || "未填写"}</span>
              <span className="manuscript-chip">最近更新：{updatedLabel}</span>
              <span className="manuscript-chip">{progress.nextStep ? `下一步：${progress.nextStep.title}` : "主线已跑通"}</span>
            </div>
          </div>

          <div className="author-workbench-metric-grid">
            <div className="author-workbench-metric-card is-emphasis">
              <div className="author-workbench-metric-label">完成度</div>
              <div className="author-workbench-metric-value">{loading ? "..." : `${progress.percent}%`}</div>
              <div className="author-workbench-metric-copy">看项目整体离“能稳定写下去”还有多远。</div>
            </div>
            <div className="author-workbench-metric-card">
              <div className="author-workbench-metric-label">定稿章节</div>
              <div className="author-workbench-metric-value">
                {loading ? "..." : `${progress.writing.doneChapters}/${progress.writing.totalChapters}`}
              </div>
              <div className="author-workbench-metric-copy">已经完成并进入可校对状态的章节数量。</div>
            </div>
            <div className="author-workbench-metric-card">
              <div className="author-workbench-metric-label">准备阶段</div>
              <div className="author-workbench-metric-value">{completedSteps}/{progress.steps.length}</div>
              <div className="author-workbench-metric-copy">从模型、设定到导出的主链路当前完成了多少步。</div>
            </div>
          </div>
        </div>
      </section>

      <div className="author-workbench-grid xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <section className="author-workbench-panel is-emphasis">
          <div className="author-workbench-kicker">下一次写作建议</div>
          <div className="author-workbench-title">{nextStepTitle}</div>
          <div className="author-workbench-copy">
            {progress.nextStep ? progress.nextStep.description : "主线闭环已跑通，可以直接继续写作、校对或发布。"}
          </div>
          <div className="author-workbench-actions">
            <Link className="btn btn-primary" to={nextHref}>
              {nextLabel}
            </Link>
            <Link className="btn btn-secondary" to={buildProjectWritePath(props.projectId)}>
              打开写作台
            </Link>
            <Link className="btn btn-secondary" to={buildProjectReviewPath(props.projectId)}>
              进入校对
            </Link>
          </div>
          <div className="author-workbench-stage-list">
            {progress.steps.map((step) => {
              const isNext = progress.nextStep?.key === step.key;
              const stepClass =
                step.state === "done"
                  ? "is-done"
                  : step.state === "skipped"
                    ? "is-skipped"
                    : isNext
                      ? "is-next"
                      : "";
              return (
                <span key={step.key} className={`author-workbench-stage ${stepClass}`}>
                  <span className="author-workbench-stage-name">{step.title}</span>
                  <span className="author-workbench-stage-state">
                    {step.state === "done" ? "已完成" : step.state === "skipped" ? "已跳过" : isNext ? "下一步" : "待处理"}
                  </span>
                </span>
              );
            })}
          </div>
        </section>

        <aside className="author-workbench-stack">
          <div className="author-workbench-panel">
            <div className="workbench-rail-section">
              <div className="author-workbench-kicker">项目基础状态</div>
              <div className="author-workbench-copy mt-0">
                这是进入项目后最值得先看的一组信息，用来判断今天是补设定、回正文，还是先去校对。
              </div>
              <div className="author-workbench-list">
                <div className="author-workbench-list-item">
                  <span>项目简介</span>
                  <strong>{project?.logline?.trim() || "尚未填写"}</strong>
                </div>
                <div className="author-workbench-list-item">
                  <span>题材标签</span>
                  <strong>{project?.genre?.trim() || "尚未填写"}</strong>
                </div>
                <div className="author-workbench-list-item">
                  <span>最近更新</span>
                  <strong>{updatedLabel}</strong>
                </div>
              </div>
            </div>
            <div className="workbench-rail-divider" />
            <div className="workbench-rail-section">
              <div className="author-workbench-kicker">这页只负责三件事</div>
              <div className="author-workbench-bullet-list mt-0">
                <div>看项目进度和最近状态。</div>
                <div>决定下一步先做什么。</div>
                <div>快速进入开工准备、设置和正文主链路。</div>
              </div>
            </div>
          </div>

          <div className="author-workbench-panel">
            <div className="author-workbench-kicker">常用入口</div>
            <div className="author-workbench-link-list">
              {quickLinks.map((item) => (
                <Link key={item.key} className="author-workbench-link" to={item.to}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}

export function ProjectHomePage() {
  const { projectId, tab } = useParams();
  const currentTab = (tab ?? "overview") as ProjectHomeTab;
  const tabCopy = PROJECT_HOME_TAB_COPY[currentTab];

  if (!projectId) return null;
  if (!PROJECT_HOME_TABS.includes(currentTab)) {
    return <Navigate replace to={buildProjectHomePath(projectId)} />;
  }

  return (
    <div className="grid gap-4 pb-24">
      <AuthorPageIntro
        title="项目主页"
        subtitle="把项目进度、下一步和项目设置收在一个作者能快速判断的位置。"
        whenToUse="刚进入项目，想先知道现在卡在哪、下一步该做什么。"
        outcome="你会看到当前进度、下一步 CTA，以及最常用的项目设置入口。"
        risk="这里只做导航与状态汇总；深度配置、检索和底层任务仍在工作室模式。"
        variant="compact"
      />
      <AuthorPageTabs
        current={currentTab}
        tabs={[
          { key: "overview", label: "概览", to: buildProjectHomePath(projectId, "overview") },
          { key: "setup", label: "开工准备", to: buildProjectHomePath(projectId, "setup") },
          { key: "settings", label: "项目设置", to: buildProjectHomePath(projectId, "settings") },
        ]}
      />
      {currentTab !== "overview" ? (
        <section className="review-track-panel">
          <div className="editorial-kicker">当前主页轨道</div>
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
        {currentTab === "overview" ? <ProjectHomeOverview projectId={projectId} /> : null}
        {currentTab === "setup" ? <LazyProjectWizardPage /> : null}
        {currentTab === "settings" ? <LazySettingsPage /> : null}
      </PageContentLoader>
    </div>
  );
}
