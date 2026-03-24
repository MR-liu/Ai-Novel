import clsx from "clsx";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { FeedbackCallout, FeedbackEmptyState } from "../../components/ui/Feedback";
import type { PromptBlock } from "../../types";
import type { BlockDraft, PromptStudioTask } from "./types";
import { formatTriggers, parseTriggersWithValidation } from "./utils";

const BLOCK_ROLE_OPTIONS = [
  { value: "system", label: "总控说明", hint: "给模型设定整体边界、风格和任务规则。" },
  { value: "user", label: "写作指令", hint: "告诉模型这次具体要完成什么内容。" },
  { value: "assistant", label: "参考口吻", hint: "提供历史回答或示例语气，帮助保持风格一致。" },
  { value: "tool", label: "工具结果", hint: "承接检索、图谱或其他外部资料的摘要结果。" },
] as const;

function getRoleMeta(role: string) {
  return (
    BLOCK_ROLE_OPTIONS.find((option) => option.value === role) ?? {
      value: role,
      label: role || "未命名通道",
      hint: "这是一个自定义注入通道，请确认后端是否支持。",
    }
  );
}

function summarizeTasks(taskKeys: string[], taskLabelByKey: Map<string, string>) {
  if (!taskKeys.length) return "未限定任务，默认所有写作任务都可调用";
  return taskKeys.map((key) => taskLabelByKey.get(key) ?? key).join("、");
}

function countTemplateVariables(template: string) {
  return (template.match(/{{[\s\S]*?}}/g) ?? []).length;
}

function highlightTemplateVariables(template: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /{{[\s\S]*?}}/g;
  let last = 0;
  let idx = 0;
  for (const m of template.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push(template.slice(last, start));
    const token = m[0] ?? "";
    out.push(
      <span key={`${start}-${idx}`} className="rounded bg-accent/15 px-0.5 text-accent">
        {token}
      </span>,
    );
    last = start + token.length;
    idx += 1;
  }
  if (last < template.length) out.push(template.slice(last));
  if (template.endsWith("\n")) out.push("\n");
  if (out.length === 0) out.push("");
  return out;
}

