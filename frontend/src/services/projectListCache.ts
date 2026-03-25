import { apiJson } from "./apiClient";
import type { Project } from "../types";

let cachedProjects: Project[] | null = null;
let inflight: Promise<Project[]> | null = null;

export function readProjectListCache(): Project[] | null {
  return cachedProjects;
}

export function invalidateProjectListCache(): void {
  cachedProjects = null;
}

export function upsertProjectListCache(project: Project): void {
  if (!cachedProjects) return;
  const next = [...cachedProjects];
  const index = next.findIndex((item) => item.id === project.id);
  if (index >= 0) next[index] = project;
  else next.unshift(project);
  cachedProjects = next;
}

export async function loadProjectList(opts?: { force?: boolean }): Promise<Project[]> {
  const force = Boolean(opts?.force);
  if (!force && cachedProjects) return cachedProjects;
  if (!force && inflight) return inflight;

  inflight = apiJson<{ projects: Project[] }>("/api/projects", { timeoutMs: 15_000 })
    .then((res) => {
      cachedProjects = res.data.projects ?? [];
      return cachedProjects;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
