import { useCallback, useEffect, useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { Drawer } from "../ui/Drawer";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../ui/Feedback";
import { ProgressBar } from "../ui/ProgressBar";
import type { AppMode } from "../../contexts/AppModeContext";
import { UI_COPY } from "../../lib/uiCopy";
import type { Character, LLMPreset } from "../../types";
import type { GenerateForm } from "./types";
import { ApiError, apiJson } from "../../services/apiClient";
import { normalizeMcpToolSelection, type McpToolSpec } from "./mcpResearch";
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
  appMode: AppMode;
  open: boolean;
  generating: boolean;
  preset: LLMPreset | null;
  projectId?: string;
  activeChapter: boolean;
  dirty: boolean;
  saving?: boolean;
  genForm: GenerateForm;
  setGenForm: Dispatch<SetStateAction<GenerateForm>>;
  characters: Character[];
  streamProgress?: { message: string; progress: number; status: string; charCount?: number } | null;
  onClose: () => void;
  onSave: () => void | Promise<unknown>;
  onSaveAndGenerateNext?: () => void | Promise<unknown>;
  onGenerateAppend: () => void;
  onGenerateReplace: () => void;
  onCancelGenerate?: () => void;
  onOpenPromptInspector: () => void;
  postEditCompareAvailable?: boolean;
  onOpenPostEditCompare?: () => void;
  contentOptimizeCompareAvailable?: boolean;
  onOpenContentOptimizeCompare?: () => void;
};

type WritingStyle = {
  id: string;
  name: string;
  is_preset: boolean;
};

type McpToolsResponse = {
  tools: McpToolSpec[];
};

