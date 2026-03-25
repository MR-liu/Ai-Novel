import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useCurrentProject } from "../../contexts/currentProject";
import { buildProjectWritePath } from "../../lib/projectRoutes";
import { UI_COPY } from "../../lib/uiCopy";
import { ApiError } from "../../services/apiClient";
import { loadProjectList, readProjectListCache } from "../../services/projectListCache";
import type { Project } from "../../types";

export function ProjectSwitcher() {
  const { project: currentProject, loading: currentProjectLoading } = useCurrentProject();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const initialProjects = readProjectListCache();
  const [projects, setProjects] = useState<Project[]>(() => initialProjects ?? []);
  const [projectsLoaded, setProjectsLoaded] = useState(() => initialProjects !== null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (projectId) return projectId;
    return "";
  }, [projectId]);

  const selectedProjectName = currentProject?.id === selected ? currentProject.name : currentProject?.name ?? "";

  const ensureProjectsLoaded = useCallback(async (force = false) => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const nextProjects = await loadProjectList({ force });
      setProjects(nextProjects);
      setProjectsLoaded(true);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setProjectsError(err?.message ?? "加载项目失败，请稍后重试");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const buttonLabel = useMemo(() => {
    if (selectedProjectName) return selectedProjectName;
    if (currentProjectLoading) return "加载中…";
    if (projectsLoading && !projectsLoaded) return "加载中…";
    return projectsLoaded && projects.length === 0 ? "暂无项目" : "请选择项目";
  }, [currentProjectLoading, projects.length, projectsLoaded, projectsLoading, selectedProjectName]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || projectsLoaded || projectsLoading) return;
    void ensureProjectsLoaded();
  }, [ensureProjectsLoaded, open, projectsLoaded, projectsLoading]);

  return (
    <div className="flex flex-col gap-2" ref={rootRef}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-subtext">{UI_COPY.nav.currentProject}</div>
        <Link
          className="ui-focus-ring ui-transition-fast rounded-atelier px-2 py-1 text-xs text-accent hover:bg-canvas hover:text-ink"
          to="/"
          aria-label="首页 (project_switcher_home)"
        >
          {UI_COPY.nav.home}
        </Link>
      </div>
      <div className="relative">
        <button
          className="select flex w-full items-center justify-between gap-2"
          type="button"
          aria-label="project_switcher"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={currentProjectLoading}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="min-w-0 truncate">{buttonLabel}</span>
          <span className="shrink-0 text-subtext" aria-hidden>
            ▾
          </span>
        </button>

        {open ? (
          <div
            className="absolute z-50 mt-2 w-full overflow-hidden rounded-atelier border border-border bg-surface shadow-lg"
            role="listbox"
          >
            <div className="p-1">
              <button
                className="ui-focus-ring ui-transition-fast w-full rounded-atelier px-3 py-2 text-left text-sm text-ink hover:bg-canvas"
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(`/`);
                }}
              >
                + 新建项目
              </button>
            </div>
            <div className="h-px bg-border" />
            <div className="max-h-80 overflow-auto p-1">
              {projectsLoading && !projectsLoaded ? (
                <div className="px-3 py-2 text-sm text-subtext">加载项目列表中...</div>
              ) : projectsError ? (
                <div className="grid gap-2 px-3 py-2">
                  <div className="text-sm text-subtext">{projectsError}</div>
                  <button
                    className="ui-focus-ring ui-transition-fast rounded-atelier border border-border px-3 py-2 text-left text-sm text-ink hover:bg-canvas"
                    type="button"
                    onClick={() => void ensureProjectsLoaded(true)}
                  >
                    重试加载项目列表
                  </button>
                </div>
              ) : projects.length === 0 ? (
                <div className="px-3 py-2 text-sm text-subtext">暂无项目</div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    className="ui-focus-ring ui-transition-fast w-full rounded-atelier px-3 py-2 text-left text-sm hover:bg-canvas"
                    type="button"
                    aria-current={p.id === selected}
                    onClick={() => {
                      setOpen(false);
                      navigate(buildProjectWritePath(p.id));
                    }}
                  >
                    <span className={p.id === selected ? "text-ink" : "text-subtext"}>{p.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
