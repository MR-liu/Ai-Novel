import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { FeedbackDisclosure } from "../components/ui/Feedback";
import { useConfirm } from "../components/ui/confirm";
import { useToast } from "../components/ui/toast";
import { copyText } from "../lib/copyText";
import { PROMPT_STUDIO_TASKS } from "../lib/promptTaskCatalog";
import { buildProjectWritePath, buildStudioAiPath } from "../lib/projectRoutes";
import { usePersistentOutletIsActive } from "../hooks/usePersistentOutlet";
import { UnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { ApiError, apiJson, sanitizeFilename } from "../services/apiClient";
import type { Character, Outline, Project, ProjectSettings, PromptBlock, PromptPreset, PromptPreview } from "../types";
import { AI_WORKBENCH_COPY } from "./aiWorkbenchModels";
import { PromptStudioPreviewPanel } from "./promptStudio/PromptStudioPreviewPanel";
import type { PromptStudioTask } from "./promptStudio/types";
import { guessPreviewValues } from "./promptStudio/utils";

const PREVIEW_TASKS: PromptStudioTask[] = PROMPT_STUDIO_TASKS;

const SUPPORTED_PREVIEW_TASK_KEYS = new Set(PREVIEW_TASKS.map((t) => t.key));
const TEMPLATE_VAR_TOKEN_RE = /{{\s*([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*}}/g;
const TEMPLATE_MACRO_NAMES = new Set(["date", "time", "isodate"]);
const SAFE_KEY_RE = /^[A-Za-z0-9_]+$/;
const BLOCK_ROLE_LABELS: Record<string, string> = {
  system: "总控说明",
  user: "写作指令",
  assistant: "参考口吻",
  tool: "工具结果",
};

function extractTemplateVars(template: string): string[] {
  const out = new Set<string>();
  for (const match of template.matchAll(TEMPLATE_VAR_TOKEN_RE)) {
    const path = String(match[1] ?? "").trim();
    if (!path || TEMPLATE_MACRO_NAMES.has(path)) continue;
    out.add(path);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "en"));
}

function collectPreviewValuePaths(values: Record<string, unknown>): string[] {
  const out = new Set<string>();

  const visit = (value: unknown, prefix: string, depth: number) => {
    if (!prefix) return;
    if (value === null || value === undefined) {
      out.add(prefix);
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      out.add(prefix);
      return;
    }

    if (depth >= 3) {
      out.add(prefix);
      return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (!key || key.startsWith("_") || !SAFE_KEY_RE.test(key)) continue;
      visit(child, `${prefix}.${key}`, depth + 1);
    }
  };

  for (const [key, value] of Object.entries(values)) {
    if (!key || key.startsWith("_") || !SAFE_KEY_RE.test(key)) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        if (!childKey || childKey.startsWith("_") || !SAFE_KEY_RE.test(childKey)) continue;
        visit(child, `${key}.${childKey}`, 1);
      }
      continue;
    }
    visit(value, key, 0);
  }

  return [...out].sort((a, b) => a.localeCompare(b, "en"));
}

type PromptPresetResource = {
  key: string;
  name: string;
  category?: string | null;
  scope: string;
  version: number;
  activation_tasks: string[];
  preset_id?: string | null;
  preset_version?: number | null;
  preset_updated_at?: string | null;
};

type PresetDetails = {
  preset: PromptPreset;
  blocks: PromptBlock[];
};

type ImportAllReport = {
  dry_run: boolean;
  created: number;
  updated: number;
  skipped: number;
  conflicts: unknown[];
  actions: unknown[];
};

