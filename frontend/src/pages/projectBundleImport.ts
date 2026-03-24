export type ParsedProjectBundle =
  | {
      ok: true;
      bundle: Record<string, unknown>;
      projectName: string;
    }
  | {
      ok: false;
      error: string;
    };

export function parseProjectBundleText(raw: string): ParsedProjectBundle {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { ok: false, error: "Bundle 文件为空" };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "Bundle 不是合法 JSON" };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Bundle 顶层必须是对象" };
  }

  const bundle = value as Record<string, unknown>;
  if (String(bundle.schema_version ?? "").trim() !== "project_bundle_v1") {
    return { ok: false, error: "仅支持 schema_version=project_bundle_v1 的 Bundle" };
  }

  const project = bundle.project;
  const projectObj = project && typeof project === "object" && !Array.isArray(project) ? (project as Record<string, unknown>) : {};
  const projectName = String(projectObj.name ?? "").trim() || "Imported Project";

  return { ok: true, bundle, projectName };
}
