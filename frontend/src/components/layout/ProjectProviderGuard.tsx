import { Link, Outlet, useParams } from "react-router-dom";

import { FeedbackStateCard } from "../ui/Feedback";
import { useProjects } from "../../contexts/projects";
import { UI_COPY } from "../../lib/uiCopy";

export function ProjectProviderGuard() {
  const { projectId } = useParams();
  const { projects, loading, error, refresh } = useProjects();

  if (!projectId) return <Outlet />;
  if (loading) {
    return (
      <div className="panel p-6">
        <div className="text-sm text-subtext">加载项目中...</div>
      </div>
    );
  }
  if (error) {
    return (
      <FeedbackStateCard
        tone="danger"
        title="项目加载失败"
        description={error.message}
        meta={
          error.requestId ? (
            <>
              {UI_COPY.common.requestIdLabel}: <span className="font-mono">{error.requestId}</span>
            </>
          ) : null
        }
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => void refresh()} type="button">
              重试
            </button>
            <Link className="btn btn-ghost" to="/" aria-label="返回首页 (project_guard_back_home)">
              {UI_COPY.nav.backToHome}
            </Link>
            {error.requestId ? (
              <button
                className="btn btn-ghost px-2 py-1 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(error.requestId ?? "");
                }}
                type="button"
              >
                {UI_COPY.common.copy}
              </button>
            ) : null}
          </>
        }
      />
    );
  }

  const exists = projects.some((p) => p.id === projectId);
  if (!exists) {
    return (
      <FeedbackStateCard
        kicker="项目状态"
        title="项目不存在或无权限"
        description={`请返回${UI_COPY.nav.home}重新选择项目，或在左侧切换其他项目。`}
        actions={
          <>
            <Link className="btn btn-secondary" to="/" aria-label="返回首页 (project_guard_back_home)">
              {UI_COPY.nav.backToHome}
            </Link>
            <button
              className="btn btn-ghost"
              onClick={() => void refresh()}
              type="button"
            >
              重新加载项目列表
            </button>
          </>
        }
      />
    );
  }

  return <Outlet />;
}
