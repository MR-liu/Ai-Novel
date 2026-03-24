import { useCallback, useEffect, useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { GenerateForm } from "./types";
import type { LLMPreset } from "../../types";
import { ApiError, apiJson } from "../../services/apiClient";
import { Drawer } from "../ui/Drawer";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../ui/Feedback";
import { useToast } from "../ui/toast";
import { buildMcpResearchPayload } from "./mcpResearch";
import {
  getWritingMemoryModuleLabel,
  WRITING_RESEARCH_COPY,
} from "./writingModuleLabels";
import {
  WritingDrawerHeader,
  WritingDrawerSection,
  type WritingDrawerMetaItem,
} from "./WritingDrawerWorkbench";

type Props = {
  open: boolean;
  onClose: () => void;
  chapterId?: string;
  chapterPlan?: string;
  draftContentMd?: string;
  preset: LLMPreset | null;
  generating: boolean;
  genForm: GenerateForm;
  setGenForm: Dispatch<SetStateAction<GenerateForm>>;
  onGenerate: (
    mode: "replace" | "append",
    overrides?: { macro_seed?: string | null; prompt_override?: GenerateForm["prompt_override"] },
  ) => Promise<void>;
};

type PrecheckMessage = { role: string; content: string; name?: string | null };

type Precheck = {
  task: string;
  macro_seed: string;
  prompt_system: string;
  prompt_user: string;
  messages: PrecheckMessage[];
  render_log: unknown;
  memory_pack?: unknown;
  memory_injection_config?: unknown;
  memory_retrieval_log_json?: unknown;
  mcp_research?: {
    enabled?: boolean;
    applied?: boolean;
    allowlist?: string[];
    tool_run_ids?: string[];
    warnings?: string[];
  } | null;
  prompt_overridden: boolean;
};

function createMacroSeed(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `seed:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function extractTextMdFromPackSection(pack: unknown, section: string): string {
  if (!pack || typeof pack !== "object") return "";
  const o = pack as Record<string, unknown>;
  const raw = o[section];
  if (!raw || typeof raw !== "object") return "";
  const s = raw as Record<string, unknown>;
  const textMd = s.text_md;
  return typeof textMd === "string" ? textMd : "";
}

function formatPackSectionLabel(section: string): string {
  return getWritingMemoryModuleLabel(section);
}

function compactPreview(text: string | null | undefined, limit = 120): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

export function PromptInspectorDrawer(props: Props) {
  const { open, onClose, preset, chapterId, chapterPlan, draftContentMd, genForm, setGenForm, onGenerate } = props;
  const toast = useToast();
  const titleId = useId();
  const loadedOnceRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<Precheck | null>(null);
  const [error, setError] = useState<{ code: string; message: string; requestId?: string } | null>(null);
  const [mode, setMode] = useState<"replace" | "append">("replace");

  const [overrideSystem, setOverrideSystem] = useState("");
  const [overrideUser, setOverrideUser] = useState("");

  const overrideEnabled = genForm.prompt_override != null;

  const effectiveMacroSeed = useMemo(() => {
    const seed = typeof genForm.macro_seed === "string" ? genForm.macro_seed.trim() : "";
    return seed || null;
  }, [genForm.macro_seed]);

  const currentDraftTail = useMemo(() => {
    if (mode !== "append") return null;
    const md = String(draftContentMd ?? "");
    return md.trimEnd().slice(-1200) || null;
  }, [draftContentMd, mode]);

  const loadPrecheck = useCallback(async () => {
    if (!chapterId) {
      setError({ code: "NO_CHAPTER", message: "未选择章节" });
      return;
    }
    if (!preset) {
      setError({ code: "NO_PRESET", message: "请先在 AI 工作室保存默认调用设置" });
      return;
    }
    if (genForm.plan_first) {
      setError({ code: "UNSUPPORTED", message: "预检不支持“先生成规划”（plan_first）" });
      return;
    }

    const macroSeed = effectiveMacroSeed ?? createMacroSeed();
    if (!effectiveMacroSeed) {
      setGenForm((v) => ({ ...v, macro_seed: macroSeed }));
    }

    const safeTargetWordCount =
      typeof genForm.target_word_count === "number" && genForm.target_word_count >= 100
        ? genForm.target_word_count
        : null;
    const mcpResearch = buildMcpResearchPayload({
      enabled: genForm.mcp_research.enabled,
      toolNames: genForm.mcp_research.tool_names,
      instruction: genForm.instruction,
      memoryQueryText: genForm.memory_query_text,
      chapterPlan: chapterPlan ?? "",
    });

    const payload = {
      mode,
      instruction: genForm.instruction,
      target_word_count: safeTargetWordCount,
      plan_first: false,
      post_edit: genForm.post_edit,
      post_edit_sanitize: genForm.post_edit_sanitize,
      content_optimize: genForm.content_optimize,
      macro_seed: macroSeed,
      ...(genForm.prompt_override != null ? { prompt_override: genForm.prompt_override } : {}),
      style_id: genForm.style_id,
      memory_injection_enabled: genForm.memory_injection_enabled,
      memory_query_text: genForm.memory_query_text.trim() ? genForm.memory_query_text : null,
      ...(mcpResearch ? { mcp_research: mcpResearch } : {}),
      memory_modules: genForm.memory_modules,
      context: {
        include_world_setting: genForm.context.include_world_setting,
        include_style_guide: genForm.context.include_style_guide,
        include_constraints: genForm.context.include_constraints,
        include_outline: genForm.context.include_outline,
        include_smart_context: genForm.context.include_smart_context,
        require_sequential: genForm.context.require_sequential,
        character_ids: genForm.context.character_ids,
        previous_chapter: genForm.context.previous_chapter === "none" ? null : genForm.context.previous_chapter,
        current_draft_tail: currentDraftTail,
      },
    };

    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<{ precheck: Precheck }>(`/api/chapters/${chapterId}/generate-precheck`, {
        method: "POST",
        headers: { "X-LLM-Provider": preset.provider },
        body: JSON.stringify(payload),
      });
      setRequestId(res.request_id ?? null);
      setPrecheck(res.data.precheck);
      setOverrideSystem(res.data.precheck.prompt_system ?? "");
      setOverrideUser(res.data.precheck.prompt_user ?? "");
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, message: e.message, requestId: e.requestId });
      } else {
        setError({ code: "UNKNOWN", message: "加载失败" });
      }
      setPrecheck(null);
      setRequestId(null);
    } finally {
      setLoading(false);
    }
  }, [chapterId, chapterPlan, currentDraftTail, effectiveMacroSeed, genForm, mode, preset, setGenForm]);

  useEffect(() => {
    if (open) return;
    loadedOnceRef.current = false;
    setError(null);
    setRequestId(null);
    setPrecheck(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    void loadPrecheck();
  }, [loadPrecheck, open]);

  const clearOverride = useCallback(() => {
    setGenForm((v) => ({ ...v, prompt_override: null }));
    toast.toastSuccess("已回退默认提示词");
  }, [setGenForm, toast]);

  const executeOverride = useCallback(() => {
    if (!preset || !chapterId) return;
    const macroSeed = precheck?.macro_seed || effectiveMacroSeed || createMacroSeed();
    const promptOverride = { system: overrideSystem, user: overrideUser };
    setGenForm((v) => ({ ...v, macro_seed: macroSeed, prompt_override: promptOverride }));
    void onGenerate(mode, { macro_seed: macroSeed, prompt_override: promptOverride });
    onClose();
  }, [
    chapterId,
    effectiveMacroSeed,
    mode,
    onClose,
    onGenerate,
    overrideSystem,
    overrideUser,
    precheck?.macro_seed,
    preset,
    setGenForm,
  ]);

  const packTextBlocks = useMemo(() => {
    const pack = precheck?.memory_pack;
    if (!pack) return [];
    const sections = ["worldbook", "story_memory", "structured", "vector_rag", "graph", "fractal"];
    const out: Array<{ section: string; textMd: string }> = [];
    for (const s of sections) {
      const textMd = extractTextMdFromPackSection(pack, s);
      if (textMd.trim()) out.push({ section: s, textMd });
    }
    return out;
  }, [precheck?.memory_pack]);
  const promptSummary = useMemo(() => {
    const system = precheck?.prompt_system ?? "";
    const user = precheck?.prompt_user ?? "";
    const messages = precheck?.messages ?? [];
    return {
      systemLength: system.length,
      userLength: user.length,
      systemPreview: compactPreview(system),
      userPreview: compactPreview(user),
      messageCount: messages.length,
      hasRenderLog: precheck?.render_log != null,
    };
  }, [precheck?.messages, precheck?.prompt_system, precheck?.prompt_user, precheck?.render_log]);
  const injectionSummary = useMemo(
    () => ({
      enabled: genForm.memory_injection_enabled,
      sectionCount: packTextBlocks.length,
      sectionLabels: packTextBlocks.length
        ? packTextBlocks.map((item) => formatPackSectionLabel(item.section)).join("、")
        : "暂无可展示模块",
    }),
    [genForm.memory_injection_enabled, packTextBlocks],
  );
  const mcpSummary = useMemo(() => {
    const research = precheck?.mcp_research;
    const warningCount = research?.warnings?.length ?? 0;
    return {
      enabled: Boolean(research?.enabled),
      applied: Boolean(research?.applied),
      toolCount: research?.allowlist?.length ?? 0,
      toolsLabel: (research?.allowlist ?? []).join("、") || "（空）",
      warningCount,
    };
  }, [precheck?.mcp_research]);
  const headerMeta = useMemo<WritingDrawerMetaItem[]>(
    () => [
      { label: "检查模式", value: mode === "replace" ? "替换生成" : "追加生成" },
      {
        label: "提示词状态",
        value: overrideEnabled ? "已启用覆盖文本" : "使用默认提示词",
        tone: overrideEnabled ? "warning" : "success",
      },
      { label: "定位编号", value: requestId ?? "尚未生成" },
    ],
    [mode, overrideEnabled, requestId],
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      panelClassName="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-canvas p-6 shadow-sm"
    >
      <WritingDrawerHeader
        titleId={titleId}
        kicker="生成前检查"
        title="生成前检查"
        description="这里只检查本次生成真正会送进模型的上下文和提示词，不会直接调用 LLM；若启用 MCP，只会执行项目内只读资料收集。"
        meta={headerMeta}
        actions={
          <>
            {overrideEnabled ? (
              <button className="btn btn-secondary" disabled={loading} onClick={clearOverride} type="button">
                回退默认
              </button>
            ) : null}
            <button
              className="btn btn-secondary"
              disabled={loading || !preset || !chapterId}
              onClick={() => void loadPrecheck()}
              type="button"
            >
              刷新检查
            </button>
            <button className="btn btn-secondary" onClick={onClose} type="button">
              关闭
            </button>
          </>
        }
        callout={
          overrideEnabled ? (
            <FeedbackCallout className="text-sm" tone="warning" title="后续生成会沿用覆盖提示词">
              已启用覆盖提示词：后续生成会沿用覆盖文本，直到你明确回退默认。
            </FeedbackCallout>
          ) : (
            <FeedbackCallout className="text-sm" title="使用建议">
              建议在真正生成前先看一眼这里，尤其当你刚改了资料范围、提示词或 MCP 工具时。
            </FeedbackCallout>
          )
        }
      />

      {error ? (
        <FeedbackCallout className="mt-3" tone="danger" title="预检失败">
          {error.code}: {error.message}
          {error.requestId ? <span className="ml-2 text-[11px]">定位编号: {error.requestId}</span> : null}
        </FeedbackCallout>
      ) : null}

      <div className="mt-4 grid gap-4">
        <WritingDrawerSection kicker="执行参数" title="确认这次检查在看哪条链路" copy="这里显示替换/追加模式、当前任务和本次种子，帮助你确认当前看到的是不是预期分支。">
          <div className="drawer-workbench-subcard">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-ink">预检参数</div>
              <div className="flex items-center gap-3 text-xs text-subtext">
                <label className="flex items-center gap-2">
                  <input
                    className="radio"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                    type="radio"
                    name="prompt_inspector_mode"
                  />
                  替换
                </label>
                <label className="flex items-center gap-2">
                  <input
                    className="radio"
                    checked={mode === "append"}
                    onChange={() => setMode("append")}
                    type="radio"
                    name="prompt_inspector_mode"
                  />
                  追加
                </label>
              </div>
            </div>
            <div className="drawer-workbench-chip-row mt-3">
              {precheck?.macro_seed ? <span>本次种子（macro_seed）: {precheck.macro_seed}</span> : null}
              {precheck?.task ? <span>当前任务（task）: {precheck.task}</span> : null}
            </div>
          </div>
        </WritingDrawerSection>

        <WritingDrawerSection
          kicker="最终提示词"
          title="模型真正会看到的内容"
          copy="优先看系统提示词和用户提示词是否符合你的写作目标；只有有疑问时再往下展开消息记录和装配记录。"
        >
          <div className="result-overview-grid">
            <div className="result-overview-card is-emphasis">
              <div className="result-overview-label">系统提示词</div>
              <div className="result-overview-value">{promptSummary.systemLength} 字符</div>
              <div className="result-overview-copy">{promptSummary.systemPreview}</div>
            </div>
            <div className="result-overview-card">
              <div className="result-overview-label">用户提示词</div>
              <div className="result-overview-value">{promptSummary.userLength} 字符</div>
              <div className="result-overview-copy">{promptSummary.userPreview}</div>
            </div>
            <div className="result-overview-card">
              <div className="result-overview-label">消息与渲染</div>
              <div className="result-overview-value">
                {promptSummary.messageCount} 条消息 / {promptSummary.hasRenderLog ? "含渲染记录" : "无渲染记录"}
              </div>
              <div className="result-overview-copy">
                先确认系统提示词和用户提示词两段是否正确，再按需展开底层消息和装配记录。
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3">
            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title="系统提示词"
            >
              <pre className="drawer-workbench-codeblock mt-3">
                {precheck?.prompt_system ?? ""}
              </pre>
            </FeedbackDisclosure>
            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title="用户提示词"
            >
              <pre className="drawer-workbench-codeblock mt-3">
                {precheck?.prompt_user ?? ""}
              </pre>
            </FeedbackDisclosure>
            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title="调试与渲染细节"
            >
              <div className="text-xs leading-6 text-subtext">
                只有在你怀疑片段装配顺序、模板渲染或消息数组有问题时，再看这里。
              </div>
              <div className="debug-disclosure-stack">
                <FeedbackDisclosure
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title="展开完整消息记录（messages）"
                >
                  <pre className="drawer-workbench-codeblock mt-3">
                    {JSON.stringify(precheck?.messages ?? [], null, 2)}
                  </pre>
                </FeedbackDisclosure>
                <FeedbackDisclosure
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title="展开提示词装配记录（render_log）"
                >
                  <pre className="drawer-workbench-codeblock mt-3">
                    {JSON.stringify(precheck?.render_log ?? null, null, 2)}
                  </pre>
                </FeedbackDisclosure>
              </div>
            </FeedbackDisclosure>
          </div>
        </WritingDrawerSection>

        <WritingDrawerSection
          kicker="注入资料"
          title="这一轮会注入哪些参考段落"
          copy="如果你觉得生成结果跑偏，先看这里有没有带错资料，或者压根没有命中应该带上的信息。"
        >
          <div className="result-overview-grid">
            <div className="result-overview-card is-emphasis">
              <div className="result-overview-label">注入状态</div>
              <div className="result-overview-value">
                {injectionSummary.enabled ? "已启用记忆注入" : "未启用记忆注入"}
              </div>
              <div className="result-overview-copy">
                {injectionSummary.enabled
                  ? "生成时会尝试带入相关资料。"
                  : "当前不会把世界资料、记忆或召回内容送进模型。"}
              </div>
            </div>
            <div className="result-overview-card">
              <div className="result-overview-label">命中模块</div>
              <div className="result-overview-value">{injectionSummary.sectionCount} 个模块</div>
              <div className="result-overview-copy">{injectionSummary.sectionLabels}</div>
            </div>
            <div className="result-overview-card">
              <div className="result-overview-label">检查顺序</div>
              <div className="result-overview-value">先模块，再原文</div>
              <div className="result-overview-copy">
                先确认命中模块对不对，再展开具体段落，最后才看注入底层记录。
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {packTextBlocks.length === 0 ? (
              <FeedbackEmptyState
                variant="compact"
                kicker="当前状态"
                title={genForm.memory_injection_enabled ? "暂无可展示的注入段落" : "未启用记忆注入"}
                description={
                  genForm.memory_injection_enabled
                    ? "本次可能没有命中资料，或命中内容暂时为空。"
                    : "如果希望生成时带上资料参考，需要先开启记忆注入。"
                }
              />
            ) : (
              packTextBlocks.map((it) => (
                <FeedbackDisclosure
                  key={it.section}
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title={
                    <>
                      {formatPackSectionLabel(it.section)}
                      <span className="ml-2 font-mono text-[11px] text-subtext">{it.section}</span>
                    </>
                  }
                >
                  <pre className="drawer-workbench-codeblock mt-3">
                    {it.textMd}
                  </pre>
                </FeedbackDisclosure>
              ))
            )}

            <FeedbackDisclosure
              className="drawer-workbench-disclosure"
              summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
              title="调试：展开注入底层记录（memory_pack）"
            >
              <div className="mt-3 text-xs text-subtext">需要深挖排查时再看这份底层记录；首选还是先看上面的命中模块和注入正文。</div>
              <pre className="drawer-workbench-codeblock mt-3">
                {JSON.stringify(precheck?.memory_pack ?? null, null, 2)}
              </pre>
            </FeedbackDisclosure>
          </div>
        </WritingDrawerSection>

        <WritingDrawerSection
          kicker="工作室资料收集"
          title={WRITING_RESEARCH_COPY.mcpTitle}
          copy="这里只展示本次检查是否执行了资料收集工具（MCP）、使用了哪些工具，以及有没有提醒需要注意。"
        >
          <div className="result-overview-grid">
            <div className="result-overview-card is-emphasis">
              <div className="result-overview-label">执行状态</div>
              <div className="result-overview-value">
                {precheck?.mcp_research
                  ? mcpSummary.applied
                    ? "本次已执行"
                    : mcpSummary.enabled
                      ? "已启用但未执行"
                      : "未启用"
                  : "本次未启用"}
              </div>
              <div className="result-overview-copy">
                这里默认只显示结论，不把原始工具结果直接铺在首屏。
              </div>
            </div>
            <div className="result-overview-card">
              <div className="result-overview-label">工具数量</div>
              <div className="result-overview-value">{mcpSummary.toolCount} 个</div>
              <div className="result-overview-copy">{mcpSummary.toolsLabel}</div>
            </div>
            <div className="result-overview-card">
              <div className="result-overview-label">提醒数量</div>
              <div className="result-overview-value">{mcpSummary.warningCount} 条</div>
              <div className="result-overview-copy">
                {mcpSummary.warningCount ? "建议先看提醒，再决定是否继续生成。" : "当前没有额外提醒。"}
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {!precheck?.mcp_research ? (
              <FeedbackEmptyState
                variant="compact"
                kicker="当前状态"
                title={WRITING_RESEARCH_COPY.mcpEmptyTitle}
                description="如果你刚改过工具选择、资料范围或查询语句，可以在生成前重新打开它。"
              />
            ) : (
              <>
                <div className="drawer-workbench-subcard text-xs text-subtext">
                  <div className="text-sm text-ink">本次资料收集状态</div>
                  <div className="mt-2">
                    状态：{precheck.mcp_research.enabled ? "已启用" : "未启用"} | 本次：
                    {precheck.mcp_research.applied ? "已执行" : "未执行"}
                  </div>
                  <div className="mt-1">工具：{(precheck.mcp_research.allowlist ?? []).join("、") || "（空）"}</div>
                  <div className="mt-1">
                    运行记录：{(precheck.mcp_research.tool_run_ids ?? []).join("、") || "（空）"}
                  </div>
                  {(precheck.mcp_research.warnings ?? []).length > 0 ? (
                    <FeedbackCallout className="mt-2 text-xs" tone="warning" title="本次资料收集有提醒">
                      {(precheck.mcp_research.warnings ?? []).join("、")}
                    </FeedbackCallout>
                  ) : (
                    <div className="mt-1 text-subtext">本次没有额外提醒。</div>
                  )}
                </div>
                <FeedbackDisclosure
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title="调试：展开资料收集底层结果（mcp_research）"
                >
                  <div className="mt-3 text-xs text-subtext">只有在你怀疑工具选择、执行结果或提醒来源不对时，再看这份底层记录。</div>
                  <pre className="drawer-workbench-codeblock mt-3">
                    {JSON.stringify(precheck.mcp_research, null, 2)}
                  </pre>
                </FeedbackDisclosure>
              </>
            )}
          </div>
        </WritingDrawerSection>

        <WritingDrawerSection
          kicker="覆盖执行"
          title="必要时手动覆写提示词"
          copy="只有当你已经明确知道哪段提示词要改时再动这里。覆盖后，后续生成会继续沿用，直到你回退默认。"
        >
          <div className="mt-2 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-subtext">系统提示词覆盖文本</span>
              <textarea
                className="textarea min-h-[140px]"
                aria-label="prompt_override_system"
                disabled={loading || props.generating}
                value={overrideSystem}
                onChange={(e) => setOverrideSystem(e.currentTarget.value)}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-subtext">用户提示词覆盖文本</span>
              <textarea
                className="textarea min-h-[140px]"
                aria-label="prompt_override_user"
                disabled={loading || props.generating}
                value={overrideUser}
                onChange={(e) => setOverrideUser(e.currentTarget.value)}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="btn btn-primary"
                disabled={loading || props.generating || !preset || !chapterId || !precheck}
                onClick={() => void executeOverride()}
                type="button"
              >
                使用覆盖文本执行
              </button>
            </div>
            <div className="text-[11px] text-subtext">
              提示：使用覆盖后，“生成/追加生成”也会继续沿用覆盖文本，直到回退默认。
            </div>
          </div>
        </WritingDrawerSection>
      </div>
    </Drawer>
  );
}
