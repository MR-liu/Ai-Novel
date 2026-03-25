import { Link, Outlet, useParams } from "react-router-dom";

import { FeedbackStateCard } from "../ui/Feedback";
import { useCurrentProject } from "../../contexts/currentProject";
import { UI_COPY } from "../../lib/uiCopy";

export function ProjectProviderGuard() {
  const { projectId } = useParams();
  const { project, loading, error, refresh } = useCurrentProject();

  if (!projectId) return <Outlet />;
  if (loading) {
    return (
      <div className="panel p-6">
        <div className="text-sm text-subtext">加载项目中...</div>
      </div>
    );
  }
  if (error) {
    const missingProject = error.status === 403 || error.status === 404;
    return (
      <FeedbackStateCard
        tone="danger"
        kicker={missingProject ? "项目状态" : undefined}
        title={missingProject ? "项目不存在或无权限" : "项目加载失败"}
        description={missingProject ? `请返回${UI_COPY.nav.home}重新选择项目，或稍后重试。` : error.message}
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
              {missingProject ? "重新检查" : "重试"}
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

  if (!project) return null;

  return <Outlet />;
}
