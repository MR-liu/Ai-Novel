import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { DebugDetails } from "../components/atelier/DebugPageShell";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { FeedbackCallout, FeedbackStateCard } from "../components/ui/Feedback";
import { useConfirm } from "../components/ui/confirm";
import { useToast } from "../components/ui/toast";
import { copyText } from "../lib/copyText";
import { buildProjectWritePath, buildStudioAiPath } from "../lib/projectRoutes";
import { PROMPT_STUDIO_TASKS } from "../lib/promptTaskCatalog";
import { UI_COPY } from "../lib/uiCopy";
import { ApiError, apiJson, sanitizeFilename } from "../services/apiClient";
import type { Character, Outline, Project, ProjectSettings, PromptBlock, PromptPreset, PromptPreview } from "../types";
import { AI_WORKBENCH_COPY } from "./aiWorkbenchModels";
import { PromptStudioPresetEditorPanel } from "./promptStudio/PromptStudioPresetEditorPanel";
import { PromptStudioPresetListPanel } from "./promptStudio/PromptStudioPresetListPanel";
import { PromptStudioPreviewPanel } from "./promptStudio/PromptStudioPreviewPanel";
import type { BlockDraft, PresetDetails, PromptStudioTask } from "./promptStudio/types";
import { formatTriggers, guessPreviewValues, parseTriggersWithValidation } from "./promptStudio/utils";

const RECOMMENDED_OUTLINE_PRESET_NAME = "默认·大纲生成 v3（推荐）";
const RECOMMENDED_CHAPTER_PRESET_NAME = "默认·章节生成 v3（推荐）";

