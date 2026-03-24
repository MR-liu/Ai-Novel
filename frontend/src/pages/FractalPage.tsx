import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { DebugDetails, DebugPageShell } from "../components/atelier/DebugPageShell";
import { ResearchWorkbenchPanel } from "../components/layout/ResearchWorkbenchPanel";
import { FeedbackCallout } from "../components/ui/Feedback";
import { RequestIdBadge } from "../components/ui/RequestIdBadge";
import { ApiError, apiJson } from "../services/apiClient";
import { useToast } from "../components/ui/toast";
import { copyText } from "../lib/copyText";
import { UI_COPY } from "../lib/uiCopy";
import { SYSTEM_WORKBENCH_COPY } from "./systemWorkbenchModels";

type PromptBlock = {
  identifier: string;
  role: string;
  text_md: string;
};

type FractalV2Info = {
  enabled?: boolean;
  status?: string;
  disabled_reason?: string;
  summary_md?: string;
  provider?: string;
  model?: string;
  run_id?: string;
  finish_reason?: string | null;
  latency_ms?: number;
  dropped_params?: string[];
  warnings?: string[];
  error_code?: string;
  error_type?: string;
  parse_error?: unknown;
};

type FractalContext = {
  enabled: boolean;
  disabled_reason?: string | null;
  config?: Record<string, unknown>;
  v2?: FractalV2Info;
  prompt_block?: PromptBlock;
  prompt_block_v2?: PromptBlock;
  updated_at?: string;
};

