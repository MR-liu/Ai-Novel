import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { UI_COPY } from "../../lib/uiCopy";
import { ApiError, apiJson } from "../../services/apiClient";
import { Drawer } from "../ui/Drawer";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../ui/Feedback";
import { useToast } from "../ui/toast";
import type { MemoryContextPack } from "./types";
import { VectorRagDebugPanel } from "./contextPreview/VectorRagDebugPanel";
import { WorldbookPreviewPanel } from "./contextPreview/WorldbookPreviewPanel";
import { useVectorRagQuery } from "./contextPreview/useVectorRagQuery";
import { downloadJson, writeClipboardText } from "./contextPreview/utils";
import { getWritingMemoryModuleLabel } from "./writingModuleLabels";
import {
  WritingDrawerHeader,
  WritingDrawerSection,
  type WritingDrawerMetaItem,
} from "./WritingDrawerWorkbench";

type Props = {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  memoryInjectionEnabled: boolean;
  onChangeMemoryInjectionEnabled?: (enabled: boolean) => void;
  genInstruction?: string;
  genChapterPlan?: string;
  genMemoryQueryText?: string;
  genMemoryModules?: {
    worldbook: boolean;
    story_memory: boolean;
    semantic_history?: boolean;
    foreshadow_open_loops?: boolean;
    structured: boolean;
    tables?: boolean;
    vector_rag: boolean;
    graph: boolean;
    fractal: boolean;
  };
};

type MemoryContextPackLogItem = {
  section: string;
  enabled: boolean;
  disabled_reason: string | null;
  note: string | null;
};

type MemorySectionEnabled = {
  worldbook: boolean;
  story_memory: boolean;
  semantic_history: boolean;
  foreshadow_open_loops: boolean;
  structured: boolean;
  tables: boolean;
  vector_rag: boolean;
  graph: boolean;
  fractal: boolean;
};

type ContextOptimizerBlockLog = {
  identifier: string;
  changed: boolean;
  before_tokens: number;
  after_tokens: number;
  before_chars: number;
  after_chars: number;
  details: unknown;
};

type ContextOptimizerLog = {
  enabled: boolean;
  saved_tokens_estimate: number;
  blocks: ContextOptimizerBlockLog[];
};

type OptimizerCompare = {
  baseline: { worldbook: string; structured: string };
  optimized: { worldbook: string; structured: string };
  optimizerLog: ContextOptimizerLog | null;
};

const DEFAULT_PREVIEW_SECTIONS: MemorySectionEnabled = {
  worldbook: true,
  story_memory: true,
  semantic_history: false,
  foreshadow_open_loops: false,
  structured: true,
  tables: true,
  vector_rag: true,
  graph: true,
  fractal: true,
};

const DEFAULT_BUDGET_INPUTS: Record<string, string> = {
  worldbook: "",
  story_memory: "",
  semantic_history: "",
  foreshadow_open_loops: "",
  structured: "",
  tables: "",
  vector_rag: "",
  graph: "",
  fractal: "",
};

const EMPTY_PACK: MemoryContextPack = {
  worldbook: {},
  story_memory: {},
  semantic_history: {},
  foreshadow_open_loops: {},
  structured: {},
  tables: {},
  vector_rag: {},
  graph: {},
  fractal: {},
  logs: [],
};

function hasOwn<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return typeof obj === "object" && obj !== null && Object.prototype.hasOwnProperty.call(obj, key);
}

function formatSectionLabel(section: string): string {
  return getWritingMemoryModuleLabel(section);
}

function formatOptimizerBlockLabel(identifier: string): string {
  if (identifier.startsWith("sys.memory.")) {
    const key = identifier.slice("sys.memory.".length);
    return `${formatSectionLabel(key)} (${identifier})`;
  }
  return identifier;
}

function normalizeContextOptimizerLog(renderLog: unknown): ContextOptimizerLog | null {
  if (!renderLog || typeof renderLog !== "object") return null;
  const o = renderLog as Record<string, unknown>;
  const ctx = o.context_optimizer;
  if (!ctx || typeof ctx !== "object") return null;
  const c = ctx as Record<string, unknown>;
  const savedRaw = c.saved_tokens_estimate;
  const saved = typeof savedRaw === "number" ? savedRaw : Number(savedRaw);
  const blocksRaw = Array.isArray(c.blocks) ? c.blocks : [];
  const blocks: ContextOptimizerBlockLog[] = [];
  for (const b of blocksRaw) {
    if (!b || typeof b !== "object") continue;
    const it = b as Record<string, unknown>;
    const identifier = typeof it.identifier === "string" ? it.identifier : "";
    if (!identifier) continue;
    const beforeTokensRaw = it.before_tokens;
    const afterTokensRaw = it.after_tokens;
    const beforeCharsRaw = it.before_chars;
    const afterCharsRaw = it.after_chars;
    const beforeTokens = typeof beforeTokensRaw === "number" ? beforeTokensRaw : Number(beforeTokensRaw);
    const afterTokens = typeof afterTokensRaw === "number" ? afterTokensRaw : Number(afterTokensRaw);
    const beforeChars = typeof beforeCharsRaw === "number" ? beforeCharsRaw : Number(beforeCharsRaw);
    const afterChars = typeof afterCharsRaw === "number" ? afterCharsRaw : Number(afterCharsRaw);
    blocks.push({
      identifier,
      changed: Boolean(it.changed),
      before_tokens: Number.isFinite(beforeTokens) ? beforeTokens : 0,
      after_tokens: Number.isFinite(afterTokens) ? afterTokens : 0,
      before_chars: Number.isFinite(beforeChars) ? beforeChars : 0,
      after_chars: Number.isFinite(afterChars) ? afterChars : 0,
      details: hasOwn(it, "details") ? it.details : null,
    });
  }

  return {
    enabled: Boolean(c.enabled),
    saved_tokens_estimate: Number.isFinite(saved) ? saved : 0,
    blocks,
  };
}