function downloadJsonFile(value: unknown, filename: string) {
  const jsonText = JSON.stringify(value, null, 2);
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(filename) || "prompt_templates.json";
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatImportAllReport(report: ImportAllReport): string {
  const conflicts = Array.isArray(report.conflicts) ? report.conflicts : [];
  const actions = Array.isArray(report.actions) ? report.actions : [];

  const lines = [
    `本次仅预演（dry_run）: ${Boolean(report.dry_run)}`,
    `预计新建（created）: ${Number(report.created) || 0}`,
    `预计更新（updated）: ${Number(report.updated) || 0}`,
    `预计跳过（skipped）: ${Number(report.skipped) || 0}`,
    `冲突项（conflicts）: ${conflicts.length}`,
    "",
    "冲突示例 JSON（conflicts sample）:",
    ...(conflicts.slice(0, 10).map((c) => JSON.stringify(c)) || ["(无)"]),
    "",
    "变更示例 JSON（actions sample）:",
    ...(actions.slice(0, 20).map((a) => JSON.stringify(a)) || ["(无)"]),
    actions.length > 20 ? `...（还有 ${actions.length - 20} 条动作）` : "",
  ].filter((v) => typeof v === "string");

  return lines.join("\n").trim();
}

export function PromptTemplatesPage() {
  const { projectId } = useParams();
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);

  const [resources, setResources] = useState<PromptPresetResource[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [preset, setPreset] = useState<PromptPreset | null>(null);
  const [blocks, setBlocks] = useState<PromptBlock[]>([]);

  const [draftTemplates, setDraftTemplates] = useState<Record<string, string>>({});
  const [baselineTemplates, setBaselineTemplates] = useState<Record<string, string>>({});

  const outletActive = usePersistentOutletIsActive();

  const pageDirty = useMemo(
    () => blocks.some((b) => (draftTemplates[b.id] ?? "") !== (baselineTemplates[b.id] ?? "")),
    [baselineTemplates, blocks, draftTemplates],
  );
  const promptStudioPath = projectId ? buildStudioAiPath(projectId, "prompt-studio") : "";

  const savingBlockIdRef = useRef<string | null>(null);

  const [previewTask, setPreviewTask] = useState<string>("chapter_generate");
  const [preview, setPreview] = useState<PromptPreview | null>(null);
  const [renderLog, setRenderLog] = useState<unknown | null>(null);
  const [previewRequestId, setPreviewRequestId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const selectedResource = useMemo(
    () => resources.find((r) => r.key === selectedKey) ?? null,
    [resources, selectedKey],
  );

  const resourceGroups = useMemo(() => {
    const groups = new Map<string, PromptPresetResource[]>();
    for (const r of resources) {
      const key = String(r.category ?? "").trim() || "（未分类）";
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    const out = Array.from(groups.entries()).map(([category, items]) => {
      items.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
      return [category, items] as const;
    });
    out.sort((a, b) => a[0].localeCompare(b[0], "zh-Hans-CN"));
    return out;
  }, [resources]);

  const loadResources = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      // Ensure baseline presets exist (idempotent) so the resource list can map to preset_id.
      await apiJson<{ presets: PromptPreset[] }>(`/api/projects/${projectId}/prompt_presets`);

      const res = await apiJson<{ resources: PromptPresetResource[] }>(
        `/api/projects/${projectId}/prompt_preset_resources`,
      );
      const nextResources = res.data.resources ?? [];
      setResources(nextResources);

      setSelectedKey((prev) => {
        if (prev && nextResources.some((r) => r.key === prev)) return prev;
        const firstWithPreset = nextResources.find((r) => typeof r.preset_id === "string" && r.preset_id.length > 0);
        return firstWithPreset?.key ?? nextResources[0]?.key ?? null;
      });
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  const selectKeyWithGuard = useCallback(
    async (nextKey: string) => {
      if (nextKey === selectedKey) return;
      if (!pageDirty) {
        setSelectedKey(nextKey);
        return;
      }

      const ok = await confirm.confirm({
        title: "有未保存修改，确定切换模板？",
        description: "切换后未保存内容会丢失。",
        confirmText: "切换",
        cancelText: "取消",
        danger: true,
      });
      if (!ok) return;
      setSelectedKey(nextKey);
    },
    [confirm, pageDirty, selectedKey],
  );

  const loadPreviewContext = useCallback(async () => {
    if (!projectId) return;
    try {
      const [pRes, sRes, oRes, cRes] = await Promise.all([
        apiJson<{ project: Project }>(`/api/projects/${projectId}`),
        apiJson<{ settings: ProjectSettings }>(`/api/projects/${projectId}/settings`),
        apiJson<{ outline: Outline }>(`/api/projects/${projectId}/outline`),
        apiJson<{ characters: Character[] }>(`/api/projects/${projectId}/characters`),
      ]);
      setProject(pRes.data.project);
      setSettings(sRes.data.settings);
      setOutline(oRes.data.outline);
      setCharacters(cRes.data.characters ?? []);
    } catch {
      // optional: preview can still work with fallback values
    }
  }, [projectId]);

  const loadPreset = useCallback(
    async (presetId: string) => {
      setBusy(true);
      try {
        const res = await apiJson<PresetDetails>(`/api/prompt_presets/${presetId}`);
        setPreset(res.data.preset);
        setBlocks(res.data.blocks ?? []);

        const nextDrafts: Record<string, string> = {};
        const nextBaseline: Record<string, string> = {};
        for (const b of res.data.blocks ?? []) {
          const t = b.template ?? "";
          nextDrafts[b.id] = t;
          nextBaseline[b.id] = t;
        }
        setDraftTemplates(nextDrafts);
        setBaselineTemplates(nextBaseline);
      } catch (e) {
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  useEffect(() => {
    void loadPreviewContext();
  }, [loadPreviewContext]);

  useEffect(() => {
    const presetId = selectedResource?.preset_id ?? null;
    if (!presetId) {
      setPreset(null);
      setBlocks([]);
      setDraftTemplates({});
      setBaselineTemplates({});
      return;
    }
    void loadPreset(presetId);
  }, [loadPreset, selectedResource?.preset_id]);

  const previewValues = useMemo(
    () => guessPreviewValues({ project, settings, outline, characters }),
    [characters, outline, project, settings],
  );

  const availableValuePaths = useMemo(() => collectPreviewValuePaths(previewValues), [previewValues]);
  const availableVariablesText = useMemo(
    () => availableValuePaths.map((path) => `{{` + path + `}}`).join("\n"),
    [availableValuePaths],
  );

  const previewTasks = useMemo(() => {
    const activationTasks = selectedResource?.activation_tasks ?? [];
    const allowed = new Set(activationTasks.filter((t) => SUPPORTED_PREVIEW_TASK_KEYS.has(t)));
    if (allowed.size > 0) return PREVIEW_TASKS.filter((t) => allowed.has(t.key));
    return PREVIEW_TASKS;
  }, [selectedResource?.activation_tasks]);

  useEffect(() => {
    if (!previewTasks.length) return;
    if (previewTasks.some((t) => t.key === previewTask)) return;
    setPreviewTask(previewTasks[0].key);
  }, [previewTask, previewTasks]);

  const runPreview = useCallback(async () => {
    if (!projectId || !preset) return;
    setPreviewLoading(true);
    setPreviewRequestId(null);
    try {
      const res = await apiJson<{ preview: PromptPreview; render_log?: unknown }>(
        `/api/projects/${projectId}/prompt_preview`,
        {
          method: "POST",
          body: JSON.stringify({ task: previewTask, preset_id: preset.id, values: previewValues }),
        },
      );
      setPreview(res.data.preview);
      setRenderLog(res.data.render_log ?? null);
      setPreviewRequestId(res.request_id ?? null);
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
      setPreviewRequestId(err.requestId ?? null);
    } finally {
      setPreviewLoading(false);
    }
  }, [preset, previewTask, previewValues, projectId, toast]);

  const templateErrors = useMemo(() => {
    const blocks = (renderLog as { blocks?: unknown } | null)?.blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks
      .map((b) => b as { identifier?: unknown; render_error?: unknown })
      .filter((b) => typeof b.render_error === "string" && b.render_error.trim())
      .map((b) => ({ identifier: String(b.identifier ?? ""), error: String(b.render_error ?? "") }))
      .filter((b) => b.identifier && b.error);
  }, [renderLog]);

  const exportAllPresets = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      const res = await apiJson<{ export: unknown }>(`/api/projects/${projectId}/prompt_presets/export_all`);
      const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      downloadJsonFile(res.data.export, `prompt_presets_all_${stamp}.json`);
      toast.toastSuccess("已导出整套模板备份");
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBusy(false);
    }
  }, [projectId, toast]);

  const importAllPresets = useCallback(
    async (file: File) => {
      if (!projectId) return;
      setBusy(true);
      try {
        const text = await file.text();
        const obj = JSON.parse(text) as Record<string, unknown>;

        const dryRunRes = await apiJson<ImportAllReport>(`/api/projects/${projectId}/prompt_presets/import_all`, {
          method: "POST",
          body: JSON.stringify({ ...obj, dry_run: true }),
        });

        const report = dryRunRes.data;
        const ok = await confirm.confirm({
          title: "导入整套模板备份前先预演（dry_run）",
          description: formatImportAllReport(report),
          confirmText: "应用导入",
          cancelText: "取消",
          danger: Array.isArray(report.conflicts) && report.conflicts.length > 0,
        });
        if (!ok) return;

        const applyRes = await apiJson<ImportAllReport>(`/api/projects/${projectId}/prompt_presets/import_all`, {
          method: "POST",
          body: JSON.stringify({ ...obj, dry_run: false }),
        });

        toast.toastSuccess(
          `整套模板已导入：新建 ${applyRes.data.created} | 更新 ${applyRes.data.updated} | 跳过 ${applyRes.data.skipped}`,
        );
        await loadResources();
      } catch (e) {
        if (e instanceof SyntaxError) {
          toast.toastError("导入失败：文件不是合法 JSON");
          return;
        }
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setBusy(false);
      }
    },
    [confirm, loadResources, projectId, toast],
  );

  const exportSelectedPreset = useCallback(async () => {
    if (!preset) return;
    setBusy(true);
    try {
      const res = await apiJson<{ export: unknown }>(`/api/prompt_presets/${preset.id}/export`);
      downloadJsonFile(res.data.export, `${preset.name || "prompt_preset"}.json`);
      toast.toastSuccess("已导出当前模板");
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBusy(false);
    }
  }, [preset, toast]);

  const resetSelectedPreset = useCallback(async () => {
    if (!preset) return;
    const ok = await confirm.confirm({
      title: "重置为系统默认",
      description: "将该预设的所有模板片段恢复为内置资源版本（不会删除你的其它预设）。",
      confirmText: "重置",
      cancelText: "取消",
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await apiJson<{ preset: PromptPreset; blocks: PromptBlock[] }>(
        `/api/prompt_presets/${preset.id}/reset_to_default`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setPreset(res.data.preset);
      setBlocks(res.data.blocks ?? []);
      const nextDrafts: Record<string, string> = {};
      const nextBaseline: Record<string, string> = {};
      for (const b of res.data.blocks ?? []) {
        const t = b.template ?? "";
        nextDrafts[b.id] = t;
        nextBaseline[b.id] = t;
      }
      setDraftTemplates(nextDrafts);
      setBaselineTemplates(nextBaseline);
      toast.toastSuccess("已重置为系统默认");
      await loadResources();
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBusy(false);
    }
  }, [confirm, loadResources, preset, toast]);

  const saveBlockTemplate = useCallback(
    async (block: PromptBlock) => {
      const nextTemplate = draftTemplates[block.id] ?? "";
      if (savingBlockIdRef.current) return;
      savingBlockIdRef.current = block.id;
      setBusy(true);
      try {
        const res = await apiJson<{ block: PromptBlock }>(`/api/prompt_blocks/${block.id}`, {
          method: "PUT",
          body: JSON.stringify({ template: nextTemplate }),
        });
        const updated = res.data.block;
        setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        const stableTemplate = updated.template ?? "";
        setDraftTemplates((prev) => ({ ...prev, [updated.id]: stableTemplate }));
        setBaselineTemplates((prev) => ({ ...prev, [updated.id]: stableTemplate }));
        toast.toastSuccess("已保存");
      } catch (e) {
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        savingBlockIdRef.current = null;
        setBusy(false);
      }
    },
    [draftTemplates, toast],
  );

  const resetBlockTemplate = useCallback(
    async (block: PromptBlock) => {
      const ok = await confirm.confirm({
        title: "重置该片段",
        description: "将该模板片段恢复为系统默认版本。",
        confirmText: "重置",
        cancelText: "取消",
        danger: true,
      });
      if (!ok) return;

      setBusy(true);
      try {
        const res = await apiJson<{ block: PromptBlock }>(`/api/prompt_blocks/${block.id}/reset_to_default`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        const updated = res.data.block;
        setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        const stableTemplate = updated.template ?? "";
        setDraftTemplates((prev) => ({ ...prev, [updated.id]: stableTemplate }));
        setBaselineTemplates((prev) => ({ ...prev, [updated.id]: stableTemplate }));
        toast.toastSuccess("已重置");
      } catch (e) {
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setBusy(false);
      }
    },
    [confirm, toast],
  );

  const dirtyBlockCount = useMemo(
    () => blocks.reduce((count, block) => count + ((draftTemplates[block.id] ?? "") !== (baselineTemplates[block.id] ?? "") ? 1 : 0), 0),
    [baselineTemplates, blocks, draftTemplates],
  );
  const taskLabelByKey = useMemo(() => new Map(PROMPT_STUDIO_TASKS.map((task) => [task.key, task.label])), []);
  const selectedTemplateName = selectedResource?.name ?? "尚未选择模板";
  const selectedTaskLabel = selectedResource?.activation_tasks?.length
    ? selectedResource.activation_tasks.map((taskKey) => taskLabelByKey.get(taskKey) ?? taskKey).join(" / ")
    : "尚未绑定任务";
  const previewStatusLabel = preview ? "已有最近预览结果" : "还没有预览结果";
  const nextStepText = !selectedResource
    ? "先从左侧挑一个任务模板，再决定要改哪一段常用提示。"
    : !selectedResource.preset_id
      ? "这份模板还没在当前项目里初始化，先刷新资源或进入提示词工作室准备项目内版本。"
      : pageDirty
        ? "当前有未保存修改，建议先保存一处模板，再跑右侧预览确认语气和结构。"
        : "先改最影响结果的一段模板，再跑预览；不要一口气同时改很多段。";

  return (
    <div className="studio-shell">
      {pageDirty && outletActive ? <UnsavedChangesGuard when={pageDirty} /> : null}

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">模板库</div>
            <div className="studio-cluster-copy">
              这里适合做轻量、稳定的模板微调。先从一套现成模板开始改，再决定是否需要进入更细粒度的提示词编排台。
            </div>
          </div>
          <div className="studio-cluster-meta">
            {loading || busy ? "处理中…" : pageDirty ? "有未保存修改" : "可安全试改"}
          </div>
        </div>

        <div className="manuscript-status-list mt-4">
          <span className="manuscript-chip max-w-[260px] truncate" title={selectedTemplateName}>
            当前模板：{selectedTemplateName}
          </span>
          <span className="manuscript-chip">适用任务：{selectedTaskLabel}</span>
          <span className="manuscript-chip">未保存片段：{dirtyBlockCount}</span>
          <span className="manuscript-chip">{previewStatusLabel}</span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm text-ink">什么时候优先用模板库</div>
              {pageDirty ? (
                <span className="rounded-atelier border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent">
                  未保存
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              当你只是想改某个任务的默认开场、结构提示或常用约束，而不想面对完整 Prompt 片段系统时，从这里开始更轻松。
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-secondary" onClick={() => void exportAllPresets()} disabled={busy} type="button">
                导出整套模板备份
              </button>
              <label className={clsx("btn btn-secondary", busy ? "opacity-60" : "cursor-pointer")}>
                导入整套模板备份
                <input
                  className="hidden"
                  type="file"
                  accept="application/json"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (!file) return;
                    void importAllPresets(file);
                  }}
                />
              </label>
            </div>
            <div className="mt-2 text-[11px] text-subtext">整套文件更适合做项目级备份或跨项目迁移；导入前会先做一次预演，确认冲突和变更量。</div>
          </div>

          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="text-sm text-ink">如果此刻要换轨</div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              如果你要控制更细的提示片段顺序、按任务注入或做真实预览，建议进入蓝图编排台；如果你发现问题其实出在项目级策略，就回到提示词方案页；如果只想看成品效果，就直接回写作页。
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {projectId ? (
                <Link className="btn btn-secondary" to={buildStudioAiPath(projectId, "prompts")}>
                  回提示词方案页
                </Link>
              ) : null}
              {projectId ? (
                <Link className="btn btn-secondary" to={promptStudioPath}>
                  去蓝图编排台
                </Link>
              ) : null}
              {projectId ? (
                <Link className="btn btn-secondary" to={buildProjectWritePath(projectId)}>
                  回写作页验证效果
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="surface p-3">
            <div className="text-xs text-subtext">模板库</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合改稳定默认文案</div>
            <div className="mt-1 text-xs leading-5 text-subtext">这页更适合处理“长期默认怎么写”，比如开场、结构、常用约束和固定口吻。</div>
          </div>
          <div className="surface p-3">
            <div className="text-xs text-subtext">蓝图编排台</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合改片段顺序与注入条件</div>
            <div className="mt-1 text-xs leading-5 text-subtext">如果你已经开始关心多任务复用、角色通道或片段顺序，就说明问题粒度已经超过模板库。</div>
          </div>
          <div className="surface p-3">
            <div className="text-xs text-subtext">写作页</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合做最后的实战判断</div>
            <div className="mt-1 text-xs leading-5 text-subtext">模板预览只是排除明显问题，真正是否好用，还是要回到章节起草里看输出是否顺手。</div>
          </div>
        </div>
      </section>

      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">{nextStepText}</div>
          <div className="text-xs text-subtext">
            模板库更适合做轻量、稳定的默认文案调整；如果你开始想控制片段顺序、任务注入或更细的蓝图关系，就该切到蓝图编排台。
          </div>
        </div>
        <div className="manuscript-status-list">
          <span className="manuscript-chip max-w-[260px] truncate" title={selectedTemplateName}>
            当前模板：{selectedTemplateName}
          </span>
          <span className="manuscript-chip">适用任务：{selectedTaskLabel}</span>
          <span className="manuscript-chip">未保存片段：{dirtyBlockCount}</span>
          <span className="manuscript-chip">{previewStatusLabel}</span>
        </div>
      </section>

      <ResearchWorkbenchPanel eyebrow="当前 AI 路径" {...AI_WORKBENCH_COPY.templates} />

      <section className="studio-cluster">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">模板选择、改写与预览</div>
            <div className="studio-cluster-copy">
              建议顺序是“先挑模板，再改片段，最后跑预览”。这样更容易判断哪一处模板真正影响了生成结果。
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px,1fr]">
          <div className="panel p-3">
            <div className="text-sm font-semibold text-ink">模板目录</div>
            <div className="mt-1 text-xs text-subtext">按写作任务和分类分组，点击后在右侧编辑当前模板内容。</div>
            <div className="mt-3 grid gap-3">
              {resourceGroups.map(([category, items]) => (
                <div key={category}>
                  <div className="text-xs text-subtext">{category}</div>
                  <div className="mt-1 grid gap-1">
                    {items.map((r) => {
                      const selected = r.key === selectedKey;
                      return (
                        <button
                          key={r.key}
                          className={clsx(
                            "ui-transition-fast w-full overflow-hidden rounded-atelier border px-3 py-2 text-left text-sm",
                            selected
                              ? "border-accent/40 bg-accent/10 text-ink"
                              : "border-border bg-canvas text-subtext hover:bg-surface hover:text-ink",
                          )}
                          onClick={() => void selectKeyWithGuard(r.key)}
                          type="button"
                        >
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 truncate">{r.name}</div>
                            <div className="min-w-0 max-w-[120px] shrink-0 truncate text-[11px] text-subtext">
                              {r.activation_tasks?.[0] ? taskLabelByKey.get(r.activation_tasks[0]) ?? r.activation_tasks[0] : ""}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-ink">{selectedTemplateName}</div>
                  <div className="text-xs text-subtext">
                    适用任务：{selectedTaskLabel}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-secondary"
                    onClick={() => void exportSelectedPreset()}
                    disabled={busy || !preset}
                    type="button"
                  >
                    导出当前模板备份
                  </button>
                  <button
                    className="btn btn-ghost text-accent hover:bg-accent/10"
                    onClick={() => void resetSelectedPreset()}
                    disabled={busy || !preset}
                    type="button"
                  >
                    重置为系统默认
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-atelier border border-border bg-canvas p-3">
                  <div className="text-sm text-ink">当前编辑建议</div>
                  <div className="mt-2 text-xs leading-6 text-subtext">
                    优先改“开场定位、输出结构、关键约束”这三类模板文本，它们对最终生成稳定性影响最大；细碎措辞建议放到预览通过之后再抛光。
                  </div>
                </div>
                <div className="rounded-atelier border border-border bg-canvas p-3">
                  <div className="text-sm text-ink">什么时候该去提示词工作室</div>
                  <div className="mt-2 text-xs leading-6 text-subtext">
                    如果你已经不仅是在改默认文案，而是想控制片段顺序、启用条件、角色注入或多任务复用，那就该进入更细粒度的提示词工作室。
                  </div>
                </div>
              </div>

              {!selectedResource ? <div className="text-sm text-subtext">先从左侧挑一个模板。</div> : null}

              {selectedResource && !selectedResource.preset_id ? (
                <div className="text-sm text-subtext">该模板尚未在项目中初始化，请刷新或先打开提示词工作室。</div>
              ) : null}

              {preset ? (
                <div className="grid gap-3">
                  <FeedbackDisclosure
                  className="rounded-atelier border border-border bg-surface/50 p-3"
                  summaryClassName="px-0 py-0 text-sm hover:text-ink"
                  bodyClassName="pt-2"
                    title="模板语法与自动补全占位符"
                  >
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-subtext">
                      <div className="grid gap-1">
                        <div>
                          占位符（变量）：<span className="atelier-mono text-ink">{"{{project_name}}"}</span>{" "}
                          <span className="atelier-mono text-ink">{"{{story.outline}}"}</span>
                        </div>
                        <div>
                          条件判断：<span className="atelier-mono text-ink">{"{% if chapter_number == '1' %}"}</span>...{" "}
                          <span className="atelier-mono text-ink">{"{% endif %}"}</span>
                        </div>
                        <div>
                          快捷占位符（宏）：<span className="atelier-mono text-ink">{"{{date}}"}</span>{" "}
                          <span className="atelier-mono text-ink">{"{{time}}"}</span>{" "}
                          <span className="atelier-mono text-ink">{"{{pick::A::B}}"}</span>
                        </div>
                        <div>右侧预览只会读取“已保存模板”；如果预览没变化，通常是因为当前改动还没保存。</div>
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          await copyText(availableVariablesText, { title: "复制失败：请手动复制占位符清单" });
                        }}
                        type="button"
                      >
                        复制占位符清单
                      </button>
                    </div>
                    <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-atelier border border-border bg-surface p-3 text-xs">
                      {availableVariablesText || "（占位符清单为空）"}
                    </pre>
                  </FeedbackDisclosure>

                  {blocks.map((b) => {
                    const draft = draftTemplates[b.id] ?? "";
                    const baseline = baselineTemplates[b.id] ?? "";
                    const dirty = draft !== baseline;
                    const usedVars = extractTemplateVars(draft);
                    return (
                      <div key={b.id} className="rounded-atelier border border-border bg-canvas p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {b.name}{" "}
                              <span className="text-xs text-subtext">（{BLOCK_ROLE_LABELS[b.role] ?? b.role}）</span>
                            </div>
                            <div className="truncate text-xs text-subtext">片段标识（identifier）：{b.identifier}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {dirty ? <div className="text-xs text-accent">未保存</div> : null}
                            <button
                              className="btn btn-primary"
                              onClick={() => void saveBlockTemplate(b)}
                              disabled={busy || !dirty}
                              type="button"
                            >
                              保存
                            </button>
                            <button
                              className="btn btn-ghost text-accent hover:bg-accent/10"
                              onClick={() => void resetBlockTemplate(b)}
                              disabled={busy}
                              type="button"
                            >
                              重置
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] leading-5 text-subtext">
                          编辑建议：先把这一段当成“对 AI 的固定说明卡”。如果你改的是结构、约束或口吻，记得保存后立刻看右侧预览有没有按预期变化。
                        </div>
                        <div className="mt-2 grid gap-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-subtext">
                              占位符（本块）：{usedVars.length ? `${usedVars.length} 个（点击复制）` : "未检测到"}
                            </div>
                            {usedVars.length ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={async () => {
                                  const text = usedVars.map((v) => `{{` + v + `}}`).join("\n");
                                  await copyText(text, {
                                    title: "复制失败：请手动复制本块占位符清单",
                                  });
                                }}
                                type="button"
                              >
                                复制本块占位符
                              </button>
                            ) : null}
                          </div>
                          {usedVars.length ? (
                            <div className="flex flex-wrap gap-1">
                              {usedVars.map((v) => (
                                <button
                                  key={v}
                                  className="btn btn-ghost btn-sm atelier-mono"
                                  onClick={async () => {
                                    const text = `{{` + v + `}}`;
                                    await copyText(text, { title: "复制失败：请手动复制占位符" });
                                  }}
                                  type="button"
                                >
                                  {`{{` + v + `}}`}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <textarea
                            className="textarea atelier-mono min-h-[160px] resize-y py-2 text-xs"
                            value={draft}
                            disabled={busy}
                            onChange={(e) => setDraftTemplates((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <PromptStudioPreviewPanel
              busy={busy}
              selectedPresetId={preset?.id ?? null}
              previewTask={previewTask}
              setPreviewTask={setPreviewTask}
              tasks={previewTasks}
              previewLoading={previewLoading}
              runPreview={runPreview}
              requestId={previewRequestId}
              preview={preview}
              templateErrors={templateErrors}
              renderLog={renderLog}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