export function FractalPage() {
  const { projectId } = useParams();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<FractalContext | null>(null);

  const copyPreviewBlock = useCallback(
    async (text: string, opts: { emptyMessage: string; successMessage: string; dialogTitle: string }) => {
      if (!text.trim()) {
        toast.toastError(opts.emptyMessage, requestId ?? undefined);
        return;
      }
      const ok = await copyText(text, { title: opts.dialogTitle });
      if (ok) toast.toastSuccess(opts.successMessage, requestId ?? undefined);
      else toast.toastWarning("自动复制失败：已打开手动复制弹窗。", requestId ?? undefined);
    },
    [requestId, toast],
  );

  const loadFractal = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<{ result: FractalContext }>(`/api/projects/${projectId}/fractal`);
      setResult(res.data?.result ?? null);
      setRequestId(res.request_id ?? null);
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
      setError(err);
      setRequestId(err.requestId ?? null);
      toast.toastError(`${err.message} (${err.code})`, err.requestId);
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  const rebuild = useCallback(
    async (mode: "deterministic" | "llm_v2") => {
      if (!projectId) return;
      setLoading(true);
      setError(null);
      try {
        const reason = mode === "llm_v2" ? "manual_rebuild_v2" : "manual_rebuild";
        const res = await apiJson<{ result: FractalContext }>(`/api/projects/${projectId}/fractal/rebuild`, {
          method: "POST",
          body: JSON.stringify({ reason, mode }),
        });
        setResult(res.data?.result ?? null);
        setRequestId(res.request_id ?? null);
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError({ code: "UNKNOWN", message: String(e), requestId: "unknown", status: 0 });
        setError(err);
        setRequestId(err.requestId ?? null);
        toast.toastError(`${err.message} (${err.code})`, err.requestId);
      } finally {
        setLoading(false);
      }
    },
    [projectId, toast],
  );

  useEffect(() => {
    if (!projectId) return;
    void loadFractal();
  }, [loadFractal, projectId]);

  const v2 = result?.v2 ?? null;
  const v2Enabled = Boolean(v2?.enabled);
  const fractalEnabled = Boolean(result?.enabled);
  const fractalStatusText = result
    ? fractalEnabled
      ? "已启用"
      : `未启用（原因：${result.disabled_reason ?? "unknown"}）`
    : "未加载";
  const v2StatusText = result
    ? v2Enabled
      ? "已启用"
      : v2
        ? `未启用（原因：${v2.disabled_reason ?? v2.status ?? "unknown"}）`
        : "未启用（缺少智能摘要结果 / missing）"
    : "未加载";
  const conclusionText = result
    ? !fractalEnabled
      ? "结论：长期记忆当前不可用（未构建或被禁用）。"
      : v2Enabled
        ? "结论：当前注入将优先使用智能摘要（LLM / v2）。"
        : "结论：当前注入将使用稳定摘要（deterministic）。"
    : "结论：尚未加载长期记忆结果。";
  const activeStrategyText = !result
    ? "尚未加载"
    : !fractalEnabled
      ? "当前不可用"
      : v2Enabled
        ? "当前采用智能摘要（LLM）"
        : "当前采用稳定摘要";
  const nextActionText = !result
    ? "先刷新一次，确认长期记忆当前有没有结果。"
    : !fractalEnabled
      ? "先重建稳定摘要，确认长期记忆底座能否恢复基础内容。"
      : !v2Enabled
        ? "如果想比较效果，可以再重建一次智能摘要；如果现在只求稳定，保持稳定摘要也可以。"
        : "先比较左右两版摘要差异，再决定是否保留当前的智能摘要。";
  const deterministicPreview = result?.prompt_block?.text_md ?? "";
  const llmPreview = result?.prompt_block_v2?.text_md ?? "";
  const metaSummary = [
    `模型来源（provider）=${v2?.provider ?? "-"}`,
    `模型（model）=${v2?.model ?? "-"}`,
    `耗时（latency_ms）=${typeof v2?.latency_ms === "number" ? String(v2.latency_ms) : "-"}`,
    `运行 ID（run_id）=${v2?.run_id ?? "-"}`,
  ].join(" | ");

  return (
    <DebugPageShell
      eyebrow="系统与任务 / 长期记忆"
      title="长期记忆回看台"
      description="对照当前长期记忆到底用了哪一种摘要策略，以及这层摘要实际会向生成注入什么内容，适合在摘要异常或长期设定漂移时排查。"
      whenToUse="感觉长期记忆摘要不稳定、回忆错位，或者想比较稳定摘要和智能摘要哪个更适合当前项目时。"
      outcome="你会看到当前采用的摘要策略、最近结果和两版预览，便于判断问题是出在构建、模型还是摘要质量。"
      risk="这里属于底层记忆面板，会暴露提示词（prompt）和内部状态；适合短时校验，不适合长期挂在写作主界面。"
      actions={
        <>
          <button className="btn btn-secondary" onClick={() => void loadFractal()} disabled={loading} type="button">
            {loading ? "刷新..." : "刷新"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void rebuild("deterministic")}
            disabled={loading}
            type="button"
          >
            {loading ? "重建中..." : "重建稳定摘要"}
          </button>
          <button className="btn btn-primary" onClick={() => void rebuild("llm_v2")} disabled={loading} type="button">
            {loading ? "重建中..." : "重建智能摘要"}
          </button>
        </>
      }
    >
      <DebugDetails title={UI_COPY.help.title}>
        <div className="grid gap-2 text-xs text-subtext">
          <div>{UI_COPY.fractal.usageHint}</div>
          <FeedbackCallout className="text-xs" tone="warning" title="风险提醒">
            {UI_COPY.fractal.riskHint}
          </FeedbackCallout>
        </div>
      </DebugDetails>

      <section className="manuscript-status-band">
        <div className="grid gap-1">
          <div className="text-sm text-ink">{conclusionText}</div>
          <div className="text-xs text-subtext">建议动作：{nextActionText}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RequestIdBadge requestId={requestId} />
          <div className="manuscript-status-list">
            <span className="manuscript-chip">长期记忆：{fractalStatusText}</span>
            <span className="manuscript-chip">当前采用：{activeStrategyText}</span>
            <span className="manuscript-chip">智能摘要：{v2StatusText}</span>
            <span className="manuscript-chip">
              更新时间：{result?.updated_at ? result.updated_at : "尚未记录"}
            </span>
          </div>
        </div>
      </section>

      <ResearchWorkbenchPanel eyebrow="当前系统路径" {...SYSTEM_WORKBENCH_COPY.fractal} variant="compact" />

      {error ? (
        <FeedbackCallout
          tone="danger"
          title="长期记忆请求失败"
          actions={<RequestIdBadge requestId={error.requestId} />}
        >
          {error.message} ({error.code})
        </FeedbackCallout>
      ) : null}

      <section className="research-guide-panel">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">先判断当前长期记忆处于哪种状态</div>
            <div className="studio-cluster-copy">
              先看系统是不是可用、当前采用哪种摘要，再决定要不要重建或继续比对两版内容。
            </div>
          </div>
          <div className="studio-cluster-meta">先判断状态，再读正文预览</div>
        </div>
        <div className="studio-overview-grid lg:grid-cols-3">
          <div className="studio-overview-card is-emphasis">
            <div className="studio-overview-label">长期记忆</div>
            <div className="studio-overview-value">{fractalStatusText}</div>
            <div className="studio-overview-copy">这是整个长期记忆层是否可用的基础判断。</div>
          </div>
          <div className="studio-overview-card">
            <div className="studio-overview-label">当前采用摘要</div>
            <div className="studio-overview-value">{activeStrategyText}</div>
            <div className="studio-overview-copy">
              {v2Enabled ? "当前生成会优先使用智能摘要。" : "当前生成会回退到稳定摘要。"}
            </div>
          </div>
          <div className="studio-overview-card">
            <div className="studio-overview-label">运行信息</div>
            <div className="studio-overview-value">{result?.updated_at ? result.updated_at : "尚未记录更新时间"}</div>
            <div className="studio-overview-copy">{metaSummary}</div>
          </div>
        </div>
        {!fractalEnabled ? (
          <FeedbackCallout className="mt-4" tone="warning" title="长期记忆当前不可用">
            建议先重建稳定摘要恢复基础内容，再考虑是否开启智能摘要。
          </FeedbackCallout>
        ) : null}
        {v2?.warnings?.length ? (
          <FeedbackCallout className="mt-4" tone="warning" title="智能摘要提醒">
            {v2.warnings.join(" | ")}
          </FeedbackCallout>
        ) : null}
      </section>

      <section className="panel p-4">
        <div className="studio-cluster-header">
          <div>
            <div className="studio-cluster-title">双版本对照预览</div>
            <div className="studio-cluster-copy">
              左边是稳定但更保守的确定性摘要，右边是更灵活的 LLM 摘要。先看信息有没有漏掉，再看语气和结构是否更适合小说创作。
            </div>
          </div>
          <div className="studio-cluster-meta">先看覆盖度，再看表达质量</div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-ink">稳定摘要（deterministic）</div>
              <div className="flex items-center gap-2 text-xs text-subtext">
                <span className="truncate">{result?.prompt_block?.identifier ?? "-"}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!deterministicPreview}
                  onClick={() =>
                    void copyPreviewBlock(deterministicPreview, {
                      emptyMessage: "没有可复制的稳定摘要预览",
                      successMessage: "已复制稳定摘要预览",
                      dialogTitle: "复制失败：请手动复制稳定摘要预览",
                    })
                  }
                  type="button"
                >
                  {UI_COPY.common.copy}
                </button>
              </div>
            </div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              更稳定，适合先确认长期记忆层有没有覆盖到核心设定与角色事实。
            </div>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-ink">
              {deterministicPreview || "（空）"}
            </pre>
          </div>

          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-ink">智能摘要（LLM / v2）</div>
              <div className="flex items-center gap-2 text-xs text-subtext">
                <span className="truncate">{result?.prompt_block_v2?.identifier ?? "-"}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!llmPreview}
                  onClick={() =>
                    void copyPreviewBlock(llmPreview, {
                      emptyMessage: "没有可复制的智能摘要预览",
                      successMessage: "已复制智能摘要预览",
                      dialogTitle: "复制失败：请手动复制智能摘要预览",
                    })
                  }
                  type="button"
                >
                  {UI_COPY.common.copy}
                </button>
              </div>
            </div>
            <div className="mt-2 text-xs leading-6 text-subtext">
              更灵活，适合观察长期记忆是否能被整理成更像作者笔记的摘要，但也更容易受模型波动影响。
            </div>
            {!v2Enabled ? (
              <FeedbackCallout className="mt-3 text-xs" tone="warning" title="智能摘要当前未启用">
                智能摘要当前未启用，将回退至稳定摘要。原因：{v2?.disabled_reason ?? v2?.status ?? "未知原因"}
                {v2?.error_code ? ` | 错误码（error_code）=${v2.error_code}` : ""}
                {v2?.error_type ? ` | 错误类型（error_type）=${v2.error_type}` : ""}
              </FeedbackCallout>
            ) : null}
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-ink">
              {llmPreview || "（空）"}
            </pre>
          </div>
        </div>
      </section>

      <DebugDetails title="仅在排障时查看高级调试信息">
        <div className="grid gap-2 text-xs text-subtext">
          <div>智能摘要运行信息（v2_meta）：{metaSummary}</div>
          {v2?.finish_reason ? <div>完成原因（v2_finish_reason）：{String(v2.finish_reason)}</div> : null}
          {v2?.warnings?.length ? <div>警告（v2_warnings）：{v2.warnings.join(" | ")}</div> : null}
          {v2?.dropped_params?.length ? <div>被丢弃参数（v2_dropped_params）：{v2.dropped_params.join(" | ")}</div> : null}
          {v2?.parse_error ? (
            <div className="rounded-atelier border border-border bg-canvas p-3">
              <div className="flex items-center justify-end">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    void copyPreviewBlock(JSON.stringify(v2.parse_error, null, 2), {
                      emptyMessage: "还没有可复制的解析错误（parse_error）",
                      successMessage: "已复制解析错误（parse_error）",
                      dialogTitle: "复制失败：请手动复制解析错误（parse_error）",
                    })
                  }
                  type="button"
                >
                  {UI_COPY.common.copy}
                </button>
              </div>
              <div className="mt-2 text-xs text-subtext">解析错误（parse_error）</div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-ink">
                {JSON.stringify(v2.parse_error, null, 2)}
              </pre>
            </div>
          ) : null}
          <div className="rounded-atelier border border-border bg-canvas p-3">
            <div className="flex items-center justify-end">
              <button
                className="btn btn-secondary btn-sm"
                disabled={!result?.config}
                onClick={() =>
                  void copyPreviewBlock(JSON.stringify(result?.config ?? {}, null, 2), {
                    emptyMessage: "还没有可复制的配置快照（config JSON）",
                    successMessage: "已复制配置快照（config JSON）",
                    dialogTitle: "复制失败：请手动复制配置快照（config JSON）",
                  })
                }
                type="button"
              >
                {UI_COPY.common.copy}
              </button>
            </div>
            <div className="mt-2 text-xs text-subtext">配置快照（config JSON）</div>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-ink">
              {JSON.stringify(result?.config ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </DebugDetails>
    </DebugPageShell>
  );
}
