import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { createRequestSeqGuard } from "../../lib/requestSeqGuard";
import { ApiError, apiDownloadAttachment, apiJson } from "../../services/apiClient";
import { Drawer } from "../ui/Drawer";
import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../ui/Feedback";
import { useToast } from "../ui/toast";
import { getGenerationRunStage, getMcpRunSummary } from "./generationRunStages";
import type { GenerationRun } from "./types";
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
  loading: boolean;
  runs: GenerationRun[];
  selectedRun: GenerationRun | null;
  onSelectRun: (run: GenerationRun) => void;
};

const STAGE_LABELS: Record<string, string> = {
  plan: "规划",
  generate: "正文生成",
  post_edit: "后处理",
  content_optimize: "内容优化",
  mcp: WRITING_RESEARCH_COPY.mcpStageLabel,
  memory_update: "连续性更新",
  unknown: "未知阶段",
};

const MEMORY_SECTION_LABELS: Record<string, string> = {
  worldbook: "世界书",
  story_memory: "剧情记忆",
  semantic_history: "语义历史",
  foreshadow_open_loops: "未回收伏笔",
  structured: "结构化资料",
  tables: "表格系统",
  vector_rag: "资料召回",
  graph: "关系图",
  fractal: "剧情脉络",
};

function formatStageLabel(stage: string): string {
  return (STAGE_LABELS[stage] ?? stage) || STAGE_LABELS.unknown;
}

function formatMemorySectionLabel(section: string): string {
  return MEMORY_SECTION_LABELS[section] ?? getWritingMemoryModuleLabel(section);
}