function getPromptPreviewBlockText(preview: unknown, identifier: string): string {
  if (!preview || typeof preview !== "object") return "";
  const o = preview as Record<string, unknown>;
  const blocks = Array.isArray(o.blocks) ? o.blocks : [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const it = b as Record<string, unknown>;
    if (typeof it.identifier !== "string") continue;
    if (it.identifier !== identifier) continue;
    return typeof it.text === "string" ? it.text : "";
  }
  return "";
}

function formatContextOptimizerDetails(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const o = details as Record<string, unknown>;
  const changed = Boolean(o.changed);
  const reason = typeof o.reason === "string" ? o.reason : null;
  if (!changed && reason) return reason;

  const entriesInRaw = o.entries_in;
  const rowsOutRaw = o.rows_out;
  const entriesIn = typeof entriesInRaw === "number" ? entriesInRaw : Number(entriesInRaw);
  const rowsOut = typeof rowsOutRaw === "number" ? rowsOutRaw : Number(rowsOutRaw);
  if (Number.isFinite(entriesIn) && Number.isFinite(rowsOut)) {
    const parsedRaw = o.entries_parsed;
    const parsed = typeof parsedRaw === "number" ? parsedRaw : Number(parsedRaw);
    return `原始条目:${entriesIn} → 压缩后条目:${rowsOut}` + (Number.isFinite(parsed) ? ` | 已解析:${parsed}` : "");
  }

  const sectionsRaw = o.sections;
  if (Array.isArray(sectionsRaw)) {
    let sections = 0;
    let itemsIn = 0;
    let rowsOut = 0;
    for (const s of sectionsRaw) {
      if (!s || typeof s !== "object") continue;
      const it = s as Record<string, unknown>;
      const itemsInRaw = it.items_in;
      const rowsOutRaw2 = it.rows_out;
      const itemsInNum = typeof itemsInRaw === "number" ? itemsInRaw : Number(itemsInRaw);
      const rowsOutNum = typeof rowsOutRaw2 === "number" ? rowsOutRaw2 : Number(rowsOutRaw2);
      if (Number.isFinite(itemsInNum)) itemsIn += itemsInNum;
      if (Number.isFinite(rowsOutNum)) rowsOut += rowsOutNum;
      sections++;
    }
    if (sections > 0) return `资料模块:${sections} | 原始条目:${itemsIn} → 压缩后条目:${rowsOut}`;
  }

  return null;
}

function normalizePackLogItem(raw: unknown): MemoryContextPackLogItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const section = typeof o.section === "string" ? o.section : "";
  const enabled = typeof o.enabled === "boolean" ? o.enabled : Boolean(o.enabled);
  if (!section) return null;
  return {
    section,
    enabled,
    disabled_reason: typeof o.disabled_reason === "string" ? o.disabled_reason : null,
    note: typeof o.note === "string" ? o.note : null,
  };
}