export function PromptStudioPage() {
  const { projectId } = useParams();
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<null | { message: string; code: string; requestId?: string }>(null);
  const [busy, setBusy] = useState(false);

  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);

  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PromptPreset | null>(null);
  const [blocks, setBlocks] = useState<PromptBlock[]>([]);
  const [drafts, setDrafts] = useState<Record<string, BlockDraft>>({});

  const [presetDraftName, setPresetDraftName] = useState("");
  const [presetDraftActiveFor, setPresetDraftActiveFor] = useState<string[]>([]);

  const [importBusy, setImportBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [previewTask, setPreviewTask] = useState<string>("chapter_generate");
  const [preview, setPreview] = useState<PromptPreview | null>(null);
  const [renderLog, setRenderLog] = useState<unknown | null>(null);
  const [previewRequestId, setPreviewRequestId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const previewValues = useMemo(
    () => guessPreviewValues({ project, settings, outline, characters }),
    [characters, outline, project, settings],
  );

  const reloadAll = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [pRes, sRes, oRes, cRes, presetsRes] = await Promise.all([
        apiJson<{ project: Project }>(`/api/projects/${projectId}`),
        apiJson<{ settings: ProjectSettings }>(`/api/projects/${projectId}/settings`),
        apiJson<{ outline: Outline }>(`/api/projects/${projectId}/outline`),
        apiJson<{ characters: Character[] }>(`/api/projects/${projectId}/characters`),
        apiJson<{ presets: PromptPreset[] }>(`/api/projects/${projectId}/prompt_presets`),
      ]);

      setProject(pRes.data.project);
      setSettings(sRes.data.settings);
      setOutline(oRes.data.outline);
      setCharacters(cRes.data.characters);
      setPresets(presetsRes.data.presets ?? []);
      setLoadError(null);

      const nextPresetId =
        selectedPresetId && (presetsRes.data.presets ?? []).some((p) => p.id === selectedPresetId)
          ? selectedPresetId
          : (presetsRes.data.presets?.[0]?.id ?? null);
      setSelectedPresetId(nextPresetId);
    } catch (e) {
      if (e instanceof ApiError) {
        setLoadError({ message: e.message, code: e.code, requestId: e.requestId });
        toast.toastError(`${e.message} (${e.code})`, e.requestId);
      } else {
        setLoadError({ message: "请求失败", code: "UNKNOWN_ERROR" });
        toast.toastError("请求失败 (UNKNOWN_ERROR)");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedPresetId, toast]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  const loadPreset = useCallback(
    async (presetId: string) => {
      setBusy(true);
      try {
        const res = await apiJson<PresetDetails>(`/api/prompt_presets/${presetId}`);
        setSelectedPreset(res.data.preset);
        setBlocks(res.data.blocks ?? []);
        setPresetDraftName(res.data.preset.name ?? "");
        setPresetDraftActiveFor(res.data.preset.active_for ?? []);
        const nextDrafts: Record<string, BlockDraft> = {};
        for (const b of res.data.blocks ?? []) {
          nextDrafts[b.id] = {
            identifier: b.identifier,
            name: b.name,
            role: b.role,
            enabled: b.enabled,
            template: b.template ?? "",
            marker_key: b.marker_key ?? "",
            triggers: formatTriggers(b.triggers ?? []),
          };
        }
        setDrafts(nextDrafts);
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
    if (!selectedPresetId) return;
    void loadPreset(selectedPresetId);
  }, [loadPreset, selectedPresetId]);

  const createPreset = useCallback(
    async (rawName: string): Promise<boolean> => {
      if (!projectId) return false;
      const name = rawName.trim();
      if (!name) {
        toast.toastError("请输入预设名称");
        return false;
      }
      setBusy(true);
      try {
        const res = await apiJson<{ preset: PromptPreset }>(`/api/projects/${projectId}/prompt_presets`, {
          method: "POST",
          body: JSON.stringify({ name, scope: "project", version: 1, active_for: [] }),
        });
        await reloadAll();
        setSelectedPresetId(res.data.preset.id);
        toast.toastSuccess("已创建预设");
        return true;
      } catch (e) {
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [projectId, reloadAll, toast],
  );

  const deletePreset = useCallback(async () => {
    if (!selectedPresetId || !selectedPreset) return;
    const ok = await confirm.confirm({
      title: UI_COPY.promptStudio.confirmDeletePresetTitle,
      description: `将删除预设“${selectedPreset.name}”及其所有块。该操作不可撤销。`,
      confirmText: UI_COPY.promptStudio.confirmDeletePresetConfirm,
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await apiJson<Record<string, never>>(`/api/prompt_presets/${selectedPresetId}`, { method: "DELETE" });
      toast.toastSuccess(UI_COPY.promptStudio.toastPresetDeleted);
      setSelectedPreset(null);
      setBlocks([]);
      setDrafts({});
      setSelectedPresetId(null);
      await reloadAll();
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBusy(false);
    }
  }, [confirm, reloadAll, selectedPreset, selectedPresetId, toast]);

  const enableRecommendedDefaults = useCallback(async () => {
    if (!projectId) return;
    const outline = presets.find((p) => p.name === RECOMMENDED_OUTLINE_PRESET_NAME);
    const chapter = presets.find((p) => p.name === RECOMMENDED_CHAPTER_PRESET_NAME);
    if (!outline || !chapter) {
      toast.toastError(UI_COPY.promptStudio.toastRecommendedNotFound);
      return;
    }

    setBusy(true);
    try {
      const outlineActive = new Set(outline.active_for ?? []);
      outlineActive.add("outline_generate");
      await apiJson<{ preset: PromptPreset }>(`/api/prompt_presets/${outline.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: null, active_for: [...outlineActive] }),
      });

      const chapterActive = new Set(chapter.active_for ?? []);
      chapterActive.add("chapter_generate");
      await apiJson<{ preset: PromptPreset }>(`/api/prompt_presets/${chapter.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: null, active_for: [...chapterActive] }),
      });

      toast.toastSuccess(UI_COPY.promptStudio.toastRecommendedEnabled);
      await reloadAll();
      setSelectedPresetId(chapter.id);
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBusy(false);
    }
  }, [presets, projectId, reloadAll, toast]);

  const savePreset = useCallback(async () => {
    if (!selectedPresetId) return;
    setBusy(true);
    try {
      const res = await apiJson<{ preset: PromptPreset }>(`/api/prompt_presets/${selectedPresetId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: presetDraftName.trim() || null,
          active_for: presetDraftActiveFor,
        }),
      });
      setSelectedPreset(res.data.preset);
      await reloadAll();
      toast.toastSuccess(UI_COPY.promptStudio.toastPresetSaved);
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBusy(false);
    }
  }, [presetDraftActiveFor, presetDraftName, reloadAll, selectedPresetId, toast]);

  const addBlock = useCallback(async () => {
    if (!selectedPresetId) return;
    setBusy(true);
    try {
      const idx = blocks.length + 1;
      const identifier = `block.${Date.now()}.${idx}`;
      const res = await apiJson<{ block: PromptBlock }>(`/api/prompt_presets/${selectedPresetId}/blocks`, {
        method: "POST",
        body: JSON.stringify({
          identifier,
          name: `新片段 ${idx}`,
          role: "system",
          enabled: true,
          template: "",
          marker_key: null,
          injection_position: "relative",
          injection_depth: null,
          injection_order: blocks.length,
          triggers: [],
          forbid_overrides: false,
          budget: {},
          cache: {},
        }),
      });
      const next = [...blocks, res.data.block];
      setBlocks(next);
      setDrafts((prev) => ({
        ...prev,
        [res.data.block.id]: {
          identifier: res.data.block.identifier,
          name: res.data.block.name,
          role: res.data.block.role,
          enabled: res.data.block.enabled,
          template: res.data.block.template ?? "",
          marker_key: res.data.block.marker_key ?? "",
          triggers: formatTriggers(res.data.block.triggers ?? []),
        },
      }));
      toast.toastSuccess("已添加片段");
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBusy(false);
    }
  }, [blocks, selectedPresetId, toast]);

  const saveBlock = useCallback(
    async (blockId: string) => {
      const draft = drafts[blockId];
      if (!draft) return;

      const triggerValidation = parseTriggersWithValidation(draft.triggers);
      if (triggerValidation.invalid.length) {
        toast.toastError(`任务键无效：${triggerValidation.invalid.join(", ")}`);
        return;
      }

      setBusy(true);
      try {
        const res = await apiJson<{ block: PromptBlock }>(`/api/prompt_blocks/${blockId}`, {
          method: "PUT",
          body: JSON.stringify({
            identifier: draft.identifier.trim() || null,
            name: draft.name.trim() || null,
            role: draft.role,
            enabled: draft.enabled,
            template: draft.template,
            marker_key: draft.marker_key.trim() || null,
            triggers: triggerValidation.triggers,
          }),
        });
        setBlocks((prev) => prev.map((b) => (b.id === blockId ? res.data.block : b)));
        setDrafts((prev) => ({
          ...prev,
          [blockId]: {
            identifier: res.data.block.identifier,
            name: res.data.block.name,
            role: res.data.block.role,
            enabled: res.data.block.enabled,
            template: res.data.block.template ?? "",
            marker_key: res.data.block.marker_key ?? "",
            triggers: formatTriggers(res.data.block.triggers ?? []),
          },
        }));
        toast.toastSuccess(UI_COPY.promptStudio.toastBlockSaved);
      } catch (e) {
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setBusy(false);
      }
    },
    [drafts, toast],
  );

  const deleteBlock = useCallback(
    async (blockId: string) => {
      const b = blocks.find((x) => x.id === blockId);
      const ok = await confirm.confirm({
        title: UI_COPY.promptStudio.confirmDeleteBlockTitle,
        description: b
          ? `将删除提示块“${b.name}”。该操作不可撤销。`
          : UI_COPY.promptStudio.confirmDeleteBlockDescFallback,
        confirmText: UI_COPY.promptStudio.confirmDeleteBlockConfirm,
        danger: true,
      });
      if (!ok) return;

      setBusy(true);
      try {
        await apiJson<Record<string, never>>(`/api/prompt_blocks/${blockId}`, { method: "DELETE" });
        setBlocks((prev) => prev.filter((x) => x.id !== blockId));
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[blockId];
          return next;
        });
        toast.toastSuccess(UI_COPY.promptStudio.toastBlockDeleted);
      } catch (e) {
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setBusy(false);
      }
    },
    [blocks, confirm, toast],
  );

  const onReorder = useCallback(
    async (orderedIds: string[]) => {
      if (!selectedPresetId) return;
      setBusy(true);
      try {
        const res = await apiJson<{ blocks: PromptBlock[] }>(`/api/prompt_presets/${selectedPresetId}/blocks/reorder`, {
          method: "POST",
          body: JSON.stringify({ ordered_block_ids: orderedIds }),
        });
        setBlocks(res.data.blocks ?? []);
        toast.toastSuccess(UI_COPY.promptStudio.toastReordered);
      } catch (e) {
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setBusy(false);
      }
    },
    [selectedPresetId, toast],
  );

  type ImportAllReport = {
    dry_run: boolean;
    created: number;
    updated: number;
    skipped: number;
    conflicts: unknown[];
    actions: unknown[];
  };

  const formatImportAllReport = useCallback((report: ImportAllReport): string => {
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
  }, []);

  const exportPreset = useCallback(async () => {
    if (!selectedPresetId || !selectedPreset) return;
    setBusy(true);
    try {
      const res = await apiJson<{ export: unknown }>(`/api/prompt_presets/${selectedPresetId}/export`);
      const jsonText = JSON.stringify(res.data.export, null, 2);
      const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = sanitizeFilename(selectedPreset.name) || "prompt_preset";
      a.download = `${safeName}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.toastSuccess("已导出当前蓝图");
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBusy(false);
    }
  }, [selectedPreset, selectedPresetId, toast]);

  const exportAllPresets = useCallback(async () => {
    if (!projectId) return;
    setBulkBusy(true);
    try {
      const res = await apiJson<{ export: unknown }>(`/api/projects/${projectId}/prompt_presets/export_all`);
      const jsonText = JSON.stringify(res.data.export, null, 2);
      const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = sanitizeFilename(project?.name || "prompt_presets_all") || "prompt_presets_all";
      const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      a.download = `${safeName}_${stamp}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.toastSuccess("已导出整套蓝图备份");
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setBulkBusy(false);
    }
  }, [project?.name, projectId, toast]);

  const importPreset = useCallback(
    async (file: File) => {
      if (!projectId) return;
      setImportBusy(true);
      try {
        const text = await file.text();
        const obj = JSON.parse(text) as unknown;
        await apiJson<{ preset: PromptPreset }>(`/api/projects/${projectId}/prompt_presets/import`, {
          method: "POST",
          body: JSON.stringify(obj),
        });
        toast.toastSuccess("已导入单份蓝图");
        await reloadAll();
      } catch (e) {
        if (e instanceof SyntaxError) {
          toast.toastError("导入失败：文件不是合法 JSON");
          return;
        }
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setImportBusy(false);
      }
    },
    [projectId, reloadAll, toast],
  );

  const importAllPresets = useCallback(
    async (file: File) => {
      if (!projectId) return;
      setBulkBusy(true);
      try {
        const text = await file.text();
        const obj = JSON.parse(text) as Record<string, unknown>;

        const dryRunRes = await apiJson<ImportAllReport>(`/api/projects/${projectId}/prompt_presets/import_all`, {
          method: "POST",
          body: JSON.stringify({ ...obj, dry_run: true }),
        });

        const report = dryRunRes.data;
        const ok = await confirm.confirm({
          title: "导入整套蓝图备份前先预演（dry_run）",
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
          `整套蓝图已导入：新建 ${applyRes.data.created} | 更新 ${applyRes.data.updated} | 跳过 ${applyRes.data.skipped}`,
        );
        await reloadAll();
      } catch (e) {
        if (e instanceof SyntaxError) {
          toast.toastError("导入失败：文件不是合法 JSON");
          return;
        }
        const err = e as ApiError;
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setBulkBusy(false);
      }
    },
    [confirm, formatImportAllReport, projectId, reloadAll, toast],
  );

  const runPreview = useCallback(async () => {
    if (!projectId || !selectedPresetId) return;
    setPreviewLoading(true);
    setPreviewRequestId(null);
    try {
      const res = await apiJson<{ preview: PromptPreview; render_log?: unknown }>(
        `/api/projects/${projectId}/prompt_preview`,
        {
          method: "POST",
          body: JSON.stringify({ task: previewTask, preset_id: selectedPresetId, values: previewValues }),
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
  }, [previewTask, previewValues, projectId, selectedPresetId, toast]);

  const templateErrors = useMemo(() => {
    const blocks = (renderLog as { blocks?: unknown } | null)?.blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks
      .map((b) => b as { identifier?: unknown; render_error?: unknown })
      .filter((b) => typeof b.render_error === "string" && b.render_error.trim())
      .map((b) => ({ identifier: String(b.identifier ?? ""), error: String(b.render_error ?? "") }))
      .filter((b) => b.identifier && b.error);
  }, [renderLog]);

  const tasks: PromptStudioTask[] = PROMPT_STUDIO_TASKS;
  const taskLabelByKey = useMemo(() => new Map(tasks.map((task) => [task.key, task.label])), [tasks]);
  const selectedPresetName = selectedPreset?.name ?? presetDraftName.trim() ?? "";
  const activeTaskSummary = presetDraftActiveFor.length
    ? presetDraftActiveFor.map((taskKey) => taskLabelByKey.get(taskKey) ?? taskKey).join("、")
    : "未限定任务，默认所有写作任务可调用";
  const previewStatusText = !preview
    ? "尚未做生成前检查"
    : templateErrors.length
      ? `有 ${templateErrors.length} 条模板错误`
      : preview.missing?.length
        ? `有 ${preview.missing.length} 项变量缺口`
        : "生成前检查已通过基础校验";
  const nextStepText = !selectedPresetId
    ? "先从左侧挑一套蓝图，或新建一套可编辑的方案。"
    : blocks.length === 0
      ? "先添加片段，通常从“总控说明”或“写作指令”开始。"
      : !preview
        ? "片段已可编辑，建议先跑一次生成前检查。"
        : templateErrors.length || preview.missing?.length
          ? "先处理检查里暴露的问题，再回写作页跑真实生成。"
          : "这套蓝图已具备继续实战验证的条件，可以回写作页跑一次真实起草。";

  if (!projectId) return <div className="text-subtext">{UI_COPY.promptStudio.missingProjectId}</div>;
  if (loading) {
    return (
      <div className="grid gap-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">{UI_COPY.promptStudio.loadingA11y}</span>
        <div className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-2">
              <div className="skeleton h-6 w-56" />
              <div className="skeleton h-4 w-96" />
            </div>
            <div className="skeleton h-4 w-24" />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[320px_1fr_360px]">
            <div className="grid gap-3">
              <div className="skeleton h-10 w-full" />
              <div className="grid gap-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-4 w-4/5" />
                <div className="skeleton h-4 w-3/5" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-4 w-4/5" />
              </div>
            </div>
            <div className="grid gap-3">
              <div className="skeleton h-10 w-48" />
              <div className="skeleton h-96 w-full" />
            </div>
            <div className="grid gap-3">
              <div className="skeleton h-10 w-44" />
              <div className="skeleton h-96 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError && !project && !settings && !outline) {
    return (
      <div className="grid gap-6">
        <FeedbackStateCard
          tone="danger"
          title="加载失败"
          description={`${loadError.message} (${loadError.code})`}
          meta={
            loadError.requestId ? (
              <>
                <span>请求 ID（request_id）: {loadError.requestId}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void copyText(loadError.requestId!, { title: "复制请求 ID（request_id）" })}
                  type="button"
                >
                  复制请求 ID
                </button>
              </>
            ) : null
          }
          actions={
            <button className="btn btn-primary" onClick={() => void reloadAll()} type="button">
              重试
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="studio-shell">
      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">{nextStepText}</div>
          <div className="text-xs text-subtext">
            建议顺序：先选蓝图，再改片段，跑一次预览检查，最后回写作页做真实起草验证。
          </div>
        </div>
        <div className="manuscript-status-list">
          <span className="manuscript-chip">{selectedPresetId ? `当前蓝图：${selectedPresetName || "未命名蓝图"}` : "尚未选中蓝图"}</span>
          <span className="manuscript-chip">{selectedPresetId ? `片段 ${blocks.length} 条` : "等待选择方案"}</span>
          <span className="manuscript-chip">适用任务：{selectedPresetId ? activeTaskSummary : "待选择"}</span>
          <span className="manuscript-chip">{previewStatusText}</span>
        </div>
      </section>

      <ResearchWorkbenchPanel eyebrow="当前 AI 路径" {...AI_WORKBENCH_COPY["prompt-studio"]} />

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">生成蓝图台</div>
            <div className="studio-cluster-copy">
              在这里不是单纯改几句提示，而是为不同写作任务挑选蓝图、拆分片段，再用真实渲染结果确认生成是否按预期工作。
            </div>
          </div>
          <div className="studio-cluster-meta">
            {busy || importBusy || bulkBusy ? UI_COPY.promptStudio.processing : "可开始编排"}
          </div>
        </div>

        <div className="manuscript-status-list mt-4">
          <span className="manuscript-chip">{selectedPresetId ? `当前蓝图：${selectedPresetName || "未命名蓝图"}` : "尚未选中蓝图"}</span>
          <span className="manuscript-chip">{selectedPresetId ? `片段 ${blocks.length} 条` : "等待选择方案"}</span>
          <span className="manuscript-chip">适用任务：{selectedPresetId ? activeTaskSummary : "待选择"}</span>
          <span className="manuscript-chip">{previewStatusText}</span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="text-sm text-ink">这页最适合做什么</div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              当你已经知道“生成方向不太对”，但还不知道是哪段说明造成的时，就来这里。它适合片段级拆解、任务级区分和生成前检查。
            </div>
            <div className="mt-3 manuscript-status-list">
              <span className="manuscript-chip">适合查原因</span>
              <span className="manuscript-chip">适合做片段级微调</span>
              <span className="manuscript-chip">不适合直接代替写作实战</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => void enableRecommendedDefaults()}
                disabled={busy || importBusy}
                type="button"
              >
                {UI_COPY.promptStudio.enableRecommendedPresets}
              </button>
            </div>
          </div>

          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="text-sm text-ink">下一步该去哪</div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              {nextStepText}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link className="btn btn-secondary" to={buildStudioAiPath(projectId, "prompts")}>
                去提示词方案看项目级策略
              </Link>
              <Link className="btn btn-secondary" to={buildStudioAiPath(projectId, "templates")}>
                去模板库整理稳态模板
              </Link>
              <Link className="btn btn-secondary" to={buildProjectWritePath(projectId)}>
                回写作页跑真实生成
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="surface p-3">
            <div className="text-xs text-subtext">模板库</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合沉淀稳定方案</div>
            <div className="mt-1 text-xs leading-5 text-subtext">当你已经找到有效写法，想把它长期保存下来，下次不再从零开始时，优先去模板库。</div>
          </div>
          <div className="surface p-3">
            <div className="text-xs text-subtext">生成蓝图台</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合拆解“到底哪段在起作用”</div>
            <div className="mt-1 text-xs leading-5 text-subtext">这里更像解剖台。把方案拆成片段后，你会更容易知道该删、该补还是该换顺序。</div>
          </div>
          <div className="surface p-3">
            <div className="text-xs text-subtext">写作页</div>
            <div className="mt-2 text-sm font-semibold text-ink">适合做最终实战验证</div>
            <div className="mt-1 text-xs leading-5 text-subtext">蓝图检查通过后，仍要回到写作页看真实章节起草效果，避免停留在配置页里反复猜测。</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <DebugDetails title="怎么进入这页最省力">
            <div className="grid gap-2 text-xs text-subtext">
              <div>{UI_COPY.promptStudio.recommendedFlow}</div>
              <div>{UI_COPY.promptStudio.quickStart}</div>
              <FeedbackCallout className="text-xs" tone="warning" title="高级提醒">
                {UI_COPY.promptStudio.advancedHint}
              </FeedbackCallout>
            </div>
          </DebugDetails>
          <DebugDetails title="蓝图、片段与优先级是怎么协作的">
            <div className="grid gap-1 text-sm text-subtext">
              <div>
                <span className="font-medium text-ink">蓝图</span>：一套完整的生成方案。它会决定哪些任务调用哪一组片段。
              </div>
              <div>
                <span className="font-medium text-ink">片段</span>：蓝图里的可排序说明卡。它们可以按任务触发、按通道注入，并最终由后端统一渲染。
              </div>
              <div>若同一任务被多套蓝图同时勾选，系统会优先使用“最近更新”的蓝图；历史导入方案更适合作为兜底或参考。</div>
            </div>
          </DebugDetails>
        </div>
      </section>

      <section className="studio-cluster">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">蓝图选择、编排与预览</div>
            <div className="studio-cluster-copy">
              建议顺序是“先选蓝图，再改片段，最后跑预览”。这样你会更容易知道是哪一个改动真正影响了生成结果。
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px,1fr]">
          <PromptStudioPresetListPanel
            busy={busy}
            importBusy={importBusy}
            bulkBusy={bulkBusy}
            tasks={tasks}
            presets={presets}
            selectedPresetId={selectedPresetId}
            setSelectedPresetId={setSelectedPresetId}
            createPreset={createPreset}
            exportPreset={exportPreset}
            exportAllPresets={exportAllPresets}
            importPreset={importPreset}
            importAllPresets={importAllPresets}
          />

          <div className="grid gap-6">
            <PromptStudioPresetEditorPanel
              busy={busy}
              selectedPresetId={selectedPresetId}
              tasks={tasks}
              presetDraftName={presetDraftName}
              setPresetDraftName={setPresetDraftName}
              presetDraftActiveFor={presetDraftActiveFor}
              setPresetDraftActiveFor={setPresetDraftActiveFor}
              savePreset={savePreset}
              deletePreset={deletePreset}
              blocks={blocks}
              drafts={drafts}
              setDrafts={setDrafts}
              addBlock={addBlock}
              saveBlock={saveBlock}
              deleteBlock={deleteBlock}
              onReorder={onReorder}
            />

            <PromptStudioPreviewPanel
              busy={busy}
              selectedPresetId={selectedPresetId}
              previewTask={previewTask}
              setPreviewTask={setPreviewTask}
              tasks={tasks}
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