export function GenerationHistoryDrawer(props: Props) {
  const { onClose, open } = props;
  const toast = useToast();
  const titleId = useId();
  const [downloading, setDownloading] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineRuns, setPipelineRuns] = useState<GenerationRun[]>([]);
  const [pipelineError, setPipelineError] = useState<{ code: string; message: string; requestId?: string } | null>(
    null,
  );
  const pipelineGuardRef = useRef(createRequestSeqGuard());

  const selectedRun = props.selectedRun;
  const mcpSummary = getMcpRunSummary(selectedRun);
  const selectedStage = selectedRun ? getGenerationRunStage(String(selectedRun.type ?? "")) : "未选择";
  const selectedStageLabel = selectedRun ? formatStageLabel(selectedStage) : "未选择";
  const paramsObj =
    selectedRun?.params && typeof selectedRun.params === "object"
      ? (selectedRun.params as Record<string, unknown>)
      : null;
  const memoryLogRaw = paramsObj?.memory_retrieval_log_json;
  const memoryLog = memoryLogRaw && typeof memoryLogRaw === "object" ? (memoryLogRaw as Record<string, unknown>) : null;
  const perSectionRaw = memoryLog?.per_section;
  const perSection =
    perSectionRaw && typeof perSectionRaw === "object" ? (perSectionRaw as Record<string, unknown>) : null;

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

  useEffect(() => {
    const guard = pipelineGuardRef.current;
    return () => guard.invalidate();
  }, []);

  const downloadDebugBundle = useCallback(async () => {
    if (!selectedRun) return;
    if (downloading) return;
    setDownloading(true);
    try {
      const { filename, blob, requestId } = await apiDownloadAttachment(
        `/api/generation_runs/${selectedRun.id}/debug_bundle`,
      );
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename || `debug_bundle_${selectedRun.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.toastSuccess("已下载排障包", requestId);
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setDownloading(false);
    }
  }, [downloading, selectedRun, toast]);

  useEffect(() => {
    if (!open) return;
    if (!selectedRun?.project_id || !selectedRun.request_id) {
      setPipelineRuns([]);
      setPipelineError(null);
      setPipelineLoading(false);
      return;
    }
    const seq = pipelineGuardRef.current.next();
    setPipelineLoading(true);
    setPipelineError(null);

    const qs = new URLSearchParams();
    qs.set("limit", "50");
    qs.set("request_id", selectedRun.request_id);
    if (selectedRun.chapter_id) qs.set("chapter_id", selectedRun.chapter_id);

    void apiJson<{ runs: GenerationRun[] }>(`/api/projects/${selectedRun.project_id}/generation_runs?${qs.toString()}`)
      .then((res) => {
        if (!pipelineGuardRef.current.isLatest(seq)) return;
        setPipelineRuns(res.data.runs ?? []);
      })
      .catch((e) => {
        if (!pipelineGuardRef.current.isLatest(seq)) return;
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        setPipelineError({ code: err.code, message: err.message, requestId: err.requestId });
      })
      .finally(() => {
        if (pipelineGuardRef.current.isLatest(seq)) setPipelineLoading(false);
      });
  }, [open, selectedRun?.chapter_id, selectedRun?.project_id, selectedRun?.request_id]);

  const pipelineSteps = useMemo(() => {
    const sorted = [...pipelineRuns].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return sorted.map((r) => ({ run: r, stage: getGenerationRunStage(String(r.type ?? "")) }));
  }, [pipelineRuns]);
  const headerMeta = useMemo<WritingDrawerMetaItem[]>(
    () => [
      { label: "最近记录", value: `${props.runs.length} 条` },
      { label: "当前阶段", value: selectedStageLabel },
      {
        label: "当前结果",
        value: selectedRun ? (selectedRun.error ? "本次失败" : "可查看详情") : "等待选择记录",
        tone: selectedRun ? (selectedRun.error ? "warning" : "success") : "default",
      },
    ],
    [props.runs.length, selectedRun, selectedStageLabel],
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      panelClassName="h-full w-full max-w-2xl border-l border-border bg-canvas p-6 shadow-sm"
    >
      <WritingDrawerHeader
        titleId={titleId}
        kicker="生成回看"
        title="生成记录"
        description="这里把一次次起草、重写和资料收集串起来，方便你回看哪一步出了偏差，或把好的结果重新拿回来。"
        meta={headerMeta}
        actions={
          <button className="btn btn-secondary" aria-label="关闭" onClick={onClose} type="button">
            关闭
          </button>
        }
        callout={
          selectedRun ? (
            <div>
              当前选中阶段：{selectedStageLabel}。
              {selectedRun.error ? "这条记录有错误输出，可先下载排障包。" : "如果结果不错，可以继续查看提示词和输出细节。"}
            </div>
          ) : (
            <div>先从左侧挑一条记录，再看右侧的提示词、输出和资料检索链路。</div>
          )
        }
      />

      <div className="mt-5 grid gap-4">
        {props.loading ? <div className="text-sm text-subtext">加载中...</div> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <WritingDrawerSection
            kicker="最近记录"
            title="按时间回看"
            copy="先选中一条记录，再到右侧看它的提示词、输出和串联流水线。"
            className="p-2"
          >
            {props.runs.length === 0 ? (
              <FeedbackEmptyState
                variant="compact"
                kicker="最近记录"
                title="暂无生成记录"
                description="等你完成一次起草、后处理或连续性更新后，这里就会开始累积可回看的链路。"
              />
            ) : (
              <div className="flex flex-col gap-1">
                {props.runs.map((r) => {
                  const active = props.selectedRun?.id === r.id;
                  const failed = Boolean(r.error);
                  return (
                    <button
                      key={r.id}
                      className={
                        active
                          ? "ui-focus-ring ui-transition-fast rounded-atelier bg-canvas px-3 py-2 text-left text-sm text-ink"
                          : "ui-focus-ring ui-transition-fast rounded-atelier px-3 py-2 text-left text-sm text-subtext hover:bg-canvas hover:text-ink"
                      }
                      onClick={() => props.onSelectRun(r)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate">
                          <span className="mr-2 text-xs text-subtext">{new Date(r.created_at).toLocaleString()}</span>
                          <span className="truncate">{formatStageLabel(getGenerationRunStage(String(r.type ?? "")))}</span>
                        </div>
                        <span className="shrink-0 text-[11px] text-subtext">{failed ? "失败" : "完成"}</span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-subtext">{String(r.type ?? "")}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </WritingDrawerSection>

          <WritingDrawerSection
            kicker="选中详情"
            title={selectedRun ? selectedStageLabel : "等待选择记录"}
            copy="这里集中显示当前记录的模型、提示词、输出和按定位编号串起来的处理链路。"
          >
            {!selectedRun ? (
              <FeedbackEmptyState
                variant="compact"
                kicker="选中详情"
                title="等待选择记录"
                description="先在左侧挑一条生成记录，再看它的提示词、输出和按定位编号串起来的处理链路。"
              />
            ) : (
              <div className="grid gap-3">
                <div className="drawer-workbench-subcard">
                  <div className="text-sm text-ink">{selectedStageLabel}</div>
                  <div className="mt-1 text-xs text-subtext">
                    类型：{String(selectedRun.type ?? "未记录")} | 模型：{selectedRun.provider ?? "未记录"} /{" "}
                    {selectedRun.model ?? "未记录"}
                  </div>
                </div>
                {mcpSummary ? (
                  <div className="drawer-workbench-subcard text-xs text-subtext">
                    <div className="text-xs text-ink">{WRITING_RESEARCH_COPY.mcpSummaryTitle}</div>
                    <div className="mt-1">工具：{mcpSummary.toolName}</div>
                    {mcpSummary.purpose ? <div>目的：{mcpSummary.purpose}</div> : null}
                    {mcpSummary.timeoutSeconds ? <div>超时：{mcpSummary.timeoutSeconds} 秒</div> : null}
                    {mcpSummary.maxOutputChars ? <div>输出上限：{mcpSummary.maxOutputChars} 字符</div> : null}
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="drawer-workbench-subcard flex items-center justify-between gap-2 text-xs text-subtext">
                    <span className="truncate">运行编号：{selectedRun.id}</span>
                    <button
                      className="btn btn-ghost px-2 py-1 text-xs"
                      onClick={async () => {
                        await navigator.clipboard.writeText(selectedRun.id ?? "");
                      }}
                      type="button"
                    >
                      复制
                    </button>
                  </div>
                  {selectedRun.request_id ? (
                    <div className="drawer-workbench-subcard flex items-center justify-between gap-2 text-xs text-subtext">
                      <span className="truncate">定位编号：{selectedRun.request_id}</span>
                      <button
                        className="btn btn-ghost px-2 py-1 text-xs"
                        onClick={async () => {
                          await navigator.clipboard.writeText(selectedRun.request_id ?? "");
                        }}
                        type="button"
                      >
                        复制
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="drawer-workbench-subcard">
                  <button
                    className="btn btn-secondary"
                    disabled={downloading}
                    onClick={() => void downloadDebugBundle()}
                    type="button"
                  >
                    {downloading ? "下载中..." : "下载排障包"}
                  </button>
                  <div className="mt-3 text-[11px] leading-6 text-subtext">
                    用途：定位生成失败、提示词渲染和资料检索注入等问题。风险：文件里可能含有隐私内容，分享前请先确认；按设计不应包含 API Key，但仍建议快速检索一遍。
                  </div>
                </div>

                <FeedbackDisclosure
                  defaultOpen
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title="整次生成链路（按定位编号串联）"
                >
                  <div className="mt-2 grid gap-2">
                    {pipelineLoading ? <div className="text-xs text-subtext">加载中...</div> : null}
                    {pipelineError ? (
                      <FeedbackCallout tone="danger" title="流水线加载失败">
                        {pipelineError.code}: {pipelineError.message}
                        {pipelineError.requestId ? (
                          <span className="ml-2">定位编号: {pipelineError.requestId}</span>
                        ) : null}
                      </FeedbackCallout>
                    ) : null}
                    {pipelineSteps.length === 0 && !pipelineLoading ? (
                      <FeedbackEmptyState
                        variant="compact"
                        kicker="流水线"
                        title="暂无可串联的处理记录"
                        description="这条记录可能缺少定位编号，因此暂时无法把前后链路完整串起来。"
                      />
                    ) : (
                      <div className="grid gap-2">
                        {pipelineSteps.map(({ run, stage }) => {
                          const active = run.id === selectedRun.id;
                          const failed = Boolean(run.error);
                          return (
                            <button
                              key={run.id}
                              aria-label={`pipeline 运行编号: ${String(run.id ?? "")} ${failed ? "失败" : "完成"}`}
                              className={
                                active
                                  ? "ui-focus-ring ui-transition-fast rounded-atelier border border-accent/40 bg-accent/10 px-3 py-2 text-left text-xs text-ink"
                                  : "ui-focus-ring ui-transition-fast rounded-atelier border border-border bg-canvas px-3 py-2 text-left text-xs text-subtext hover:bg-surface hover:text-ink"
                              }
                              onClick={() => props.onSelectRun(run)}
                              type="button"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 truncate">
                                  <span className="mr-2">{formatStageLabel(stage)}</span>
                                  <span className="mr-2 font-mono">{String(run.type ?? "")}</span>
                                  <span className="truncate font-mono">运行编号: {String(run.id ?? "")}</span>
                                </div>
                                <span className="shrink-0 font-mono text-[11px] text-subtext">
                                  {failed ? "失败" : "完成"}
                                </span>
                              </div>
                              {run.request_id ? (
                                <div className="mt-1 truncate font-mono text-[11px] text-subtext">
                                  定位编号: {String(run.request_id ?? "")}
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </FeedbackDisclosure>

                {memoryLog ? (
                  <FeedbackDisclosure
                    defaultOpen
                    className="drawer-workbench-disclosure"
                    summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                    title="记忆取材记录（memory_retrieval_log_json）"
                  >
                    <div className="mt-3 grid gap-2 text-xs text-subtext">
                      <div>
                        是否启用：{Boolean(memoryLog.enabled) ? "已启用" : "未启用"} | 所处阶段：{String(memoryLog.phase ?? "未记录")}
                      </div>
                      <div className="truncate">本次取材问题：{String(memoryLog.query_text ?? "")}</div>
                      {Array.isArray(memoryLog.errors) && memoryLog.errors.length ? (
                        <FeedbackCallout className="text-xs" tone="warning" title="记忆检索返回提醒">
                          {memoryLog.errors.join(", ")}
                        </FeedbackCallout>
                      ) : null}
                    </div>

                    {perSection ? (
                      <div className="mt-3 grid gap-2">
                        {Object.entries(perSection)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([section, raw]) => {
                            const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
                            const enabled = Boolean(o.enabled);
                            const disabledReason = typeof o.disabled_reason === "string" ? o.disabled_reason : null;
                            return (
                              <div key={section} className="drawer-workbench-subcard">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-ink">
                                    {formatMemorySectionLabel(section)}
                                    <span className="ml-2 font-mono text-[11px] text-subtext">{section}</span>
                                  </span>
                                  {enabled ? (
                                    <span className="text-success">已启用</span>
                                  ) : (
                                    <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
                                      已关闭：{disabledReason ?? "未知原因"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <pre className="drawer-workbench-codeblock mt-3">
                        {JSON.stringify(memoryLog, null, 2)}
                      </pre>
                    )}
                  </FeedbackDisclosure>
                ) : null}

                <FeedbackDisclosure
                  defaultOpen
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title="这次运行设置（params）"
                >
                  <div className="mt-3 text-xs text-subtext">这里记录的是这次生成真正使用的设置与控制项，适合在你怀疑“为什么这次结果不一样”时回看。</div>
                  <pre className="drawer-workbench-codeblock mt-3">
                    {JSON.stringify(selectedRun.params ?? {}, null, 2)}
                  </pre>
                </FeedbackDisclosure>
                <FeedbackDisclosure
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title="系统提示词正文"
                >
                  <pre className="drawer-workbench-codeblock mt-3">
                    {selectedRun.prompt_system ?? ""}
                  </pre>
                </FeedbackDisclosure>
                <FeedbackDisclosure
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title="用户提示词正文"
                >
                  <pre className="drawer-workbench-codeblock mt-3">
                    {selectedRun.prompt_user ?? ""}
                  </pre>
                </FeedbackDisclosure>
                <FeedbackDisclosure
                  defaultOpen
                  className="drawer-workbench-disclosure"
                  summaryClassName="ui-transition-fast cursor-pointer text-xs text-subtext hover:text-ink"
                  title="生成结果或错误记录"
                >
                  <pre className="drawer-workbench-codeblock mt-3">
                    {selectedRun.error ? JSON.stringify(selectedRun.error, null, 2) : (selectedRun.output_text ?? "")}
                  </pre>
                </FeedbackDisclosure>
              </div>
            )}
          </WritingDrawerSection>
        </div>
      </div>
    </Drawer>
  );
}
