import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Check } from "lucide-react";

import { GhostwriterIndicator } from "../components/atelier/GhostwriterIndicator";
import { WizardNextBar } from "../components/atelier/WizardNextBar";
import { ToolContent } from "../components/layout/AppShell";
import { EditorialHero } from "../components/layout/AuthorPageScaffold";
import { FeedbackDisclosure } from "../components/ui/Feedback";
import { useToast } from "../components/ui/toast";
import { useWizardProgress } from "../hooks/useWizardProgress";
import { ApiError, apiDownloadAttachment, apiDownloadMarkdown } from "../services/apiClient";
import { markWizardExported } from "../services/wizard";
import { buildMarkdownExportUrl, getBundleExportPath } from "./exportPageModels";

type ExportForm = {
  include_settings: boolean;
  include_characters: boolean;
  include_outline: boolean;
  chapters: "all" | "done";
};

type AtelierOptionControlProps = {
  type: "checkbox" | "radio";
  checked: boolean;
  disabled?: boolean;
  name?: string;
  onCheckedChange: (next: boolean) => void;
  children: ReactNode;
};

function AtelierOptionControl({ type, checked, disabled, name, onCheckedChange, children }: AtelierOptionControlProps) {
  const isRadio = type === "radio";
  return (
    <label className="group flex items-center gap-2 text-sm text-ink">
      <input
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={(e) => onCheckedChange(e.target.checked)}
        type={type}
      />
      <span
        className={[
          "inline-flex h-4 w-4 items-center justify-center border border-border bg-canvas ui-transition-fast",
          isRadio ? "rounded-full" : "rounded",
          "group-hover:border-accent/35",
          "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas",
          "peer-checked:border-accent/50 peer-checked:bg-accent/10",
          "peer-disabled:opacity-60 peer-disabled:cursor-not-allowed",
        ].join(" ")}
      >
        {isRadio ? (
          <span className="h-2 w-2 rounded-full bg-accent opacity-0 peer-checked:opacity-100" aria-hidden="true" />
        ) : (
          <Check className="h-3 w-3 text-accent opacity-0 peer-checked:opacity-100" aria-hidden="true" />
        )}
      </span>
      <span className="select-none">{children}</span>
    </label>
  );
}

