import { Link } from "react-router-dom";
import { useCallback, useState } from "react";

import { GhostwriterIndicator } from "../components/atelier/GhostwriterIndicator";
import { AuthorPageIntro } from "../components/layout/AuthorPageScaffold";
import { FeedbackCallout, FeedbackDisclosure } from "../components/ui/Feedback";
import { useToast } from "../components/ui/toast";
import { buildProjectWritePath } from "../lib/projectRoutes";
import { ApiError, apiJson } from "../services/apiClient";

import { parseProjectBundleText } from "./projectBundleImport";

type BundleImportResult = {
  projectId: string;
  projectName: string;
  created: Record<string, unknown>;
  warnings: string[];
  vectorRebuild: unknown;
};

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export function GlobalProjectImportPage() {
  const toast = useToast();
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [bundleImporting, setBundleImporting] = useState(false);
  const [bundleRebuildVectors, setBundleRebuildVectors] = useState(false);
  const [bundleImportResult, setBundleImportResult] = useState<BundleImportResult | null>(null);

  const importBundle = useCallback(async () => {
    if (!bundleFile || bundleImporting) return;
    const raw = await bundleFile.text();
    const parsed = parseProjectBundleText(raw);
    if (!parsed.ok) {
      toast.toastError(parsed.error, "client");
      return;
    }

    setBundleImporting(true);
    try {
      const res = await apiJson<{
        result: {
          ok: boolean;
          project_id: string;
          report: { created?: Record<string, unknown>; warnings?: string[] };
          vector_rebuild?: unknown;
        };
      }>(`/api/projects/import_bundle`, {
        method: "POST",
        body: JSON.stringify({
          bundle: parsed.bundle,
          rebuild_vectors: bundleRebuildVectors,
        }),
        timeoutMs: 180_000,
      });
      const result = res.data.result;
      setBundleImportResult({
        projectId: result.project_id,
        projectName: parsed.projectName,
        created: result.report?.created ?? {},
        warnings: Array.isArray(result.report?.warnings) ? result.report.warnings : [],
        vectorRebuild: result.vector_rebuild ?? null,
      });
      toast.toastSuccess("项目 Bundle 导入完成，已创建新项目", res.request_id);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBundleImporting(false);
    }
  }, [bundleFile, bundleImporting, bundleRebuildVectors, toast]);

  return (
    <div className="grid gap-4 pb-24">
      <AuthorPageIntro
        title="导入项目"
        subtitle="从 Bundle JSON 创建一个全新的项目快照，适合迁移、备份恢复和跨环境接力。"
        whenToUse="拿到别人导出的项目快照，或把旧环境中的小说工程迁到当前实例。"
        outcome="你会得到一个全新的项目副本，原项目不会被覆盖。"
        risk="真实 API Key 不会被恢复；如勾选向量重建，导入时间会更长。"
      />

      <section className="panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-ink">Bundle JSON</div>
            <div className="mt-2 text-sm text-subtext">
              支持 `project_bundle_v1`。导入后会创建新项目，并仅保留 `has_api_key` / `masked_api_key` 这类安全字段。
            </div>
          </div>
          <Link className="btn btn-secondary" to="/">
            返回首页
          </Link>
        </div>

        <div className="mt-5 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-subtext">选择 `.bundle.json` 文件</span>
            <input
              aria-label="global_project_bundle_file"
              accept=".json,.bundle.json,application/json"
              className="input"
              disabled={bundleImporting}
              onChange={(e) => setBundleFile(e.target.files?.[0] ?? null)}
              type="file"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              className="checkbox"
              checked={bundleRebuildVectors}
              disabled={bundleImporting}
              onChange={(event) => setBundleRebuildVectors(event.target.checked)}
              type="checkbox"
            />
            导入后立即重建向量索引
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary"
              disabled={!bundleFile || bundleImporting}
              onClick={() => void importBundle()}
              type="button"
            >
              {bundleImporting ? "导入中…" : "导入项目 Bundle"}
            </button>
            {bundleImporting ? <GhostwriterIndicator label="正在创建新项目并导入 Bundle…" /> : null}
          </div>
        </div>
      </section>

      {bundleImportResult ? (
        <section className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <div className="text-sm font-medium text-ink">导入成功：{bundleImportResult.projectName}</div>
              <div className="text-xs text-subtext">新项目 ID：{bundleImportResult.projectId}</div>
            </div>
            <Link className="btn btn-primary" to={buildProjectWritePath(bundleImportResult.projectId)}>
              进入新项目写作
            </Link>
          </div>

          <div className="mt-4 rounded-atelier border border-border bg-canvas p-4 text-sm text-subtext">
            <div className="text-xs text-subtext">created</div>
            <div className="mt-2 grid gap-1">
              {Object.entries(bundleImportResult.created).map(([key, value]) => (
                <div key={key}>
                  {key}: {String(value)}
                </div>
              ))}
              {Object.keys(bundleImportResult.created).length === 0 ? <div>（空）</div> : null}
            </div>
          </div>

          {bundleImportResult.warnings.length > 0 ? (
            <FeedbackCallout className="mt-4" tone="warning" title="导入过程包含提醒">
              {bundleImportResult.warnings.join("；")}
            </FeedbackCallout>
          ) : null}

          {bundleImportResult.vectorRebuild ? (
            <FeedbackDisclosure
              className="mt-4 rounded-atelier border border-border bg-canvas px-4 py-3 text-sm text-subtext"
              summaryClassName="text-ink"
              bodyClassName="pt-3"
              title="向量重建结果"
            >
              <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">{safeStringify(bundleImportResult.vectorRebuild)}</pre>
            </FeedbackDisclosure>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