function HighlightedTemplateTextarea(props: { value: string; disabled: boolean; onChange: (next: string) => void }) {
  const { value, disabled, onChange } = props;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayContentRef = useRef<HTMLDivElement | null>(null);

  const highlighted = useMemo(() => highlightTemplateVariables(value), [value]);

  const syncOverlayScroll = useCallback(() => {
    const ta = textareaRef.current;
    const overlayContent = overlayContentRef.current;
    if (!ta || !overlayContent) return;
    overlayContent.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
  }, []);

  useEffect(() => {
    syncOverlayScroll();
  }, [syncOverlayScroll, value]);

  return (
    <div className="relative rounded-atelier bg-canvas">
      <div
        aria-hidden="true"
        className={clsx(
          "pointer-events-none absolute inset-0 overflow-hidden px-3 py-2 text-xs",
          disabled ? "opacity-60" : null,
        )}
      >
        <div ref={overlayContentRef} className="whitespace-pre-wrap break-words font-mono text-ink">
          {highlighted}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        className="textarea atelier-mono min-h-[140px] resize-y bg-transparent py-2 text-xs text-transparent"
        style={{ caretColor: "rgb(var(--color-ink))" }}
        value={value}
        disabled={disabled}
        onScroll={syncOverlayScroll}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function PromptStudioPresetEditorPanel(props: {
  busy: boolean;
  selectedPresetId: string | null;
  tasks: PromptStudioTask[];
  presetDraftName: string;
  setPresetDraftName: (value: string) => void;
  presetDraftActiveFor: string[];
  setPresetDraftActiveFor: (value: string[]) => void;
  savePreset: () => Promise<void>;
  deletePreset: () => Promise<void>;
  blocks: PromptBlock[];
  drafts: Record<string, BlockDraft>;
  setDrafts: Dispatch<SetStateAction<Record<string, BlockDraft>>>;
  addBlock: () => Promise<void>;
  saveBlock: (blockId: string) => Promise<void>;
  deleteBlock: (blockId: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
}) {
  const {
    addBlock,
    blocks,
    busy,
    deleteBlock,
    deletePreset,
    drafts,
    onReorder,
    presetDraftActiveFor,
    presetDraftName,
    saveBlock,
    savePreset,
    selectedPresetId,
    setDrafts,
    setPresetDraftActiveFor,
    setPresetDraftName,
    tasks,
  } = props;

  const taskKeySet = useMemo(() => new Set(tasks.map((t) => t.key)), [tasks]);
  const taskLabelByKey = useMemo(() => new Map(tasks.map((t) => [t.key, t.label])), [tasks]);
  const dragIdRef = useRef<string | null>(null);
  const enabledBlockCount = useMemo(
    () => blocks.filter((block) => (drafts[block.id]?.enabled ?? block.enabled) === true).length,
    [blocks, drafts],
  );
  const activeTaskSummary = useMemo(
    () => summarizeTasks(presetDraftActiveFor, taskLabelByKey),
    [presetDraftActiveFor, taskLabelByKey],
  );
  const nextStepText = !selectedPresetId
    ? "先从左侧选择一套蓝图，或新建一套方案，再开始编排片段。"
    : blocks.length === 0
      ? "先添加第一个片段，通常从“总控说明”或“写作指令”开始。"
      : presetDraftActiveFor.length === 0
        ? "当前蓝图会对所有任务生效。若你只想影响某一类生成，建议先限定适用任务。"
        : "片段已经可编辑。改完后先去下方做一次生成前检查，再决定是否保存。";

  return (
    <>
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">当前蓝图状态</div>
            <div className="mt-1 text-xs text-subtext">先确认这套蓝图叫什么、会在哪些任务里生效，再决定片段要怎么编排。</div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => void savePreset()}
              disabled={busy || !selectedPresetId}
              type="button"
            >
              保存蓝图
            </button>
            <button
              className="btn btn-ghost text-accent hover:bg-accent/10"
              onClick={() => void deletePreset()}
              disabled={busy || !selectedPresetId}
              type="button"
            >
              删除蓝图
            </button>
          </div>
        </div>

        <div className="manuscript-status-list">
          <span className="manuscript-chip">{selectedPresetId ? "已选蓝图" : "等待选择蓝图"}</span>
          <span className="manuscript-chip">{presetDraftName.trim() ? `名称：${presetDraftName.trim()}` : "名称未填写"}</span>
          <span className="manuscript-chip">{presetDraftActiveFor.length ? `适用任务 ${presetDraftActiveFor.length} 项` : "适用任务：全部"}</span>
          <span className="manuscript-chip">片段 {blocks.length} 条</span>
          <span className="manuscript-chip">已启用 {enabledBlockCount} 条</span>
        </div>

        <FeedbackCallout className="mt-4 text-xs" title="当前蓝图的下一步建议">
          {nextStepText}
        </FeedbackCallout>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="text-xs text-subtext">蓝图名称</div>
            <input
              className="input"
              value={presetDraftName}
              onChange={(e) => setPresetDraftName(e.target.value)}
              disabled={busy}
              placeholder="例如：章节生成·稳态版"
            />
            <div className="text-[11px] text-subtext">建议用“任务 + 风格/目的”的方式命名，方便你以后知道它适合什么场景。</div>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-subtext">适用任务</div>
            <div className="text-[11px] text-subtext">{activeTaskSummary}</div>
            <div className="flex flex-wrap gap-2">
              {tasks.map((t) => {
                const checked = presetDraftActiveFor.includes(t.key);
                return (
                  <label
                    key={t.key}
                    className={clsx(
                      "ui-transition-fast flex items-center gap-2 rounded-atelier border px-3 py-2 text-sm",
                      checked
                        ? "border-accent/40 bg-accent/10 text-ink"
                        : "border-border bg-canvas text-subtext hover:bg-surface hover:text-ink",
                      busy ? "opacity-60" : "cursor-pointer",
                    )}
                  >
                    <input
                      className="checkbox"
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={(e) => {
                        const next = new Set(presetDraftActiveFor);
                        if (e.target.checked) next.add(t.key);
                        else next.delete(t.key);
                        setPresetDraftActiveFor([...next]);
                      }}
                    />
                    <span>{t.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">片段编排台</div>
            <div className="mt-1 text-xs text-subtext">每个片段都像一张“写作说明卡”。顺序越靠前，越容易先影响整体生成方向。</div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => void addBlock()}
            disabled={busy || !selectedPresetId}
            type="button"
          >
            添加片段
          </button>
        </div>

        <FeedbackCallout className="mb-4 text-xs" title="推荐的编排顺序">
          建议顺序：先放“总控说明”定边界，再放“写作指令”说明本次任务，最后按需要补检索结果、人物状态或风格示例。
        </FeedbackCallout>

        <div className="grid gap-3">
          {blocks.length === 0 ? (
            <FeedbackEmptyState
              variant="compact"
              title="还没有片段"
              description="先添加一条可编辑的写作说明卡。"
            />
          ) : null}
          {blocks.map((b, idx) => {
            const d = drafts[b.id];
            const enabled = d?.enabled ?? b.enabled;
            const role = d?.role ?? b.role;
            const identifier = d?.identifier ?? b.identifier;
            const name = d?.name ?? b.name;
            const triggers = d?.triggers ?? formatTriggers(b.triggers ?? []);
            const triggerValidation = parseTriggersWithValidation(triggers);
            const triggerTokens = triggerValidation.triggers;
            const invalidTriggers = triggerValidation.invalid;
            const customTriggers = triggerTokens.filter((t) => !taskKeySet.has(t));
            const markerKey = d?.marker_key ?? b.marker_key ?? "";
            const template = d?.template ?? b.template ?? "";
            const roleMeta = getRoleMeta(role);
            const triggerSummary = summarizeTasks(triggerTokens, taskLabelByKey);
            const variableCount = countTemplateVariables(template);
            const blockReady = Boolean(template.trim()) && invalidTriggers.length === 0;

            return (
              <div
                key={b.id}
                className="surface p-3"
                draggable
                onDragStart={() => {
                  dragIdRef.current = b.id;
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={() => {
                  const fromId = dragIdRef.current;
                  dragIdRef.current = null;
                  if (!fromId || fromId === b.id) return;
                  const ids = blocks.map((x) => x.id);
                  const fromIdx = ids.indexOf(fromId);
                  const toIdx = ids.indexOf(b.id);
                  if (fromIdx < 0 || toIdx < 0) return;
                  ids.splice(fromIdx, 1);
                  const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
                  ids.splice(insertIdx, 0, fromId);
                  void onReorder(ids);
                }}
                title="拖拽可调整排序"
              >
                <div className="manuscript-status-list mb-3">
                  <span className="manuscript-chip">顺位 #{idx + 1}</span>
                  <span className="manuscript-chip">{enabled ? "已启用" : "已停用"}</span>
                  <span className="manuscript-chip">通道：{roleMeta.label}</span>
                  <span className="manuscript-chip">{triggerTokens.length ? `命中任务 ${triggerTokens.length} 项` : "命中全部任务"}</span>
                  <span className="manuscript-chip">{variableCount ? `模板变量 ${variableCount} 处` : "无模板变量"}</span>
                </div>

                {invalidTriggers.length ? (
                  <FeedbackCallout className="mb-3 text-xs" tone="warning" title="任务键需要修正">
                    任务键无效：{invalidTriggers.join("、")}。请先修正，否则这条片段无法保存。
                  </FeedbackCallout>
                ) : null}
                {!template.trim() ? (
                  <FeedbackCallout className="mb-3 text-xs" tone="warning" title="片段正文还是空的">
                    即使启用，它也不会给生成带来实际帮助。
                  </FeedbackCallout>
                ) : null}
                {blockReady ? (
                  <FeedbackCallout className="mb-3 text-xs" title="这条片段当前的注入方式">
                    这条片段会以“{roleMeta.label}”身份注入，当前适用范围：{triggerSummary}
                    {markerKey ? `，并优先绑定资料定位键 ${markerKey}` : "，没有绑定专门的资料定位键"}。
                  </FeedbackCallout>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="select-none text-subtext">≡</span>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        className="checkbox"
                        type="checkbox"
                        checked={enabled}
                        disabled={busy}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [b.id]: {
                              identifier,
                              name,
                              role,
                              enabled: e.target.checked,
                              template,
                              marker_key: markerKey,
                              triggers,
                            },
                          }))
                        }
                      />
                      <span className="font-semibold">{name}</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-secondary px-3 py-1 text-sm"
                      onClick={() => void saveBlock(b.id)}
                      disabled={busy || invalidTriggers.length > 0}
                      type="button"
                    >
                      保存
                    </button>
                    <button
                      className="btn btn-ghost px-3 py-1 text-sm text-accent hover:bg-accent/10"
                      onClick={() => void deleteBlock(b.id)}
                      disabled={busy}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="grid gap-1">
                      <div className="text-xs text-subtext">片段标识（内部键）</div>
                      <input
                        className="input"
                        value={identifier}
                        disabled={busy}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [b.id]: {
                              identifier: e.target.value,
                              name,
                              role,
                              enabled,
                              template,
                              marker_key: markerKey,
                              triggers,
                            },
                          }))
                        }
                      />
                      <div className="text-[11px] text-subtext">用于预览、调试和导入导出定位这条片段。建议短、稳定、语义明确。</div>
                    </div>
                    <div className="grid gap-1">
                      <div className="text-xs text-subtext">注入通道</div>
                      <select
                        className="select"
                        value={role}
                        disabled={busy}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [b.id]: {
                              identifier,
                              name,
                              role: e.target.value,
                              enabled,
                              template,
                              marker_key: markerKey,
                              triggers,
                            },
                          }))
                        }
                      >
                        {BLOCK_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}（{option.value}）
                          </option>
                        ))}
                      </select>
                      <div className="text-[11px] text-subtext">{roleMeta.hint}</div>
                    </div>
                  </div>

                  <div className="grid gap-1">
                    <div className="text-xs text-subtext">片段名称</div>
                    <input
                      className="input"
                      value={name}
                      disabled={busy}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [b.id]: {
                            identifier,
                            name: e.target.value,
                            role,
                            enabled,
                            template,
                            marker_key: markerKey,
                            triggers,
                          },
                          }))
                      }
                    />
                    <div className="text-[11px] text-subtext">这是你在蓝图里识别它的标题，建议直接写“人物约束”“章节目标”“伏笔提醒”这类用途名。</div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="grid gap-2">
                      <div className="text-xs text-subtext">在哪些任务里启用这条片段</div>
                      <div className="text-[11px] text-subtext">{triggerSummary}</div>
                      <div className="flex flex-wrap gap-2">
                        {tasks.map((t) => {
                          const checked = triggerTokens.includes(t.key);
                          return (
                            <label
                              key={t.key}
                              className={clsx(
                                "ui-transition-fast flex items-center gap-2 rounded-atelier border px-3 py-2 text-sm",
                                checked
                                  ? "border-accent/40 bg-accent/10 text-ink"
                                  : "border-border bg-canvas text-subtext hover:bg-surface hover:text-ink",
                                busy ? "opacity-60" : "cursor-pointer",
                              )}
                            >
                              <input
                                className="checkbox"
                                type="checkbox"
                                checked={checked}
                                disabled={busy}
                                onChange={(e) => {
                                  const next = new Set(triggerTokens);
                                  if (e.target.checked) next.add(t.key);
                                  else next.delete(t.key);
                                  const nextOrdered = [
                                    ...tasks.filter((x) => next.has(x.key)).map((x) => x.key),
                                    ...customTriggers.filter((x) => next.has(x)),
                                  ];
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [b.id]: {
                                      identifier,
                                      name,
                                      role,
                                      enabled,
                                      template,
                                      marker_key: markerKey,
                                      triggers: formatTriggers(nextOrdered),
                                    },
                                  }));
                                }}
                              />
                              <span>{t.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="grid gap-1">
                        <div className="text-xs text-subtext">高级任务键（逗号分隔）</div>
                        <input
                          className="input"
                          value={triggers}
                          disabled={busy}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [b.id]: {
                                identifier,
                                name,
                                role,
                                enabled,
                                template,
                                marker_key: markerKey,
                                triggers: e.target.value,
                              },
                            }))
                          }
                          placeholder="chapter_generate, outline_generate"
                        />
                        {customTriggers.length ? (
                          <div className="text-xs text-subtext">自定义任务键：{customTriggers.join(", ")}</div>
                        ) : null}
                        <div className="text-[11px] text-subtext">不勾选任何任务时，默认所有任务都能使用它。只有在你需要覆盖自定义任务时，才建议直接编辑这里。</div>
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <div className="text-xs text-subtext">资料定位键（可空）</div>
                      <input
                        className="input"
                        value={markerKey}
                        disabled={busy}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [b.id]: {
                              identifier,
                              name,
                              role,
                              enabled,
                              template,
                              marker_key: e.target.value,
                              triggers,
                            },
                          }))
                        }
                        placeholder="story.outline / user.instruction / ..."
                      />
                      <div className="text-[11px] text-subtext">
                        当这条片段需要绑定某类上下文时再填写。留空表示它只是普通说明卡，不依赖特定资料定位点。
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-subtext">
                      <span>片段正文模板</span>
                      <span>{variableCount ? `检测到 ${variableCount} 处模板变量` : "可以直接写纯文本说明"}</span>
                    </div>
                    <HighlightedTemplateTextarea
                      value={template}
                      disabled={busy}
                      onChange={(next) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [b.id]: {
                            identifier,
                            name,
                            role,
                            enabled,
                            template: next,
                            marker_key: markerKey,
                            triggers,
                          },
                        }))
                      }
                    />
                    <div className="text-[11px] leading-5 text-subtext">
                      用 <code>{"{{变量名}}"}</code> 引用项目资料。高亮部分表示模板变量；你可以把它当成“写作时自动补全的占位符”。
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
