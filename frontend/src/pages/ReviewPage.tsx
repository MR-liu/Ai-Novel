import { Link, Navigate, useParams } from "react-router-dom";

import { AuthorPageIntro, AuthorPageTabs } from "../components/layout/AuthorPageScaffold";
import { buildProjectReviewPath, type ReviewTab } from "../lib/projectRoutes";

import { ChapterAnalysisPage } from "./ChapterAnalysisPage";
import { ChapterReaderPage } from "./ChapterReaderPage";
import { ForeshadowsPage } from "./ForeshadowsPage";
import { PreviewPage } from "./PreviewPage";
import { getReviewTrackSummary, REVIEW_TAB_COPY, REVIEW_TABS } from "./reviewModels";

export function ReviewPage() {
  const { projectId, tab } = useParams();
  const currentTab = (tab ?? "preview") as ReviewTab;
  const trackSummary = getReviewTrackSummary(currentTab);

  if (!projectId) return null;
  if (!REVIEW_TABS.includes(currentTab)) {
    return <Navigate replace to={buildProjectReviewPath(projectId)} />;
  }

  return (
    <div className="grid gap-4 pb-24">
      <AuthorPageIntro
        title="校对"
        subtitle="把通读、细读、连续性和伏笔检查放进同一条作者审稿链路。"
        whenToUse="写完章节后，准备通读、挑错、核对连续性或检查伏笔闭环。"
        outcome="你会得到从阅读体验到连续性检查的一组集中入口。"
        risk="这里偏审稿与核对，不适合做底层配置；更深的检索与任务信息在工作室模式。"
        variant="compact"
      />
      <AuthorPageTabs
        current={currentTab}
        tabs={[
          { key: "preview", label: "通读", to: buildProjectReviewPath(projectId, "preview") },
          { key: "reader", label: "细读", to: buildProjectReviewPath(projectId, "reader") },
          { key: "analysis", label: "连续性", to: buildProjectReviewPath(projectId, "analysis") },
          { key: "foreshadows", label: "伏笔", to: buildProjectReviewPath(projectId, "foreshadows") },
        ]}
      />
      <section className="review-track-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="editorial-kicker">当前审稿轨道</div>
            <div className="mt-3 font-content text-2xl text-ink">{REVIEW_TAB_COPY[currentTab].title}</div>
            <div className="mt-2 max-w-3xl text-sm leading-7 text-subtext">{REVIEW_TAB_COPY[currentTab].text}</div>
          </div>
          <div className="review-stage-row">
            {REVIEW_TABS.map((reviewTab, index) => (
              <Link
                key={reviewTab}
                to={buildProjectReviewPath(projectId, reviewTab)}
                className={`review-stage-pill ${reviewTab === currentTab ? "is-active" : ""}`}
              >
                <span className="review-stage-index">0{index + 1}</span>
                <span>{REVIEW_TAB_COPY[reviewTab].title}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="review-track-grid">
          <div className="review-track-card is-emphasis">
            <div className="review-track-label">{trackSummary.focusLabel}</div>
            <div className="review-track-value">{trackSummary.focusValue}</div>
            <div className="review-track-copy">{trackSummary.focusCopy}</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">{trackSummary.nextLabel}</div>
            <div className="review-track-value">{trackSummary.nextValue}</div>
            <div className="review-track-copy">{trackSummary.nextCopy}</div>
          </div>
          <div className="review-track-card">
            <div className="review-track-label">{trackSummary.riskLabel}</div>
            <div className="review-track-value">{trackSummary.riskValue}</div>
            <div className="review-track-copy">{trackSummary.riskCopy}</div>
          </div>
        </div>
      </section>
      {currentTab === "preview" ? <PreviewPage /> : null}
      {currentTab === "reader" ? <ChapterReaderPage /> : null}
      {currentTab === "analysis" ? <ChapterAnalysisPage /> : null}
      {currentTab === "foreshadows" ? <ForeshadowsPage /> : null}
    </div>
  );
}
