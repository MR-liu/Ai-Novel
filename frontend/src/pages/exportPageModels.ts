type ExportForm = {
  include_settings: boolean;
  include_characters: boolean;
  include_outline: boolean;
  chapters: "all" | "done";
};

export function buildMarkdownExportUrl(projectId: string | undefined, form: ExportForm): string {
  if (!projectId) return "";
  const qs = new URLSearchParams();
  qs.set("include_settings", form.include_settings ? "1" : "0");
  qs.set("include_characters", form.include_characters ? "1" : "0");
  qs.set("include_outline", form.include_outline ? "1" : "0");
  qs.set("chapters", form.chapters);
  return `/api/projects/${projectId}/export/markdown?${qs.toString()}`;
}

export function getBundleExportPath(projectId: string | undefined): string {
  if (!projectId) return "";
  return `/api/projects/${projectId}/export/bundle`;
}
