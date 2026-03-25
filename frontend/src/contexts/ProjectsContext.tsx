import React, { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "../services/apiClient";
import { loadProjectList, readProjectListCache } from "../services/projectListCache";
import { ProjectsContext } from "./projects";
import type { ProjectsError } from "./projects";
import type { ProjectsState } from "./projects";

export function ProjectsProvider(props: { children: React.ReactNode }) {
  const cachedProjects = readProjectListCache();
  const [projects, setProjects] = useState(() => cachedProjects ?? []);
  const [loading, setLoading] = useState(() => cachedProjects === null);
  const [error, setError] = useState<ProjectsError | null>(null);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const nextProjects = await loadProjectList({ force });
      setProjects(nextProjects);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError({
        code: err?.code ?? "UNKNOWN_ERROR",
        message: err?.message ?? "加载项目失败，请稍后重试",
        requestId: err?.requestId ?? "unknown",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  useEffect(() => {
    if (cachedProjects !== null) return;
    void load(false);
  }, [cachedProjects, load]);

  const value = useMemo<ProjectsState>(
    () => ({ projects, loading, error, refresh }),
    [projects, loading, error, refresh],
  );
  return <ProjectsContext.Provider value={value}>{props.children}</ProjectsContext.Provider>;
}