export function ExportPage() {
  const { projectId } = useParams();
  const toast = useToast();
  const wizard = useWizardProgress(projectId);
  const bumpWizardLocal = wizard.bumpLocal;

  const [markdownExporting, setMarkdownExporting] = useState(false);
  const [bundleExporting, setBundleExporting] = useState(false);
  const [form, setForm] = useState<ExportForm>({
    include_settings: true,
    include_characters: true,
    include_outline: true,
    chapters: "all",
  });
  const markdownIncludedCount = useMemo(
    () => [form.include_settings, form.include_characters, form.include_outline].filter(Boolean).length,
    [form.include_characters, form.include_outline, form.include_settings],
  );
  const chapterRangeLabel = form.chapters === "done" ? "仅定稿章节" : "全部章节";

  const url = useMemo(() => {
    return buildMarkdownExportUrl(projectId, form);
  }, [form, projectId]);

  const doExport = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    if (!url) return false;
    if (markdownExporting) return false;
    setMarkdownExporting(true);
    try {
      const { filename, content } = await apiDownloadMarkdown(url);
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename || "ainovel.md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.toastSuccess("已开始下载阅读稿 Markdown");
      markWizardExported(projectId);
      bumpWizardLocal();
      return true;
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
      return false;
    } finally {
      setMarkdownExporting(false);
    }
  }, [bumpWizardLocal, markdownExporting, projectId, toast, url]);

  const doBundleExport = useCallback(async () => {
    if (!projectId || bundleExporting) return;
    setBundleExporting(true);
    try {
      const { filename, blob, requestId } = await apiDownloadAttachment(getBundleExportPath(projectId));
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename || "ainovel.bundle.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.toastSuccess("已开始下载项目快照 Bundle", requestId);
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBundleExporting(false);
    }
  }, [bundleExporting, projectId, toast]);

  return (
    <ToolContent className="grid gap-6 pb-24">
      <EditorialHero
        kicker="发布与迁移"
        title="在“阅读稿导出”和“项目快照导出”之间，明确知道自己现在要交付什么。"
        subtitle="Markdown 更适合交稿、校对和外部阅读；Bundle 更适合备份、迁移和在另一处恢复整个项目。两者用途不同，别混用。"
        items={[
          { key: "range", label: "Markdown 范围", value: chapterRangeLabel },
          { key: "included", label: "附带内容", value: `${markdownIncludedCount} 类` },
          { key: "bundle", label: "Bundle 用途", value: "用于迁移和备份，不是阅读稿" },
        ]}
      />

      <section className="manuscript-status-band">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-primary"
            disabled={!projectId || markdownExporting}
            onClick={() => void doExport()}
            type="button"
          >
            {markdownExporting ? "导出中…" : "导出阅读稿 Markdown"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={!projectId || bundleExporting}
            onClick={() => void doBundleExport()}
            type="button"
          >
            {bundleExporting ? "导出中…" : "导出项目快照 Bundle"}
          </button>
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{chapterRangeLabel}</span>
          <span className="manuscript-chip">附带 {markdownIncludedCount} 类说明资料</span>
          <span className="manuscript-chip">Bundle 不包含真实 API Key</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-2">
              <div className="font-content text-xl">导出阅读稿 Markdown</div>
              <div className="text-xs text-subtext">
                适合交给编辑、自己通读，或拿去做下一轮排版。导出的是阅读稿，而不是完整项目快照。
              </div>
            </div>
            <button
              className="btn btn-primary"
              disabled={!projectId || markdownExporting}
              onClick={() => void doExport()}
              type="button"
            >
              {markdownExporting ? "导出中…" : "导出阅读稿"}
            </button>
          </div>

          {markdownExporting ? <GhostwriterIndicator className="mt-4" label="导出中：正在生成并下载阅读稿…" /> : null}

          <div className="mt-5 grid gap-4">
            <div className="grid gap-2">
              <div className="text-xs text-subtext">包含内容</div>
              <AtelierOptionControl
                checked={form.include_settings}
                disabled={markdownExporting}
                name="include_settings"
                onCheckedChange={(next) => setForm((v) => ({ ...v, include_settings: next }))}
                type="checkbox"
              >
                设定
              </AtelierOptionControl>
              <AtelierOptionControl
                checked={form.include_characters}
                disabled={markdownExporting}
                name="include_characters"
                onCheckedChange={(next) => setForm((v) => ({ ...v, include_characters: next }))}
                type="checkbox"
              >
                角色卡
              </AtelierOptionControl>
              <AtelierOptionControl
                checked={form.include_outline}
                disabled={markdownExporting}
                name="include_outline"
                onCheckedChange={(next) => setForm((v) => ({ ...v, include_outline: next }))}
                type="checkbox"
              >
                大纲
              </AtelierOptionControl>
            </div>

            <div className="grid gap-2">
              <div className="text-xs text-subtext">章节范围</div>
              <AtelierOptionControl
                checked={form.chapters === "all"}
                disabled={markdownExporting}
                name="chapters"
                onCheckedChange={(next) => {
                  if (!next) return;
                  setForm((v) => ({ ...v, chapters: "all" }));
                }}
                type="radio"
              >
                全部章节
              </AtelierOptionControl>
              <AtelierOptionControl
                checked={form.chapters === "done"}
                disabled={markdownExporting}
                name="chapters"
                onCheckedChange={(next) => {
                  if (!next) return;
                  setForm((v) => ({ ...v, chapters: "done" }));
                }}
                type="radio"
              >
                仅定稿章节
              </AtelierOptionControl>
              <div className="text-[11px] text-subtext">定稿章节：章节状态为“定稿（done）”。</div>
            </div>

            <FeedbackDisclosure
              className="surface p-3 text-xs text-subtext"
              summaryClassName="px-0 py-0 hover:text-ink"
              bodyClassName="pt-2"
              title="排障信息（请求 URL）"
            >
              <div className="mt-2 break-all">{url || "（请选择项目）"}</div>
            </FeedbackDisclosure>
          </div>
        </section>

        <section className="panel p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-2">
              <div className="font-content text-xl">导出项目快照 Bundle</div>
              <div className="text-xs text-subtext">
                下载完整项目快照，适合迁移或备份。导入后会创建新项目，且不会包含真实 API Key，仅保留
                `has_api_key` / `masked_api_key` 等安全信息。
              </div>
            </div>
            <button
              className="btn btn-primary"
              disabled={!projectId || bundleExporting}
              onClick={() => void doBundleExport()}
              type="button"
            >
              {bundleExporting ? "导出中…" : "导出项目快照"}
            </button>
          </div>

          {bundleExporting ? <GhostwriterIndicator className="mt-4" label="导出中：正在生成并下载项目快照…" /> : null}

          <div className="mt-5 grid gap-3 text-sm text-subtext">
            <div className="rounded-atelier border border-border bg-canvas p-4">
              <div className="text-sm text-ink">通常会带走什么</div>
              <ul className="mt-2 list-disc pl-5">
                <li>项目基础信息、设定、LLM preset</li>
                <li>大纲、章节、角色卡、世界书、Prompt presets</li>
                <li>结构化记忆、剧情记忆、知识库与导入文档</li>
              </ul>
            </div>
            <div className="rounded-atelier border border-border bg-canvas p-4">
              <div className="text-sm text-ink">使用前要知道</div>
              <div className="mt-2 text-xs text-subtext">
                导出的 Bundle 可用于创建新项目，但敏感密钥不会被明文导出。若导入后需要继续使用向量或模型能力，请在对应页面重新确认配置。
              </div>
            </div>
          </div>
        </section>
      </div>

      <WizardNextBar
        projectId={projectId}
        currentStep="export"
        progress={wizard.progress}
        loading={wizard.loading}
        primaryAction={
          wizard.progress.nextStep?.key === "export"
            ? { label: "本页：导出阅读稿", disabled: markdownExporting, onClick: doExport }
            : undefined
        }
      />
    </ToolContent>
  );
}
