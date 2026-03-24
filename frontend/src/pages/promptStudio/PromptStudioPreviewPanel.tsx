import { useMemo, type ChangeEvent } from "react";

import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../components/ui/Feedback";
import { RequestIdBadge } from "../../components/ui/RequestIdBadge";
import { copyText } from "../../lib/copyText";
import type { PromptPreview } from "../../types";
import type { PromptStudioTask } from "./types";

const ROLE_LABELS: Record<string, string> = {
  system: "总控说明",
  user: "写作指令",
  assistant: "参考口吻",
  tool: "工具结果",
};

export function PromptStudioPreviewPanel(props: {
  busy: boolean;
  selectedPresetId: string | null;
  previewTask: string;
  setPreviewTask: (task: string) => void;
  tasks: PromptStudioTask[];
  previewLoading: boolean;
  runPreview: () => Promise<void>;
  requestId: string | null;
  preview: PromptPreview | null;
  templateErrors: Array<{ identifier: string; error: string }>;
  renderLog: unknown | null;
}) {
  const {
    busy,
    preview,
    previewLoading,
    previewTask,
    requestId,
    renderLog,
    runPreview,
    selectedPresetId,
    setPreviewTask,
    tasks,
    templateErrors,
  } = props;
  const taskLabelByKey = useMemo(() => new Map(tasks.map((task) => [task.key, task.label])), [tasks]);
  const selectedTaskLabel = taskLabelByKey.get(previewTask) ?? previewTask;
  const previewBlockCount = preview?.blocks?.length ?? 0;
  const templateErrorCount = templateErrors.length;
  const missingCount = preview?.missing?.length ?? 0;
  const budgetRatio =
    preview && preview.prompt_budget_tokens
      ? (preview.prompt_tokens_estimate ?? 0) / preview.prompt_budget_tokens
      : null;
  const budgetStatus =
    budgetRatio == null
      ? "未设置预算上限"
      : budgetRatio >= 1
        ? "已超过预算"
        : budgetRatio >= 0.85
          ? "接近预算"
          : "预算仍安全";
  const nextStepText = !preview
    ? "先选择一个任务跑一次检查，确认这套蓝图真正会把什么内容送进生成。"
    : templateErrorCount > 0
      ? "先修模板错误，再回头检查正文内容，否则这次生成很可能直接出问题。"
      : missingCount > 0
        ? "有变量还没补齐。建议先回编辑区确认这些占位符是否真的能在当前任务拿到值。"
        : budgetRatio != null && budgetRatio >= 0.85
          ? "提示内容已经偏长，建议删减重复片段或把信息改成更精炼的说明。"
          : "这次生成前检查没有明显阻塞，可以继续回到写作页或保存蓝图。";

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">生成前检查</div>
          <div className="mt-1 text-xs text-subtext">这里展示的是这套蓝图在当前任务下真正会送进模型的内容。先看最终稿，再判断哪些片段需要回头调整。</div>
          {requestId ? <RequestIdBadge className="mt-2" requestId={requestId} /> : null}
        </div>
        <div className="flex gap-2">
          <select
            className="select w-auto"
            value={previewTask}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setPreviewTask(e.target.value)}
            disabled={busy}
          >
            {tasks.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => void runPreview()}
            disabled={previewLoading || busy || !selectedPresetId}
            type="button"
          >
            {previewLoading ? "检查中…" : "检查这次生成"}
          </button>
        </div>
      </div>

      <div className="manuscript-status-list">
        <span className="manuscript-chip">当前任务：{selectedTaskLabel}</span>
        <span className="manuscript-chip">{preview ? `片段命中 ${previewBlockCount} 条` : "等待一次检查"}</span>
        <span className="manuscript-chip">{preview ? `模板错误 ${templateErrorCount} 项` : "尚未发现问题"}</span>
        <span className="manuscript-chip">{preview ? `缺失变量 ${missingCount} 项` : "缺失变量待检查"}</span>
        <span className="manuscript-chip">{preview ? `上下文字量：${preview.prompt_tokens_estimate ?? 0}` : "尚无字量估算"}</span>
      </div>

      <FeedbackCallout
        className="mt-4 text-xs"
        tone={templateErrorCount > 0 || missingCount > 0 ? "warning" : "info"}
        title={templateErrorCount > 0 || missingCount > 0 ? "这次检查有需要先处理的风险" : "这次检查的下一步建议"}
      >
        {nextStepText}
      </FeedbackCallout>

      {preview ? (
        <div className="grid gap-3">
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="surface p-3">
              <div className="text-xs text-subtext">本次送出内容</div>
              <div className="mt-2 text-sm font-semibold text-ink">{previewBlockCount} 条片段参与组合</div>
              <div className="mt-1 text-xs leading-5 text-subtext">
                总控说明和写作指令会按真实顺序拼装，这里看到的就是生成前最后一版。
              </div>
            </div>
            <div className="surface p-3">
              <div className="text-xs text-subtext">风险检查</div>
              <div className="mt-2 text-sm font-semibold text-ink">
                {templateErrorCount ? `${templateErrorCount} 条模板错误` : missingCount ? `${missingCount} 项变量缺口` : "当前未见明显阻塞"}
              </div>
              <div className="mt-1 text-xs leading-5 text-subtext">
                缺变量通常意味着上下文不完整；模板错误则更可能直接导致渲染失败。
              </div>
            </div>
            <div className="surface p-3">
              <div className="text-xs text-subtext">上下文字量预算</div>
              <div className="mt-2 text-sm font-semibold text-ink">{budgetStatus}</div>
              <div className="mt-1 text-xs leading-5 text-subtext">
                当前字量估算：{preview.prompt_tokens_estimate ?? 0}
                {preview.prompt_budget_tokens ? ` / 预算上限：${preview.prompt_budget_tokens}` : "；当前任务没有返回预算上限。"}
              </div>
            </div>
          </div>

          {templateErrors.length ? (
            <FeedbackCallout className="text-xs" tone="danger" title="模板错误">
              <div className="mt-1 text-subtext">这些片段在当前任务里已经无法正常渲染，建议先回编辑区逐条修正。</div>
              <div className="mt-2 grid gap-1 text-subtext">
                {templateErrors.map((item) => (
                  <div key={`${item.identifier}:${item.error}`}>
                    <span className="text-ink">片段：</span>
                    <span className="font-mono text-ink">{item.identifier}</span>
                    <span className="text-subtext">：{item.error}</span>
                  </div>
                ))}
              </div>
            </FeedbackCallout>
          ) : null}

          {preview.missing?.length ? (
            <FeedbackCallout className="text-xs" tone="warning" title="缺失变量">
              <div className="mt-1 text-subtext">这些占位符在当前任务上下文里没有取到值：{preview.missing.join(", ")}</div>
            </FeedbackCallout>
          ) : null}

          {renderLog ? (
            <FeedbackDisclosure
              className="rounded-atelier border border-border bg-surface/50 p-3"
              summaryClassName="px-0 py-0 text-sm hover:text-ink"
              bodyClassName="pt-2"
              title="查看排查细节（裁剪原因 / 错误 / 渲染细节）"
            >
              <div className="text-xs text-subtext">这里展示原始排查 JSON，主要用于定位为什么某些片段被裁剪、报错或没有按预期参与组合。</div>
              <div className="mt-2 flex justify-end">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    await copyText(JSON.stringify(renderLog, null, 2), {
                      title: "复制失败：请手动复制排查记录 JSON",
                    });
                  }}
                  type="button"
                >
                  复制排查记录 JSON
                </button>
              </div>
              <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-atelier border border-border bg-surface p-3 text-xs">
                {JSON.stringify(renderLog, null, 2)}
              </pre>
            </FeedbackDisclosure>
          ) : null}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2 text-xs text-subtext">
                <span>总控说明正文（system）</span>
                <span>负责整体边界与写作规则</span>
              </div>
              <textarea
                readOnly
                className="textarea atelier-mono min-h-[180px] resize-y bg-surface py-2 text-xs"
                value={preview.system}
              />
            </div>
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2 text-xs text-subtext">
                <span>写作指令正文（user）</span>
                <span>负责这次具体的生成任务</span>
              </div>
              <textarea
                readOnly
                className="textarea atelier-mono min-h-[180px] resize-y bg-surface py-2 text-xs"
                value={preview.user}
              />
            </div>
          </div>

          <FeedbackDisclosure
            className="rounded-atelier border border-border bg-surface/50 p-3"
            summaryClassName="px-0 py-0 text-sm hover:text-ink"
            bodyClassName="pt-3"
            title="逐条核对片段渲染结果"
          >
            <div className="mt-3 grid gap-2">
              {(preview.blocks ?? []).map((pb) => (
                <div key={pb.id} className="surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      片段：{pb.identifier}{" "}
                      <span className="text-xs text-subtext">（{ROLE_LABELS[pb.role] ?? pb.role}）</span>
                    </div>
                    <div className="text-xs text-subtext">
                      字量估算：{pb.token_estimate ?? 0}
                      {pb.missing?.length ? ` · 缺变量：${pb.missing.join(", ")}` : ""}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-subtext">
                    {pb.enabled ? "当前参与" : "当前未参与"}；这里展示的是该片段实际送进组合前的最终文本。
                  </div>
                  <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-atelier border border-border bg-surface p-3 text-xs">
                    {pb.text}
                  </pre>
                </div>
              ))}
            </div>
          </FeedbackDisclosure>
        </div>
      ) : (
        <FeedbackEmptyState
          className="mt-4"
          title="还没有预览结果"
          description="选择任务并点击“检查这次生成”，先确认这套蓝图在目标任务里会产出什么。"
        />
      )}
    </div>
  );
}