export function AiGenerateDrawer(props: Props) {
  const { onClose, open } = props;
  const studioMode = props.appMode === "studio";
  const streamProviderSupported = !!props.preset && props.preset.provider.startsWith("openai");
  const reliableTransportRequired =
    props.genForm.plan_first || props.genForm.post_edit || props.genForm.content_optimize;
  const autoReliableTransport = !props.genForm.stream && reliableTransportRequired;
  const titleId = useId();
  const advancedPanelId = useId();
  const hasPromptOverride = props.genForm.prompt_override != null;

  const [stylesLoading, setStylesLoading] = useState(false);
  const [presets, setPresets] = useState<WritingStyle[]>([]);
  const [userStyles, setUserStyles] = useState<WritingStyle[]>([]);
  const [projectDefaultStyleId, setProjectDefaultStyleId] = useState<string | null>(null);
  const [stylesError, setStylesError] = useState<ApiError | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mcpToolsLoading, setMcpToolsLoading] = useState(false);
  const [mcpTools, setMcpTools] = useState<McpToolSpec[]>([]);
  const [mcpToolsError, setMcpToolsError] = useState<ApiError | null>(null);

  const allStyles = useMemo(() => [...presets, ...userStyles], [presets, userStyles]);
  const projectDefaultStyle = useMemo(
    () => allStyles.find((s) => s.id === projectDefaultStyleId) ?? null,
    [allStyles, projectDefaultStyleId],
  );
  const availableMcpToolNames = useMemo(() => mcpTools.map((tool) => tool.name), [mcpTools]);
  const selectedMcpToolNames = useMemo(
    () => normalizeMcpToolSelection(props.genForm.mcp_research.tool_names, availableMcpToolNames),
    [availableMcpToolNames, props.genForm.mcp_research.tool_names],
  );
  const headerMeta = useMemo<WritingDrawerMetaItem[]>(
    () => [
      {
        label: "模型",
        value: props.preset ? `${props.preset.provider} / ${props.preset.model}` : "未加载 LLM 配置",
      },
      {
        label: "当前章节",
        value: props.activeChapter ? (props.dirty ? "有未保存修改" : "可以开始起草") : "请先选择章节",
        tone: props.activeChapter ? (props.dirty ? "warning" : "success") : "warning",
      },
      {
        label: "当前状态",
        value: props.generating ? "正在生成" : studioMode ? "工作室模式" : "专注模式",
      },
    ],
    [props.activeChapter, props.dirty, props.generating, props.preset, studioMode],
  );

  const closeDrawer = useCallback(() => {
    setAdvancedOpen(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer, open]);

  useEffect(() => {
    if (!open) return;
    if (!props.projectId) return;
    let cancelled = false;
    Promise.resolve()
      .then(async () => {
        if (cancelled) return null;
        setStylesLoading(true);
        setStylesError(null);
        const [presetRes, userRes, defRes] = await Promise.all([
          apiJson<{ styles: WritingStyle[] }>("/api/writing_styles/presets"),
          apiJson<{ styles: WritingStyle[] }>("/api/writing_styles"),
          apiJson<{ default: { style_id?: string | null } }>(`/api/projects/${props.projectId}/writing_style_default`),
        ]);
        return { presetRes, userRes, defRes };
      })
      .then((res) => {
        if (cancelled || !res) return;
        setPresets(res.presetRes.data.styles ?? []);
        setUserStyles(res.userRes.data.styles ?? []);
        setProjectDefaultStyleId(res.defRes.data.default?.style_id ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        setStylesError(err);
      })
      .finally(() => {
        if (cancelled) return;
        setStylesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, props.projectId]);

  useEffect(() => {
    if (!open) return;
    if (!studioMode) return;
    let cancelled = false;
    Promise.resolve()
      .then(async () => {
        if (cancelled) return null;
        setMcpToolsLoading(true);
        setMcpToolsError(null);
        return apiJson<McpToolsResponse>("/api/mcp/tools");
      })
      .then((res) => {
        if (cancelled || !res) return;
        const tools = res.data.tools ?? [];
        setMcpTools(tools);
        props.setGenForm((prev) => ({
          ...prev,
          mcp_research: {
            ...prev.mcp_research,
            tool_names: normalizeMcpToolSelection(prev.mcp_research.tool_names, tools.map((tool) => tool.name)),
          },
        }));
      })
      .catch((e) => {
        if (cancelled) return;
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        setMcpToolsError(err);
      })
      .finally(() => {
        if (!cancelled) setMcpToolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, props.setGenForm, studioMode]);

  return (
    <Drawer
      open={open}
      onClose={closeDrawer}
      side="bottom"
      ariaLabelledBy={titleId}
      panelClassName="h-[85vh] w-full overflow-y-auto rounded-atelier border-t border-border bg-canvas p-6 shadow-sm sm:h-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0"
    >
      <WritingDrawerHeader
        titleId={titleId}
        kicker="作者起草台"
        title="AI 起草"
        description="先告诉 AI 这一轮要写什么，再决定是否带上资料注入、生成前检查和后处理。首层只保留对作者真正重要的控制项。"
        meta={headerMeta}
        actions={
          <button className="btn btn-secondary" aria-label="关闭" onClick={closeDrawer} type="button">
            关闭
          </button>
        }
        callout={
          hasPromptOverride ? (
            <FeedbackCallout className="text-sm" tone="warning" title="本次会沿用覆盖提示词">
              已启用提示词覆盖：本次生成会使用覆盖文本，可在“生成前检查”里回退默认。
            </FeedbackCallout>
          ) : autoReliableTransport ? (
            <FeedbackCallout className="text-sm" title="已自动切换到更稳的链路">
              已为规划、润色或正文优化自动启用更稳的可靠链路，尽量避免流式过程中超时。
            </FeedbackCallout>
          ) : (
            <FeedbackCallout className="text-sm" title="使用建议">
              建议先把这里的起草意图和资料范围定稳，再进入更深的工作室级调试。
            </FeedbackCallout>
          )
        }
      />

      <div className="mt-5 grid gap-4">
        <WritingDrawerSection
          kicker="起草输入"
          title="告诉 AI 这一轮要写什么"
          copy="这里决定写作意图、目标字数和风格基调，是本次起草最关键的一层。"
        >
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-subtext">用户指令</span>
              <textarea
                className="textarea atelier-content"
                disabled={props.generating}
                name="instruction"
                rows={5}
                value={props.genForm.instruction}
                onChange={(e) => {
                  const value = e.target.value;
                  props.setGenForm((v) => ({ ...v, instruction: value }));
                }}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-subtext">目标字数（中文按字数=字符数）</span>
              <input
                className="input"
                disabled={props.generating}
                min={100}
                name="target_word_count"
                type="number"
                value={props.genForm.target_word_count ?? ""}
                onChange={(e) => {
                  const next = e.currentTarget.valueAsNumber;
                  props.setGenForm((v) => ({ ...v, target_word_count: Number.isNaN(next) ? null : next }));
                }}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-subtext">风格</span>
              <select
                className="select"
                disabled={props.generating || stylesLoading}
                name="style_id"
                value={props.genForm.style_id ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  props.setGenForm((v) => ({ ...v, style_id: value ? value : null }));
                }}
                aria-label="gen_style_id"
              >
                <option value="">自动（使用项目默认）</option>
                <optgroup label="系统预设">
                  {presets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="我的风格">
                  {userStyles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <div className="text-[11px] text-subtext">
                项目默认：{projectDefaultStyle ? projectDefaultStyle.name : "（未设置）"}
                {stylesError ? ` | 加载失败：${stylesError.code}` : ""}
              </div>
            </label>
          </div>
        </WritingDrawerSection>

        <WritingDrawerSection
          kicker="资料注入"
          title="决定这次生成要带哪些长期资料"
          copy="只影响这一轮起草。留空时会自动用“用户指令 + 当前章节计划”构造取材问题。"
        >

          <div className="mt-3">
            <label className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>{UI_COPY.writing.memoryInjectionToggle}</span>
              <input
                className="checkbox"
                checked={props.genForm.memory_injection_enabled}
                disabled={props.generating}
                name="memory_injection_enabled"
                onChange={(e) => {
                  const checked = e.target.checked;
                  props.setGenForm((v) => ({ ...v, memory_injection_enabled: checked }));
                }}
                type="checkbox"
              />
            </label>
            <div className="mt-1 text-[11px] text-subtext">{UI_COPY.writing.memoryInjectionHint}</div>

            {props.genForm.memory_injection_enabled ? (
              <div className="mt-2 rounded-atelier border border-border bg-surface p-3">
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">记忆查询关键词（可选）</span>
                  <input
                    className="input"
                    disabled={props.generating}
                    aria-label="memory_query_text"
                    value={props.genForm.memory_query_text}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      props.setGenForm((v) => ({ ...v, memory_query_text: value }));
                    }}
                  />
                </label>
                <div className="mt-1 text-[11px] text-subtext">留空时会自动使用“用户指令 + 章节计划”。</div>

                <div className="mt-3 grid gap-2">
                  <div className="text-xs text-subtext">注入模块</div>
                  <div className="text-[11px] text-subtext">会影响本次生成提示词，并同步到「上下文预览」。</div>

                  <label className="flex items-center justify-between gap-3 text-sm text-ink">
                    <span>世界书（worldbook）</span>
                    <input
                      className="checkbox"
                      checked={props.genForm.memory_modules.worldbook}
                      disabled={props.generating}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        props.setGenForm((v) => ({
                          ...v,
                          memory_modules: { ...v.memory_modules, worldbook: checked },
                        }));
                      }}
                      type="checkbox"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 text-sm text-ink">
                    <span>表格系统（tables）</span>
                    <input
                      className="checkbox"
                      checked={props.genForm.memory_modules.tables}
                      disabled={props.generating}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        props.setGenForm((v) => ({
                          ...v,
                          memory_modules: { ...v.memory_modules, tables: checked },
                        }));
                      }}
                      type="checkbox"
                    />
                  </label>

                  <FeedbackDisclosure
                    className="drawer-workbench-disclosure"
                    summaryClassName="cursor-pointer text-sm text-ink"
                    title="更多模块（高级）"
                  >
                    <div className="mt-2 grid gap-2">
                      <label className="flex items-center justify-between gap-3 text-sm text-ink">
                        <span>剧情记忆（story_memory）</span>
                        <input
                          className="checkbox"
                          checked={props.genForm.memory_modules.story_memory}
                          disabled={props.generating}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            props.setGenForm((v) => ({
                              ...v,
                              memory_modules: { ...v.memory_modules, story_memory: checked },
                            }));
                          }}
                          type="checkbox"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-ink">
                        <span>语义历史（semantic_history）</span>
                        <input
                          className="checkbox"
                          checked={props.genForm.memory_modules.semantic_history}
                          disabled={props.generating}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            props.setGenForm((v) => ({
                              ...v,
                              memory_modules: { ...v.memory_modules, semantic_history: checked },
                            }));
                          }}
                          type="checkbox"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-ink">
                        <span>未回收伏笔（foreshadow_open_loops）</span>
                        <input
                          className="checkbox"
                          checked={props.genForm.memory_modules.foreshadow_open_loops}
                          disabled={props.generating}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            props.setGenForm((v) => ({
                              ...v,
                              memory_modules: { ...v.memory_modules, foreshadow_open_loops: checked },
                            }));
                          }}
                          type="checkbox"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-ink">
                        <span>{getWritingMemoryModuleLabel("structured")}</span>
                        <input
                          className="checkbox"
                          checked={props.genForm.memory_modules.structured}
                          disabled={props.generating}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            props.setGenForm((v) => ({
                              ...v,
                              memory_modules: { ...v.memory_modules, structured: checked },
                            }));
                          }}
                          type="checkbox"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-ink">
                        <span>{getWritingMemoryModuleLabel("vector_rag")}</span>
                        <input
                          className="checkbox"
                          checked={props.genForm.memory_modules.vector_rag}
                          disabled={props.generating}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            props.setGenForm((v) => ({
                              ...v,
                              memory_modules: { ...v.memory_modules, vector_rag: checked },
                            }));
                          }}
                          type="checkbox"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-ink">
                        <span>关系图（graph）</span>
                        <input
                          className="checkbox"
                          checked={props.genForm.memory_modules.graph}
                          disabled={props.generating}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            props.setGenForm((v) => ({
                              ...v,
                              memory_modules: { ...v.memory_modules, graph: checked },
                            }));
                          }}
                          type="checkbox"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-ink">
                        <span>{getWritingMemoryModuleLabel("fractal")}</span>
                        <input
                          className="checkbox"
                          checked={props.genForm.memory_modules.fractal}
                          disabled={props.generating}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            props.setGenForm((v) => ({
                              ...v,
                              memory_modules: { ...v.memory_modules, fractal: checked },
                            }));
                          }}
                          type="checkbox"
                        />
                      </label>
                    </div>
                  </FeedbackDisclosure>
                </div>
              </div>
            ) : null}
          </div>
        </WritingDrawerSection>

        {studioMode ? (
          <WritingDrawerSection
            kicker="工作室资料收集"
            title={WRITING_RESEARCH_COPY.mcpTitle}
            copy="生成前可额外调用项目内资料收集工具去补抓资料。它不会执行任意代码，也不会跨项目写入。"
          >
          <div className="mt-3 grid gap-2">
            <label className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>启用只读资料收集</span>
              <input
                className="checkbox"
                checked={props.genForm.mcp_research.enabled}
                disabled={props.generating}
                name="mcp_research_enabled"
                onChange={(e) => {
                  const checked = e.target.checked;
                  props.setGenForm((v) => ({
                    ...v,
                    mcp_research: {
                      enabled: checked,
                      tool_names: normalizeMcpToolSelection(v.mcp_research.tool_names, availableMcpToolNames),
                    },
                  }));
                }}
                type="checkbox"
              />
            </label>
            <div className="text-[11px] text-subtext">
              预检或生成前会执行项目内只读资料收集工具。取材问题优先使用“记忆查询关键词”，否则使用“用户指令 + 当前章节计划”。
            </div>

            {props.genForm.mcp_research.enabled ? (
              <div className="rounded-atelier border border-border bg-surface p-3">
                {mcpToolsLoading ? <div className="text-xs text-subtext">{WRITING_RESEARCH_COPY.mcpLoadingTools}</div> : null}
                {mcpToolsError ? (
                  <FeedbackCallout className="mt-2" tone="warning" title={WRITING_RESEARCH_COPY.mcpLoadingErrorTitle}>
                    {mcpToolsError.code}。已保留本地默认选择。
                  </FeedbackCallout>
                ) : null}
                <div className="grid gap-2">
                  {mcpTools.map((tool) => {
                    const checked = selectedMcpToolNames.includes(tool.name);
                    return (
                      <label key={tool.name} className="flex items-start justify-between gap-3 text-sm text-ink">
                        <div className="min-w-0">
                          <div>{tool.name}</div>
                          <div className="text-[11px] text-subtext">{tool.description}</div>
                        </div>
                        <input
                          className="checkbox shrink-0"
                          checked={checked}
                          disabled={props.generating}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...selectedMcpToolNames, tool.name]
                              : selectedMcpToolNames.filter((item) => item !== tool.name);
                            props.setGenForm((v) => ({
                              ...v,
                              mcp_research: {
                                ...v.mcp_research,
                                tool_names: normalizeMcpToolSelection(next, availableMcpToolNames),
                              },
                            }));
                          }}
                          type="checkbox"
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px] text-subtext">
                  默认启用项目搜索和资料召回；关系图查询可按需手动打开。
                </div>
              </div>
            ) : null}
          </div>
          </WritingDrawerSection>
        ) : null}

        {props.genForm.stream && props.generating ? (
          <WritingDrawerSection
            kicker="当前进度"
            title="这轮生成正在进行"
            copy="如果输出方向明显不对，可以先取消，再回到上面调整意图、资料或风格。"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-subtext">
              <span className="truncate">{props.streamProgress?.message ?? "连接中..."}</span>
              <span className="shrink-0">{props.streamProgress?.progress ?? 0}%</span>
            </div>
            <ProgressBar ariaLabel="章节流式生成进度" value={props.streamProgress?.progress ?? 0} />
            {props.onCancelGenerate ? (
              <div className="flex justify-end">
                <button className="btn btn-secondary" onClick={props.onCancelGenerate} type="button">
                  取消生成
                </button>
              </div>
            ) : null}
          </WritingDrawerSection>
        ) : null}

        <WritingDrawerSection
          kicker="上下文范围"
          title="决定要带哪些设定和前文"
          copy="如果你觉得 AI 偏题、跑设定或重复前情，通常先检查这里，而不是直接改模型参数。"
        >
          <div className="mt-3 grid gap-3">
            <div className="grid gap-2">
              <div className="text-xs text-subtext">上下文注入</div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  className="checkbox"
                  checked={props.genForm.context.include_world_setting}
                  disabled={props.generating}
                  name="context_include_world_setting"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, context: { ...v.context, include_world_setting: checked } }));
                  }}
                  type="checkbox"
                />
                世界观
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  className="checkbox"
                  checked={props.genForm.context.include_style_guide}
                  disabled={props.generating}
                  name="context_include_style_guide"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, context: { ...v.context, include_style_guide: checked } }));
                  }}
                  type="checkbox"
                />
                风格
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  className="checkbox"
                  checked={props.genForm.context.include_constraints}
                  disabled={props.generating}
                  name="context_include_constraints"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, context: { ...v.context, include_constraints: checked } }));
                  }}
                  type="checkbox"
                />
                约束
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  className="checkbox"
                  checked={props.genForm.context.include_outline}
                  disabled={props.generating}
                  name="context_include_outline"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, context: { ...v.context, include_outline: checked } }));
                  }}
                  type="checkbox"
                />
                大纲
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  className="checkbox"
                  checked={props.genForm.context.include_smart_context}
                  disabled={props.generating}
                  name="context_include_smart_context"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, context: { ...v.context, include_smart_context: checked } }));
                  }}
                  type="checkbox"
                />
                智能上下文
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  className="checkbox"
                  checked={props.genForm.context.require_sequential}
                  disabled={props.generating}
                  name="context_require_sequential"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, context: { ...v.context, require_sequential: checked } }));
                  }}
                  type="checkbox"
                />
                严格顺序
              </label>
            </div>

            <label className="grid gap-1">
              <span className="text-xs text-subtext">上一章注入</span>
              <select
                className="select"
                disabled={props.generating}
                name="previous_chapter"
                value={props.genForm.context.previous_chapter}
                onChange={(e) => {
                  const value = e.target.value as GenerateForm["context"]["previous_chapter"];
                  props.setGenForm((v) => ({
                    ...v,
                    context: {
                      ...v.context,
                      previous_chapter: value,
                    },
                  }));
                }}
              >
                <option value="none">不注入</option>
                <option value="tail">结尾（推荐）</option>
                <option value="summary">摘要</option>
                <option value="content">正文</option>
              </select>
              <div className="text-[11px] text-subtext">结尾更利于强衔接，减少开头复述。</div>
            </label>

            <div className="grid gap-2">
              <div className="text-xs text-subtext">注入角色（可选）</div>
              {props.characters.length === 0 ? (
                <FeedbackEmptyState
                  variant="compact"
                  kicker="角色资料"
                  title="暂无角色"
                  description="如果这章需要明显的人物视角或关系约束，建议先去故事资料补角色。"
                />
              ) : null}
              <div className="max-h-40 overflow-auto rounded-atelier border border-border bg-surface p-2">
                {props.characters.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-sm text-ink">
                    <input
                      className="checkbox"
                      checked={props.genForm.context.character_ids.includes(c.id)}
                      disabled={props.generating}
                      name={`character_${c.id}`}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        props.setGenForm((v) => {
                          const next = new Set(v.context.character_ids);
                          if (checked) next.add(c.id);
                          else next.delete(c.id);
                          return { ...v, context: { ...v.context, character_ids: Array.from(next) } };
                        });
                      }}
                      type="checkbox"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </WritingDrawerSection>

        {studioMode ? (
          <WritingDrawerSection
            kicker="高级链路"
            title="规划、流式与后处理"
            copy="默认折叠。只有当你需要先出规划、比较润色稿，或切换更稳的生成链路时再展开。"
          >
          <button
            className="ui-focus-ring ui-pressable flex w-full items-center justify-between gap-3 rounded-atelier px-2 py-2 text-left hover:bg-canvas"
            aria-controls={advancedPanelId}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
            type="button"
          >
            <span className="text-sm font-medium text-ink">高级参数</span>
            <span aria-hidden="true" className="text-xs text-subtext">
              {advancedOpen ? "收起" : "展开"}
            </span>
          </button>

          {!advancedOpen ? (
            <div className="mt-2 text-[11px] text-subtext">默认折叠：流式生成、规划、润色等。</div>
          ) : null}

          {autoReliableTransport ? (
            <FeedbackCallout className="mt-2 text-xs" tone="warning" title="已自动启用可靠链路">
              已为规划/润色/正文优化自动启用可靠链路，避免请求超时。
            </FeedbackCallout>
          ) : null}

          {props.preset && props.genForm.stream && !streamProviderSupported && !reliableTransportRequired ? (
            <FeedbackCallout className="mt-2 text-xs" tone="warning" title="当前模型不支持流式">
              不支持流式，生成时会自动回退非流式生成。
            </FeedbackCallout>
          ) : null}

          {advancedOpen ? (
            <div className="mt-3 grid gap-2" id={advancedPanelId}>
              <label className="flex items-center justify-between gap-3 text-sm text-ink">
                <span>流式生成（beta）</span>
                <input
                  className="checkbox"
                  checked={props.genForm.stream}
                  disabled={props.generating}
                  name="stream"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, stream: checked }));
                  }}
                  type="checkbox"
                />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm text-ink">
                <span>先生成规划</span>
                <input
                  className="checkbox"
                  checked={props.genForm.plan_first}
                  disabled={props.generating}
                  name="plan_first"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, plan_first: checked }));
                  }}
                  type="checkbox"
                />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm text-ink">
                <span>润色</span>
                <input
                  className="checkbox"
                  checked={props.genForm.post_edit}
                  disabled={props.generating}
                  name="post_edit"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({
                      ...v,
                      post_edit: checked,
                      post_edit_sanitize: checked ? v.post_edit_sanitize : false,
                    }));
                  }}
                  type="checkbox"
                />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm text-ink">
                <span>去味/一致性修复</span>
                <input
                  className="checkbox"
                  checked={props.genForm.post_edit_sanitize}
                  disabled={props.generating || !props.genForm.post_edit}
                  name="post_edit_sanitize"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, post_edit_sanitize: checked }));
                  }}
                  type="checkbox"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-ink">
                <span>正文优化</span>
                <input
                  className="checkbox"
                  checked={props.genForm.content_optimize}
                  disabled={props.generating}
                  name="content_optimize"
                  onChange={(e) => {
                    const checked = e.target.checked;
                    props.setGenForm((v) => ({ ...v, content_optimize: checked }));
                  }}
                  type="checkbox"
                />
              </label>
              <div className="text-[11px] text-subtext">失败会降级保留原文，并记录原因。</div>
            </div>
          ) : (
            <div id={advancedPanelId} hidden />
          )}
          </WritingDrawerSection>
        ) : null}

        <WritingDrawerSection
          kicker="执行前提醒"
          title="保存和生成会共同影响当前章节"
          copy="生成与编辑内容会自动保存，但关键节点仍建议手动保存。需要核对提示词时，优先先看“生成前检查”。"
        />
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {studioMode ? (
          <button
            className="btn btn-secondary"
            disabled={props.generating || !props.activeChapter}
            onClick={props.onOpenPromptInspector}
            type="button"
          >
            生成前检查{hasPromptOverride ? "（覆盖中）" : ""}
          </button>
        ) : null}
        {props.postEditCompareAvailable ? (
          <button
            className="btn btn-secondary"
            disabled={props.generating || !props.onOpenPostEditCompare}
            onClick={() => props.onOpenPostEditCompare?.()}
            type="button"
          >
            润色对比与回退
          </button>
        ) : null}
        {props.contentOptimizeCompareAvailable ? (
          <button
            className="btn btn-secondary"
            disabled={props.generating || !props.onOpenContentOptimizeCompare}
            onClick={() => props.onOpenContentOptimizeCompare?.()}
            type="button"
          >
            正文优化对比与回退
          </button>
        ) : null}
        {hasPromptOverride ? (
          <button
            className="btn btn-secondary"
            disabled={props.generating}
            onClick={() => props.setGenForm((v) => ({ ...v, prompt_override: null }))}
            type="button"
          >
            回退默认
          </button>
        ) : null}
        <button
          className="btn btn-primary"
          disabled={props.generating || !props.activeChapter}
          onClick={props.onGenerateReplace}
          type="button"
        >
          {props.generating ? "生成中..." : "生成"}
        </button>
        {props.onSaveAndGenerateNext ? (
          <button
            className="btn btn-primary"
            disabled={props.generating || props.saving || !props.activeChapter}
            onClick={() => void props.onSaveAndGenerateNext?.()}
            type="button"
          >
            {props.saving ? "保存中..." : "保存并继续"}
          </button>
        ) : null}
        <button
          className="btn btn-secondary"
          disabled={props.generating || !props.activeChapter}
          onClick={props.onGenerateAppend}
          type="button"
        >
          {props.generating ? "生成中..." : "追加生成"}
        </button>
        <button
          className="btn btn-secondary"
          disabled={props.generating || props.saving || !props.activeChapter || !props.dirty}
          onClick={() => void props.onSave()}
          type="button"
        >
          {props.saving ? "保存中..." : "保存"}
        </button>
      </div>
    </Drawer>
  );
}
