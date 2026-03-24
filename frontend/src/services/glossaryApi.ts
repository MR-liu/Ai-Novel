import { apiJson } from "./apiClient";

export type GlossarySource = {
  source_type: string;
  source_id: string;
  label?: string | null;
};

export type GlossaryTerm = {
  id: string;
  project_id: string;
  term: string;
  aliases: string[];
  sources: GlossarySource[];
  origin: string;
  enabled: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type GlossaryExportAllV1 = {
  schema_version: string;
  terms: Array<{
    term: string;
    aliases: string[];
    origin: string;
    enabled: number;
    sources: GlossarySource[];
  }>;
};

export type GlossaryRebuildResult = {
  ok: boolean;
  created: number;
  updated: number;
  terms: number;
};

export async function listGlossaryTerms(args: {
  projectId: string;
  q?: string;
  includeDisabled?: boolean;
  limit?: number;
}): Promise<GlossaryTerm[]> {
  const qs = new URLSearchParams();
  if (args.q?.trim()) qs.set("q", args.q.trim());
  if (args.includeDisabled) qs.set("include_disabled", "1");
  if (typeof args.limit === "number") qs.set("limit", String(args.limit));

  const res = await apiJson<{ terms: GlossaryTerm[] }>(
    `/api/projects/${args.projectId}/glossary_terms${qs.toString() ? `?${qs.toString()}` : ""}`,
  );
  return res.data.terms ?? [];
}

export async function exportAllGlossaryTerms(projectId: string): Promise<GlossaryExportAllV1> {
  const res = await apiJson<{ export: GlossaryExportAllV1 }>(`/api/projects/${projectId}/glossary_terms/export_all`);
  return res.data.export;
}

export async function createGlossaryTerm(
  projectId: string,
  body: { term: string; aliases: string[]; enabled: number },
): Promise<GlossaryTerm> {
  const res = await apiJson<{ term: GlossaryTerm }>(`/api/projects/${projectId}/glossary_terms`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data.term;
}

export async function updateGlossaryTerm(
  projectId: string,
  termId: string,
  body: { term?: string; aliases?: string[]; enabled?: number },
): Promise<GlossaryTerm> {
  const res = await apiJson<{ term: GlossaryTerm }>(`/api/projects/${projectId}/glossary_terms/${termId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return res.data.term;
}

export async function deleteGlossaryTerm(projectId: string, termId: string): Promise<void> {
  await apiJson(`/api/projects/${projectId}/glossary_terms/${termId}`, {
    method: "DELETE",
  });
}

export async function rebuildGlossaryTerms(
  projectId: string,
  body: {
    include_chapters: boolean;
    include_imports: boolean;
    max_terms_per_source: number;
  },
): Promise<GlossaryRebuildResult> {
  const res = await apiJson<GlossaryRebuildResult>(`/api/projects/${projectId}/glossary_terms/rebuild`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data;
}
