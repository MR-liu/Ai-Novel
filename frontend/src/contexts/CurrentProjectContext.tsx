import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { createRequestSeqGuard } from "../lib/requestSeqGuard";
import { ApiError, apiJson } from "../services/apiClient";
import type { Project } from "../types";
import { CurrentProjectContext, type CurrentProjectError } from "./currentProject";

export function CurrentProjectProvider(props: { children: React.ReactNode }) {
  const { projectId } = useParams();
  const requestGuardRef = useRef(createRequestSeqGuard());
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(projectId));
  const [error, setError] = useState<CurrentProjectError | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      requestGuardRef.current.invalidate();
      setProject(null);
      setError(null);
      setLoading(false);
      return;
    }

    const seq = requestGuardRef.current.next();
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<{ project: Project }>(`/api/projects/${projectId}`);
      if (!requestGuardRef.current.isLatest(seq)) return;
      setProject(res.data.project);
    } catch (e) {
      if (!requestGuardRef.current.isLatest(seq)) return;
      const err = e instanceof ApiError ? e : null;
      setProject(null);
      setError({
        code: err?.code ?? "UNKNOWN_ERROR",
        message: err?.message ?? "加载项目失败，请稍后重试",
        requestId: err?.requestId ?? "unknown",
        status: err?.status ?? 0,
      });
    } finally {
      if (requestGuardRef.current.isLatest(seq)) {
        setLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ project, loading, error, refresh, setProject }),
    [error, loading, project, refresh],
  );

  return <CurrentProjectContext.Provider value={value}>{props.children}</CurrentProjectContext.Provider>;
}