export function ContextPreviewDrawer(props: Props) {
  const {
    onClose,
    open,
    projectId,
    memoryInjectionEnabled,
    onChangeMemoryInjectionEnabled,
    genInstruction,
    genChapterPlan,
    genMemoryQueryText,
    genMemoryModules,
  } = props;
  const titleId = useId();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState<MemoryContextPack>(EMPTY_PACK);
  const [error, setError] = useState<{ code: string; message: string; requestId?: string } | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [contextOptimizerEnabled, setContextOptimizerEnabled] = useState<boolean | null>(null);
  const [contextOptimizerSettingsLoading, setContextOptimizerSettingsLoading] = useState(false);
  const [contextOptimizerSettingsError, setContextOptimizerSettingsError] = useState<{
    code: string;
    message: string;
    requestId?: string;
  } | null>(null);
  const [optimizerCompareLoading, setOptimizerCompareLoading] = useState(false);
  const [optimizerCompareError, setOptimizerCompareError] = useState<{
    code: string;
    message: string;
    requestId?: string;
  } | null>(null);
  const [optimizerCompare, setOptimizerCompare] = useState<OptimizerCompare | null>(null);
  const lastOptimizerCompareKeyRef = useRef<string | null>(null);

  const syncedOnceRef = useRef(false);

  const [previewQueryText, setPreviewQueryText] = useState("");
  const [previewSections, setPreviewSections] = useState<MemorySectionEnabled>(DEFAULT_PREVIEW_SECTIONS);
  const [budgetOverrideInputs, setBudgetOverrideInputs] = useState<Record<string, string>>(DEFAULT_BUDGET_INPUTS);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  const vector = useVectorRagQuery({ open, projectId, toast });

  const effectivePack = useMemo(() => (memoryInjectionEnabled ? pack : EMPTY_PACK), [memoryInjectionEnabled, pack]);

  const parsedBudgetOverrides = useMemo(() => {
    const out: Record<string, number> = {};
    for (const key of [
      "worldbook",
      "story_memory",
      "semantic_history",
      "foreshadow_open_loops",
      "structured",
      "tables",
      "vector_rag",
      "graph",
      "fractal",
    ] as const) {
      const raw = String(budgetOverrideInputs[key] ?? "").trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) continue;
      out[key] = Math.floor(parsed);
    }
    return out;
  }, [budgetOverrideInputs]);

  const downloadPreviewBundle = useCallback(() => {
    if (!projectId) {
      toast.toastError(UI_COPY.writing.contextPreviewMissingProjectId);
      return;
    }
    try {
      const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      const hint = requestId || stamp;
      const filename = `context_preview_bundle_${projectId}_${hint}.json`;
      downloadJson(filename, {
        schema_version: "context_preview_bundle_v1",
        created_at: new Date().toISOString(),
        project_id: projectId,
        request_id: requestId,
        synced_at: syncedAt,
        preview: {
          query_text: previewQueryText,
          sections: previewSections,
          budget_overrides: parsedBudgetOverrides,
          budget_override_inputs: budgetOverrideInputs,
          memory_injection_enabled: memoryInjectionEnabled,
        },
        pack: effectivePack ?? EMPTY_PACK,
        vector_query: {
          request_id: vector.vectorRequestId,
          query_text: vector.vectorQueryText,
          sources: vector.selectedVectorSources,
          raw_query_text: vector.vectorRawQueryText,
          normalized_query_text: vector.vectorNormalizedQueryText,
          preprocess_obs: vector.vectorPreprocessObs,
          result: vector.vectorResult,
        },
        generate: {
          instruction: genInstruction ?? null,
          chapter_plan: genChapterPlan ?? null,
          memory_query_text: genMemoryQueryText ?? null,
          memory_modules: genMemoryModules ?? null,
        },
      });
      toast.toastSuccess("已导出预览快照", requestId ?? undefined);
    } catch {
      toast.toastError("导出失败");
    }
  }, [
    budgetOverrideInputs,
    effectivePack,
    genChapterPlan,
    genInstruction,
    genMemoryModules,
    genMemoryQueryText,
    memoryInjectionEnabled,
    parsedBudgetOverrides,
    previewQueryText,
    previewSections,
    projectId,
    requestId,
    syncedAt,
    toast,
    vector.selectedVectorSources,
    vector.vectorNormalizedQueryText,
    vector.vectorPreprocessObs,
    vector.vectorQueryText,
    vector.vectorRawQueryText,
    vector.vectorRequestId,
    vector.vectorResult,
  ]);

  const computeEffectiveQueryTextFromGenerate = useCallback((): string => {
    const requested = String(genMemoryQueryText ?? "").trim();
    if (requested) return requested;

    const instruction = String(genInstruction ?? "").trim();
    const plan = String(genChapterPlan ?? "").trim();
    if (!instruction && !plan) return "";
    return plan ? `${instruction}\n\n${plan}`.trim() : instruction;
  }, [genChapterPlan, genInstruction, genMemoryQueryText]);

  const isEmptyPack = useMemo(() => {
    const getTextMd = (raw: unknown): string => {
      if (!raw || typeof raw !== "object") return "";
      const o = raw as Record<string, unknown>;
      return typeof o.text_md === "string" ? o.text_md.trim() : "";
    };
    return (
      !getTextMd(effectivePack.worldbook) &&
      !getTextMd(effectivePack.story_memory) &&
      !getTextMd(effectivePack.semantic_history) &&
      !getTextMd(effectivePack.foreshadow_open_loops) &&
      !getTextMd(effectivePack.structured) &&
      !getTextMd(effectivePack.tables) &&
      !getTextMd(effectivePack.vector_rag) &&
      !getTextMd(effectivePack.graph) &&
      !getTextMd(effectivePack.fractal)
    );
  }, [effectivePack]);

  const packLogs = useMemo(() => {
    const rawLogs = Array.isArray(effectivePack.logs) ? effectivePack.logs : [];
    return rawLogs.map(normalizePackLogItem).filter((v): v is MemoryContextPackLogItem => Boolean(v));
  }, [effectivePack.logs]);

  const packLogStats = useMemo(() => {
    const enabledCount = packLogs.filter((it) => it.enabled).length;
    return { enabledCount, disabledCount: packLogs.length - enabledCount };
  }, [packLogs]);
  const headerMeta = useMemo<WritingDrawerMetaItem[]>(
    () => [
      {
        label: "资料注入",
        value: memoryInjectionEnabled ? "已启用" : "未启用",
        tone: memoryInjectionEnabled ? "success" : "warning",
      },
      {
        label: "预览结果",
        value: !memoryInjectionEnabled ? "暂未注入" : isEmptyPack ? "暂无命中片段" : "已有注入结果",
        tone: !memoryInjectionEnabled || isEmptyPack ? "warning" : "success",
      },
      {
        label: "定位编号",
        value: requestId ?? "尚未生成",
      },
    ],
    [isEmptyPack, memoryInjectionEnabled, requestId],
  );

  const loadContextOptimizerSetting = useCallback(async () => {
    if (!projectId) return;
    setContextOptimizerSettingsLoading(true);
    setContextOptimizerSettingsError(null);
    try {
      const res = await apiJson<{ settings: { context_optimizer_enabled?: unknown } }>(
        `/api/projects/${projectId}/settings`,
      );
      setContextOptimizerEnabled(Boolean(res.data?.settings?.context_optimizer_enabled));
    } catch (e) {
      if (e instanceof ApiError) {
        setContextOptimizerSettingsError({ code: e.code, message: e.message, requestId: e.requestId });
      } else {
        setContextOptimizerSettingsError({ code: "UNKNOWN", message: "加载失败" });
      }
      setContextOptimizerEnabled(null);
    } finally {
      setContextOptimizerSettingsLoading(false);
    }
  }, [projectId]);

  const fetchOptimizerCompare = useCallback(async () => {
    if (!projectId) return;
    if (!memoryInjectionEnabled) return;

    const values: Record<string, unknown> = {
      memory: effectivePack,
      memory_injection_enabled: Boolean(memoryInjectionEnabled),
    };

    setOptimizerCompareLoading(true);
    setOptimizerCompareError(null);
    try {
      const baselineRes = await apiJson<{ preview: unknown; render_log?: unknown }>(
        `/api/projects/${projectId}/prompt_preview`,
        {
          method: "POST",
          body: JSON.stringify({ task: "chapter_generate", values: { ...values, context_optimizer_enabled: false } }),
        },
      );
      const optimizedRes = await apiJson<{ preview: unknown; render_log?: unknown }>(
        `/api/projects/${projectId}/prompt_preview`,
        {
          method: "POST",
          body: JSON.stringify({ task: "chapter_generate", values: { ...values, context_optimizer_enabled: true } }),
        },
      );

      const baselinePreview = baselineRes.data?.preview;
      const optimizedPreview = optimizedRes.data?.preview;
      const optimizerLog = normalizeContextOptimizerLog(optimizedRes.data?.render_log ?? null);

      setOptimizerCompare({
        baseline: {
          worldbook: getPromptPreviewBlockText(baselinePreview, "sys.memory.worldbook"),
          structured: getPromptPreviewBlockText(baselinePreview, "sys.memory.structured"),
        },
        optimized: {
          worldbook: getPromptPreviewBlockText(optimizedPreview, "sys.memory.worldbook"),
          structured: getPromptPreviewBlockText(optimizedPreview, "sys.memory.structured"),
        },
        optimizerLog,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setOptimizerCompareError({ code: e.code, message: e.message, requestId: e.requestId });
      } else {
        setOptimizerCompareError({ code: "UNKNOWN", message: "加载失败" });
      }
      setOptimizerCompare(null);
    } finally {
      setOptimizerCompareLoading(false);
    }
  }, [effectivePack, memoryInjectionEnabled, projectId]);

  const worldbookPreview = useMemo(() => {
    const raw = (effectivePack.worldbook ?? {}) as Record<string, unknown>;
    const triggered = Array.isArray(raw.triggered) ? raw.triggered : [];
    const textMd = typeof raw.text_md === "string" ? raw.text_md : "";
    const truncated = Boolean(raw.truncated);
    return { triggered, textMd, truncated, raw };
  }, [effectivePack.worldbook]);

  const fetchPreview = useCallback(
    async (params: { queryText: string; sections: MemorySectionEnabled; budgets: Record<string, number> }) => {
      if (!projectId) {
        setError({ code: "NO_PROJECT", message: UI_COPY.writing.contextPreviewMissingProjectId });
        return;
      }
      const safeQueryText = String(params.queryText ?? "").slice(0, 5000);
      setLoading(true);
      setError(null);
      try {
        const res = await apiJson<MemoryContextPack>(`/api/projects/${projectId}/memory/preview`, {
          method: "POST",
          body: JSON.stringify({
            query_text: safeQueryText,
            section_enabled: params.sections,
            budget_overrides: params.budgets,
          }),
        });
        setPack(res.data ?? EMPTY_PACK);
        setRequestId(res.request_id ?? null);
      } catch (e) {
        if (e instanceof ApiError) {
          setError({ code: e.code, message: e.message, requestId: e.requestId });
        } else {
          setError({ code: "UNKNOWN", message: "加载失败" });
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  const syncPreviewFromGenerate = useCallback(async () => {
    const queryText = computeEffectiveQueryTextFromGenerate();
    const sections: MemorySectionEnabled = { ...DEFAULT_PREVIEW_SECTIONS, ...(genMemoryModules ?? {}) };
    setPreviewQueryText(queryText);
    setPreviewSections(sections);
    setBudgetOverrideInputs(DEFAULT_BUDGET_INPUTS);
    setSyncedAt(new Date().toISOString().replace("T", " ").slice(0, 19));
    await fetchPreview({ queryText, sections, budgets: {} });
  }, [computeEffectiveQueryTextFromGenerate, fetchPreview, genMemoryModules]);

  const load = useCallback(async () => {
    if (!projectId) {
      setError({ code: "NO_PROJECT", message: UI_COPY.writing.contextPreviewMissingProjectId });
      return;
    }
    await fetchPreview({ queryText: previewQueryText, sections: previewSections, budgets: parsedBudgetOverrides });
  }, [fetchPreview, parsedBudgetOverrides, previewQueryText, previewSections, projectId]);

  useEffect(() => {
    if (!open) return;
    if (!memoryInjectionEnabled) return;
    if (syncedOnceRef.current) return;
    syncedOnceRef.current = true;
    void syncPreviewFromGenerate();
  }, [memoryInjectionEnabled, open, syncPreviewFromGenerate]);

  useEffect(() => {
    if (!open) return;
    void loadContextOptimizerSetting();
  }, [loadContextOptimizerSetting, open]);

  useEffect(() => {
    if (!open) return;
    if (!memoryInjectionEnabled) return;
    if (!contextOptimizerEnabled) {
      lastOptimizerCompareKeyRef.current = null;
      setOptimizerCompare(null);
      setOptimizerCompareError(null);
      setOptimizerCompareLoading(false);
      return;
    }
    const key = `${projectId ?? ""}:${requestId ?? ""}:${contextOptimizerEnabled ? "1" : "0"}`;
    if (!key.trim() || lastOptimizerCompareKeyRef.current === key) return;
    lastOptimizerCompareKeyRef.current = key;
    void fetchOptimizerCompare();
  }, [contextOptimizerEnabled, fetchOptimizerCompare, memoryInjectionEnabled, open, projectId, requestId]);

  useEffect(() => {
    if (open) return;
    syncedOnceRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (memoryInjectionEnabled) return;
    syncedOnceRef.current = false;
    setLoading(false);
    setError(null);
    setPack(EMPTY_PACK);
    setRequestId(null);
  }, [memoryInjectionEnabled, open]);

  useEffect(() => {
    if (!open) return;
    setOptimizerCompare(null);
    setOptimizerCompareError(null);
    setOptimizerCompareLoading(false);
    lastOptimizerCompareKeyRef.current = null;
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      panelClassName="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-canvas p-6 shadow-sm"
    >
      <WritingDrawerHeader
        titleId={titleId}
        kicker="参考资料预览"
        title={UI_COPY.writing.contextPreviewTitle}
        description="这里会展示生成前可能带入的参考资料与取材细节，帮助你判断“这次为什么会这样写”。优先看命中的资料，再看底层记录。"
        meta={headerMeta}
        actions={
          <>
            <button
              className="btn btn-secondary"
              disabled={!projectId}
              onClick={() => downloadPreviewBundle()}
              type="button"
            >
              下载预览快照
            </button>
            <button
              className="btn btn-secondary"
              disabled={loading || !memoryInjectionEnabled || !projectId}
              onClick={() => void load()}
              type="button"
            >
              {UI_COPY.writing.contextPreviewRefresh}
            </button>
            <button className="btn btn-secondary" aria-label="关闭" onClick={onClose} type="button">
              {UI_COPY.writing.contextPreviewClose}
            </button>
          </>
        }
        callout={
          <div>
            用途：预览生成前可能带入的参考资料与底层记录。风险：这里可能包含隐私或敏感内容，分享或截图前请先确认；导出的
            预览快照按设计不应包含 API Key，但分享前仍建议自行快速检索。
          </div>
        }
      />

      <div className="mt-5 grid gap-4">
        <WritingDrawerSection
          kicker="注入总开关"
          title="先确认这轮是否真的在带资料"
          copy="如果这里是关闭状态，下面的预览结果都会被清空。通常先在这里确认，再继续看命中的各个资料模块。"
        >
          <label className="flex items-center justify-between gap-3 text-sm text-ink">
            <span>{UI_COPY.writing.memoryInjectionToggle}</span>
            <input
              className="checkbox"
              checked={memoryInjectionEnabled}
              disabled={!onChangeMemoryInjectionEnabled}
              onChange={(e) => onChangeMemoryInjectionEnabled?.(e.target.checked)}
              type="checkbox"
            />
          </label>
          <div className="mt-1 text-[11px] text-subtext">
            {memoryInjectionEnabled
              ? UI_COPY.writing.memoryInjectionHint
              : UI_COPY.writing.memoryInjectionDisabledPreview}
          </div>
          {memoryInjectionEnabled && packLogs.length ? (
            <div className="mt-2 text-[11px] text-subtext">
              模块状态：已启用 {packLogStats.enabledCount} 项，已关闭 {packLogStats.disabledCount} 项；展开下方模块状态可查看原因。
            </div>
          ) : null}
        </WritingDrawerSection>

        {memoryInjectionEnabled ? (
          <WritingDrawerSection
            kicker="预览控制"
            title="让预览尽量贴近真实生成"
            copy="可以从当前生成设置同步，也可以手动改查询语句、资料模块和预算覆盖，观察上下文会怎样变化。"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-ink">这次预览会怎么取资料</div>
                <div className="mt-1 text-[11px] text-subtext">
                  当前预览会尽量与「AI 起草」抽屉保持一致；如需排查，也可以手动调整后再刷新。
                  {syncedAt ? <span className="ml-2">最近同步：{syncedAt}</span> : null}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                disabled={loading || !projectId}
                onClick={() => void syncPreviewFromGenerate()}
                type="button"
              >
                同步生成设置
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="text-xs text-subtext">
                这次想写什么
                <textarea
                  className="textarea mt-1 min-h-24 w-full"
                  name="memory_preview_query_text"
                  value={previewQueryText}
                  placeholder="例如：本章要写的角色、地点、冲突，或你想优先核对的设定"
                  onChange={(e) => setPreviewQueryText(e.target.value)}
                />
                <div className="mt-1 text-[11px] text-subtext">
                  这会作为本次取材问题，驱动相关记忆与资料召回；排查时对应字段名是 `memory_query_text`。
                </div>
              </label>

              <div className="grid gap-2">
                <div className="text-xs text-subtext">要预览哪些资料模块</div>
                {(
                  [
                    ["worldbook", getWritingMemoryModuleLabel("worldbook")],
                    ["story_memory", getWritingMemoryModuleLabel("story_memory")],
                    ["semantic_history", getWritingMemoryModuleLabel("semantic_history")],
                    ["foreshadow_open_loops", getWritingMemoryModuleLabel("foreshadow_open_loops")],
                    ["structured", getWritingMemoryModuleLabel("structured")],
                    ["tables", getWritingMemoryModuleLabel("tables")],
                    ["vector_rag", getWritingMemoryModuleLabel("vector_rag")],
                    ["graph", getWritingMemoryModuleLabel("graph")],
                    ["fractal", getWritingMemoryModuleLabel("fractal")],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-3 text-sm text-ink">
                    <span>{label}</span>
                    <input
                      className="checkbox"
                      checked={previewSections[key]}
                      onChange={(e) => setPreviewSections((prev) => ({ ...prev, [key]: e.target.checked }))}
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>

              <FeedbackDisclosure
                className="drawer-workbench-disclosure"
                summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                title="高级：临时调整各模块预算"
              >
                <div className="mt-3 grid gap-2">
                  {(
                    [
                      ["worldbook", "世界书字数预算"],
                      ["story_memory", "剧情记忆字数预算"],
                      ["semantic_history", "语义历史字数预算"],
                      ["foreshadow_open_loops", "未回收伏笔字数预算"],
                      ["structured", "结构化资料字数预算"],
                      ["tables", "表格系统字数预算"],
                      ["vector_rag", "资料召回字数预算"],
                      ["graph", "关系图字数预算"],
                      ["fractal", "剧情脉络字数预算"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="grid gap-1 text-xs text-subtext">
                      <span>{label}</span>
                      <input
                        className="input"
                        inputMode="numeric"
                        placeholder="留空=默认"
                        value={budgetOverrideInputs[key]}
                        onChange={(e) =>
                          setBudgetOverrideInputs((prev) => ({
                            ...prev,
                            [key]: e.currentTarget.value.replace(/[^\d]/g, ""),
                          }))
                        }
                      />
                    </label>
                  ))}
                  <div className="text-[11px] text-subtext">
                    这里只影响本次预览，不会改变真实生成时的资料预算；排查时对应字段名是 `budget_overrides`。
                  </div>
                </div>
              </FeedbackDisclosure>
            </div>
          </WritingDrawerSection>
        ) : null}

        {loading ? <div className="text-sm text-subtext">{UI_COPY.common.loading}</div> : null}
        {error ? (
          <FeedbackCallout tone="danger" title={UI_COPY.writing.contextPreviewLoadFailedTitle}>
            {error.message} ({error.code})
            {error.requestId ? <span className="ml-2">定位编号: {error.requestId}</span> : null}
          </FeedbackCallout>
        ) : null}

        {memoryInjectionEnabled && isEmptyPack ? (
          <FeedbackEmptyState
            variant="compact"
            kicker="当前状态"
            title="暂无命中片段"
            description={UI_COPY.writing.memoryPackEmpty}
          />
        ) : null}

        {memoryInjectionEnabled ? (
          <WritingDrawerSection
            kicker="模块状态"
            title="看看哪些资料模块真的参与了注入"
            copy="这里最适合先排查“为什么某类资料没有被带上”或“为什么某模块被系统自动关闭”。"
          >
            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-sm text-ink hover:text-ink"
              title="展开查看每个资料模块的状态"
            >
              {packLogs.length ? (
                <div className="mt-3 grid gap-2">
                  {packLogs.map((it) => (
                    <div key={it.section} className="rounded-atelier border border-border bg-surface p-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-ink">
                          {formatSectionLabel(it.section)}
                          <span className="ml-2 font-mono text-[11px] text-subtext">{it.section}</span>
                        </span>
                        {it.enabled ? (
                          <span className="text-success">已启用</span>
                        ) : (
                          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
                            已关闭：{it.disabled_reason ?? "未知原因"}
                          </span>
                        )}
                      </div>
                      {it.note ? <div className="mt-1 text-[11px] text-subtext">{it.note}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <FeedbackEmptyState
                  variant="compact"
                  kicker="模块状态"
                  title="暂无模块日志"
                  description="本次预览还没有返回逐模块日志，稍后刷新或重新触发预览再看。"
                  className="mt-3"
                />
              )}
            </FeedbackDisclosure>
          </WritingDrawerSection>
        ) : null}

        {memoryInjectionEnabled ? (
          <WritingDrawerSection
            kicker="原始数据"
            title="需要深挖时再看底层记录"
            copy="优先用顶部按钮下载完整预览快照。这里只有在复制粘贴排查信息时才建议打开。"
          >
            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-sm text-ink hover:text-ink"
              title="展开底层记录（JSON）"
            >
              <div className="mt-3 text-xs text-subtext">
                建议优先用顶部「下载预览快照」导出文件。需要复制粘贴时，可用下方按钮。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    void (async () => {
                      try {
                        await writeClipboardText(JSON.stringify(effectivePack ?? EMPTY_PACK, null, 2));
                        toast.toastSuccess("已复制注入结果底层记录");
                      } catch {
                        toast.toastError("复制失败");
                      }
                    })();
                  }}
                  type="button"
                >
                  复制注入结果底层记录
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    void (async () => {
                      try {
                        await writeClipboardText(
                          JSON.stringify(
                            {
                              query_text: previewQueryText,
                              sections: previewSections,
                              budget_overrides: parsedBudgetOverrides,
                              budget_override_inputs: budgetOverrideInputs,
                              memory_injection_enabled: memoryInjectionEnabled,
                            },
                            null,
                            2,
                          ),
                        );
                        toast.toastSuccess("已复制预览设置底层记录");
                      } catch {
                        toast.toastError("复制失败");
                      }
                    })();
                  }}
                  type="button"
                >
                  复制预览设置底层记录
                </button>
              </div>

              <pre className="mt-3 max-h-64 overflow-auto rounded-atelier border border-border bg-surface p-3 text-xs text-ink">
                {JSON.stringify(
                  {
                    query_text: previewQueryText,
                    sections: previewSections,
                    budget_overrides: parsedBudgetOverrides,
                    memory_injection_enabled: memoryInjectionEnabled,
                  },
                  null,
                  2,
                )}
              </pre>
            </FeedbackDisclosure>
          </WritingDrawerSection>
        ) : null}

        {memoryInjectionEnabled ? (
          <WritingDrawerSection
            kicker="上下文裁剪"
            title="上下文裁剪前后对比"
            copy="当你怀疑注入资料太长、太杂或被裁坏时，再看这里。它会比较优化前后送进提示词的差异。"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-ink">上下文裁剪器（Context Optimizer）</div>
              <button
                className="btn btn-ghost px-2 py-1 text-xs"
                disabled={contextOptimizerSettingsLoading}
                onClick={() => void loadContextOptimizerSetting()}
                type="button"
              >
                刷新状态
              </button>
            </div>
            <div className="mt-1 text-[11px] text-subtext">
              当前状态：{" "}
              {contextOptimizerSettingsLoading
                ? "读取中…"
                : contextOptimizerEnabled === null
                  ? "暂未确定"
                  : contextOptimizerEnabled
                    ? "已启用"
                    : "未启用"}
            </div>
            {contextOptimizerSettingsError ? (
              <FeedbackCallout className="mt-2" tone="danger" title="裁剪器状态加载失败">
                状态读取失败：{contextOptimizerSettingsError.message} ({contextOptimizerSettingsError.code})
                {contextOptimizerSettingsError.requestId ? (
                  <span className="ml-2">定位编号: {contextOptimizerSettingsError.requestId}</span>
                ) : null}
              </FeedbackCallout>
            ) : null}

            {contextOptimizerEnabled ? (
              <div className="mt-3 grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-subtext">基于提示词预演的前后对比（sys.memory.*）</div>
                  <button
                    className="btn btn-ghost px-2 py-1 text-xs"
                    disabled={optimizerCompareLoading}
                    onClick={() => {
                      lastOptimizerCompareKeyRef.current = null;
                      void fetchOptimizerCompare();
                    }}
                    type="button"
                  >
                    刷新对比
                  </button>
                </div>

                {optimizerCompareLoading ? <div className="text-xs text-subtext">{UI_COPY.common.loading}</div> : null}
                {optimizerCompareError ? (
                  <FeedbackCallout tone="danger" title="裁剪前后对比失败">
                    对比失败：{optimizerCompareError.message} ({optimizerCompareError.code})
                    {optimizerCompareError.requestId ? (
                      <span className="ml-2">定位编号: {optimizerCompareError.requestId}</span>
                    ) : null}
                  </FeedbackCallout>
                ) : null}

                {optimizerCompare?.optimizerLog ? (
                  <div className="rounded-atelier border border-border bg-surface p-3">
                    <div className="text-xs text-ink">
                      预计节省字量：{" "}
                      <span className="font-mono">{optimizerCompare.optimizerLog.saved_tokens_estimate}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-subtext">
                      发生变化的片段：{" "}
                      <span className="font-mono">
                        {optimizerCompare.optimizerLog.blocks.filter((b) => b.changed).length}/
                        {optimizerCompare.optimizerLog.blocks.length}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2">
                      {optimizerCompare.optimizerLog.blocks.map((b) => (
                        <div key={b.identifier} className="rounded-atelier border border-border bg-surface p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-ink">
                              {formatOptimizerBlockLabel(b.identifier)}
                            </span>
                            <span className="font-mono text-subtext">
                              {b.before_tokens} → {b.after_tokens}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-subtext">
                            {b.changed ? "已裁剪" : "未变化"}
                            {formatContextOptimizerDetails(b.details) ? (
                              <span className="ml-2 font-mono">{formatContextOptimizerDetails(b.details)}</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {optimizerCompare ? (
                  <FeedbackDisclosure
                    className="drawer-workbench-disclosure"
                    summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                    title="展开查看优化前后差异（世界书 / 结构化记忆）"
                  >
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-[11px] text-subtext">优化前</div>
                        <pre className="mt-1 max-h-64 overflow-auto rounded-atelier border border-border bg-surface p-3 text-xs text-ink">
                          {`${optimizerCompare.baseline.worldbook || "（世界书为空）"}\n\n${optimizerCompare.baseline.structured || "（结构化资料为空）"}`}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[11px] text-subtext">优化后</div>
                        <pre className="mt-1 max-h-64 overflow-auto rounded-atelier border border-border bg-surface p-3 text-xs text-ink">
                          {`${optimizerCompare.optimized.worldbook || "（世界书为空）"}\n\n${optimizerCompare.optimized.structured || "（结构化资料为空）"}`}
                        </pre>
                      </div>
                    </div>
                  </FeedbackDisclosure>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 text-xs text-subtext">
                未启用时不会执行对比请求。可在设置页开启后，再回来查看摘要和前后差异。
              </div>
            )}
          </WritingDrawerSection>
        ) : null}

        {memoryInjectionEnabled ? (
          <WritingDrawerSection
            kicker="正文注入"
            title="逐模块查看最终写入提示词的正文"
            copy="这里最适合核对“某段资料最终被压成了什么样”。如果生成结果和预期不一致，通常先看这里，再回头查原始条目。"
          >
            {(
              [
                ["story_memory", "剧情记忆"],
                ["semantic_history", "语义历史"],
                ["foreshadow_open_loops", "未回收伏笔"],
                ["structured", "结构化资料"],
                ["graph", "关系图摘要"],
                ["fractal", "剧情脉络"],
              ] as const
            ).map(([key, label]) => {
              const raw = (effectivePack[key] ?? {}) as Record<string, unknown>;
              const textMd = typeof raw.text_md === "string" ? raw.text_md : "";
              return (
                <FeedbackDisclosure
                  key={key}
                  className="drawer-workbench-disclosure mt-3"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title={`${label} 正文（${key}.text_md）`}
                >
                  <div className="mt-2 flex justify-end">
                    <button
                      className="btn btn-ghost px-2 py-1 text-xs"
                      onClick={() => {
                        void (async () => {
                          try {
                            await writeClipboardText(textMd || "");
                            toast.toastSuccess("已复制注入正文");
                          } catch {
                            toast.toastError("复制失败");
                          }
                        })();
                      }}
                      type="button"
                    >
                      复制
                    </button>
                  </div>
                  <pre className="drawer-workbench-codeblock mt-2">{textMd || "（空）"}</pre>
                </FeedbackDisclosure>
              );
            })}
          </WritingDrawerSection>
        ) : null}

        {memoryInjectionEnabled ? (
          <WritingDrawerSection
            kicker="表格注入"
            title="检查数值表格被压缩成了什么"
            copy="当人物属性、进度、规则或资源表会影响这次写作时，先看这里是否真的被带进了提示词。"
          >
            {(() => {
              const raw = (effectivePack.tables ?? {}) as Record<string, unknown>;
              const enabled = Boolean(raw.enabled);
              const disabledReason = typeof raw.disabled_reason === "string" ? raw.disabled_reason : null;
              const truncated = Boolean(raw.truncated);
              const textMd = typeof raw.text_md === "string" ? raw.text_md : "";
              const errorCode = typeof raw.error === "string" ? raw.error : null;
              const counts =
                raw.counts && typeof raw.counts === "object" ? (raw.counts as Record<string, unknown>) : {};
              const rawTables = typeof counts.tables === "number" ? counts.tables : Number(counts.tables ?? 0);
              const rawRows = typeof counts.rows === "number" ? counts.rows : Number(counts.rows ?? 0);
              const tablesCount = Number.isFinite(rawTables) ? rawTables : 0;
              const rowsCount = Number.isFinite(rawRows) ? rawRows : 0;

              return (
                <>
                  <div className="drawer-workbench-subcard">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="text-sm text-ink">数值表格（sys.memory.tables）</div>
                      <div className="drawer-workbench-chip-row">
                        <span>{enabled ? "已启用" : `已关闭：${disabledReason ?? "未知原因"}`}</span>
                        <span>表格：{tablesCount}</span>
                        <span>行数：{rowsCount}</span>
                        <span>已截断：{truncated ? "是" : "否"}</span>
                      </div>
                    </div>
                    {errorCode ? (
                      <FeedbackCallout className="mt-2" tone="danger" title="数值表格注入异常">
                        错误代码：{errorCode}
                      </FeedbackCallout>
                    ) : null}
                  </div>
                  <FeedbackDisclosure
                    className="drawer-workbench-disclosure mt-3"
                    summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                    title="数值表格正文（tables.text_md）"
                  >
                    <div className="mt-2 flex justify-end">
                      <button
                        className="btn btn-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          void (async () => {
                            try {
                              await writeClipboardText(textMd || "");
                              toast.toastSuccess("已复制数值表格正文");
                            } catch {
                              toast.toastError("复制失败");
                            }
                          })();
                        }}
                        type="button"
                      >
                      复制
                    </button>
                  </div>
                  <pre className="drawer-workbench-codeblock mt-2">{textMd || "（空）"}</pre>
                  </FeedbackDisclosure>
                </>
              );
            })()}
          </WritingDrawerSection>
        ) : null}

        {memoryInjectionEnabled ? (
          <WritingDrawerSection
            kicker="原始条目"
            title="查看语义历史与未回收伏笔的原始条目"
            copy="当你怀疑系统抓错了历史片段，或者伏笔状态不对，这里能直接看到模块返回的原始条目数组。"
          >
            <div className="grid gap-3">
              {(["semantic_history", "foreshadow_open_loops"] as const).map((key) => {
                const raw = (effectivePack[key] ?? {}) as Record<string, unknown>;
                const enabled = Boolean(raw.enabled);
                const disabledReason = typeof raw.disabled_reason === "string" ? raw.disabled_reason : null;
                const items = Array.isArray(raw.items) ? raw.items : [];
                return (
                  <FeedbackDisclosure
                    key={key}
                    className="drawer-workbench-disclosure"
                    summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                    title={`${formatSectionLabel(key)}原始条目（${key}.items，${items.length}）${enabled ? "" : ` — 已关闭：${disabledReason ?? "未知原因"}`}`}
                  >
                    <div className="mt-2 flex justify-end">
                      <button
                        className="btn btn-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          void (async () => {
                            try {
                              await writeClipboardText(JSON.stringify(items, null, 2));
                              toast.toastSuccess("已复制原始条目 JSON");
                            } catch {
                              toast.toastError("复制失败");
                            }
                          })();
                        }}
                        type="button"
                    >
                        复制底层记录
                      </button>
                    </div>
                  {items.length === 0 ? (
                      <FeedbackEmptyState
                        variant="compact"
                        kicker="原始条目"
                        title="当前为空"
                        description="这次没有返回可展示的原始条目，先检查模块状态或查询范围。"
                        className="mt-2"
                      />
                    ) : (
                      <pre className="drawer-workbench-codeblock mt-2">{JSON.stringify(items, null, 2)}</pre>
                    )}
                  </FeedbackDisclosure>
                );
              })}
            </div>
          </WritingDrawerSection>
        ) : null}

        {memoryInjectionEnabled ? (
          <WorldbookPreviewPanel effectivePack={effectivePack} worldbookPreview={worldbookPreview} />
        ) : null}

        <VectorRagDebugPanel projectId={projectId} toast={toast} vector={vector} />
      </div>
    </Drawer>
  );
}
