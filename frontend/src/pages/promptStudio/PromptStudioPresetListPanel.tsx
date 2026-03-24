import clsx from "clsx";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useMemo, useRef, useState } from "react";

import { FeedbackCallout, FeedbackEmptyState } from "../../components/ui/Feedback";
import { transition } from "../../lib/motion";
import type { PromptPreset } from "../../types";
import type { PromptStudioTask } from "./types";

export function PromptStudioPresetListPanel(props: {
  busy: boolean;
  importBusy: boolean;
  bulkBusy: boolean;
  tasks: PromptStudioTask[];
  presets: PromptPreset[];
  selectedPresetId: string | null;
  setSelectedPresetId: (id: string | null) => void;
  createPreset: (name: string) => Promise<boolean>;
  exportPreset: () => Promise<void>;
  exportAllPresets: () => Promise<void>;
  importPreset: (file: File) => Promise<void>;
  importAllPresets: (file: File) => Promise<void>;
}) {
  const {
    busy,
    bulkBusy,
    createPreset,
    exportAllPresets,
    exportPreset,
    importAllPresets,
    importBusy,
    importPreset,
    presets,
    tasks,
    selectedPresetId,
    setSelectedPresetId,
  } = props;

  const reduceMotion = useReducedMotion();

  const [newPresetName, setNewPresetName] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importAllInputRef = useRef<HTMLInputElement | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>("__all__");

  const taskLabelByKey = useMemo(() => new Map(tasks.map((t) => [t.key, t.label])), [tasks]);
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  const presetCategoryGroups = useMemo(() => {
    const groups = new Map<string, PromptPreset[]>();
    for (const p of presets) {
      const key = String(p.category ?? "").trim() || "（未分类）";
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    const ordered = [...groups.entries()];
    ordered.sort((a, b) => a[0].localeCompare(b[0]));
    return ordered;
  }, [presets]);

  const effectiveCategoryFilter =
    categoryFilter === "__all__" || presetCategoryGroups.some(([key]) => key === categoryFilter)
      ? categoryFilter
      : "__all__";

  const visiblePresetCategoryGroups = useMemo(() => {
    if (effectiveCategoryFilter === "__all__") return presetCategoryGroups;
    return presetCategoryGroups.filter(([key]) => key === effectiveCategoryFilter);
  }, [effectiveCategoryFilter, presetCategoryGroups]);

  const showCategoryHeaders = effectiveCategoryFilter === "__all__";
  const selectedTaskSummary = selectedPreset
    ? (selectedPreset.active_for ?? []).length
      ? (selectedPreset.active_for ?? []).map((key) => taskLabelByKey.get(key) ?? key).join("、")
      : "未限定任务，所有写作任务都可调用"
    : "先从下方选一套蓝图";
  const nextStepText = !presets.length
    ? "先创建第一套蓝图，再去右侧编排片段和生成前检查。"
    : !selectedPreset
      ? "从下方方案库选中一套蓝图，然后继续到右侧调整片段。"
      : "当前已选中蓝图。建议先改右侧片段，再跑一次生成前检查确认效果。";

  return (
    <div className="panel p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-ink">蓝图库</div>
        <div className="mt-1 text-xs text-subtext">这里更像你的“生成方案库”。先选方案，再决定是继续细调、导入外部方案，还是导出做备份。</div>
      </div>
      <div className="manuscript-status-list">
        <span className="manuscript-chip">蓝图总数：{presets.length}</span>
        <span className="manuscript-chip">分类：{presetCategoryGroups.length}</span>
        <span className="manuscript-chip">{selectedPreset ? `当前：${selectedPreset.name}` : "尚未选中蓝图"}</span>
      </div>
      <FeedbackCallout className="mt-4" title="下一步建议">
        {nextStepText}
      </FeedbackCallout>
      <div className="grid gap-2">
        <div className="mt-4 rounded-atelier border border-border bg-canvas p-3">
          <div className="text-xs text-subtext">当前蓝图适用范围</div>
          <div className="mt-2 text-sm font-semibold text-ink">{selectedTaskSummary}</div>
          <div className="mt-1 text-[11px] leading-5 text-subtext">
            单份导出更适合分享某一套写作方案；整套导出更适合给当前项目做完整备份。
          </div>
        </div>

        <div className="text-xs text-subtext">新建蓝图</div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="例如：章节生成·稳态版"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            disabled={busy}
          />
          <button
            className="btn btn-secondary"
            onClick={() => {
              void (async () => {
                const ok = await createPreset(newPresetName);
                if (ok) setNewPresetName("");
              })();
            }}
            disabled={busy}
          >
            建立新蓝图
          </button>
        </div>

        <div className="text-xs text-subtext">导入/导出当前蓝图</div>
        <div className="flex gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            data-testid="prompt-studio-import-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importPreset(file);
              if (importInputRef.current) importInputRef.current.value = "";
            }}
          />
          <input
            ref={importAllInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            data-testid="prompt-studio-import-all-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importAllPresets(file);
              if (importAllInputRef.current) importAllInputRef.current.value = "";
            }}
          />
          <button
            className="btn btn-secondary w-full"
            onClick={() => importInputRef.current?.click()}
            disabled={importBusy || busy}
          >
            导入单份蓝图
          </button>
          <button
            className="btn btn-secondary w-full"
            onClick={() => void exportPreset()}
            disabled={busy || !selectedPresetId}
          >
            导出当前蓝图
          </button>
        </div>
        <div className="text-[11px] text-subtext">单份文件更适合分享某一套写作方案，或从别的项目借一套成熟蓝图过来。</div>

        <div className="text-xs text-subtext">导入/导出整套蓝图</div>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary w-full"
            onClick={() => importAllInputRef.current?.click()}
            disabled={bulkBusy || importBusy || busy}
            type="button"
          >
            导入整套蓝图备份
          </button>
          <button
            className="btn btn-secondary w-full"
            onClick={() => void exportAllPresets()}
            disabled={bulkBusy || busy}
            type="button"
          >
            导出整套蓝图备份
          </button>
        </div>
        <div className="text-[11px] text-subtext">整套文件更适合给当前项目做完整备份；导入前会先做一次预演，帮助你确认冲突和变更量。</div>

        <div className="grid gap-1">
          <div className="text-xs text-subtext">分类</div>
          <select
            className="select"
            value={effectiveCategoryFilter}
            onChange={(e) => setCategoryFilter(e.currentTarget.value)}
            disabled={busy || bulkBusy}
          >
            <option value="__all__">全部分类</option>
            {presetCategoryGroups.map(([key]) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <LayoutGroup id="promptstudio-presets">
          <div className="mt-2 grid gap-3">
            {visiblePresetCategoryGroups.length ? (
              visiblePresetCategoryGroups.map(([category, items]) => (
                <div key={category}>
                  {showCategoryHeaders ? <div className="text-xs text-subtext">{category}</div> : null}
                  <div className={clsx("grid gap-1", showCategoryHeaders ? "mt-1" : null)}>
                    {items.map((p) => {
                      const active = p.id === selectedPresetId;
                      const activeFor = (p.active_for ?? [])
                        .map((key) => taskLabelByKey.get(key) ?? key)
                        .filter((v) => typeof v === "string" && v.trim())
                        .join("、");
                      return (
                        <button
                          key={p.id}
                          className={clsx(
                            "ui-focus-ring ui-transition-fast group relative w-full overflow-hidden rounded-atelier border px-3 py-3 text-left text-sm motion-safe:active:scale-[0.99]",
                            active
                              ? "border-accent/40 text-ink"
                              : "border-border text-subtext hover:bg-canvas hover:text-ink",
                          )}
                          onClick={() => setSelectedPresetId(p.id)}
                          type="button"
                        >
                          {active ? (
                            <motion.span
                              layoutId="promptstudio-preset-active"
                              className="absolute inset-0 rounded-atelier bg-canvas"
                              transition={reduceMotion ? { duration: 0.01 } : transition.fast}
                            />
                          ) : null}
                          <div className="relative z-10 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{p.name}</div>
                              <div className="mt-1 text-xs leading-5 opacity-80">
                                {activeFor ? `适用任务：${activeFor}` : "适用任务：未限定，默认所有任务可用"}
                              </div>
                            </div>
                            <span
                              className={clsx(
                                "rounded-full border px-2 py-0.5 text-[11px]",
                                active
                                  ? "border-accent/30 bg-accent/10 text-accent"
                                  : "border-border bg-surface text-subtext",
                              )}
                            >
                              {active ? "当前编辑" : category}
                            </span>
                          </div>
                          <div className="relative z-10 mt-2 flex flex-wrap gap-2 text-[11px] opacity-80">
                            <span className="rounded-full border border-border bg-surface px-2 py-0.5">
                              版本 v{p.version}
                            </span>
                            <span className="rounded-full border border-border bg-surface px-2 py-0.5">
                              {p.scope === "project" ? "项目内蓝图" : p.scope}
                            </span>
                            {p.updated_at ? (
                              <span className="rounded-full border border-border bg-surface px-2 py-0.5">
                                更新于 {p.updated_at}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <FeedbackEmptyState
                variant="compact"
                className="rounded-atelier border border-dashed border-border bg-canvas"
                title="当前分类下还没有蓝图"
                description="可以先新建一套蓝图，或者切回“全部分类”看看现有方案。"
              />
            )}
          </div>
        </LayoutGroup>

        <div className="mt-2 text-xs text-subtext">片段排序和生成前检查都在右侧完成；这里更适合做方案选择、备份和导入导出管理。</div>
      </div>
    </div>
  );
}
