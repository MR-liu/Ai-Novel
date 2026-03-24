import type { Dispatch, SetStateAction } from "react";

import { FeedbackCallout, FeedbackDisclosure, FeedbackEmptyState } from "../../components/ui/Feedback";
import { RequestIdBadge } from "../../components/ui/RequestIdBadge";
import { UI_COPY } from "../../lib/uiCopy";
import {
  formatEmbeddingSummary,
  formatRerankMethodLabel,
  formatRerankSummary,
  formatVectorProviderLabel,
} from "../../lib/vectorRagCopy";
import type { ProjectSettings } from "../../types";

import type { VectorEmbeddingDryRunResult, VectorRagForm, VectorRerankDryRunResult } from "./models";

type DryRunErrorState = {
  message: string;
  code: string;
  requestId?: string;
};

type DryRunState<T> = { requestId: string; result: T };

export type PromptsVectorRagSectionProps = {
  baselineSettings: ProjectSettings | null;
  vectorForm: VectorRagForm;
  setVectorForm: Dispatch<SetStateAction<VectorRagForm>>;
  vectorRerankTopKDraft: string;
  setVectorRerankTopKDraft: Dispatch<SetStateAction<string>>;
  vectorRerankTimeoutDraft: string;
  setVectorRerankTimeoutDraft: Dispatch<SetStateAction<string>>;
  vectorRerankHybridAlphaDraft: string;
  setVectorRerankHybridAlphaDraft: Dispatch<SetStateAction<string>>;
  vectorApiKeyDraft: string;
  setVectorApiKeyDraft: Dispatch<SetStateAction<string>>;
  vectorApiKeyClearRequested: boolean;
  setVectorApiKeyClearRequested: Dispatch<SetStateAction<boolean>>;
  rerankApiKeyDraft: string;
  setRerankApiKeyDraft: Dispatch<SetStateAction<string>>;
  rerankApiKeyClearRequested: boolean;
  setRerankApiKeyClearRequested: Dispatch<SetStateAction<boolean>>;
  savingVector: boolean;
  vectorRagDirty: boolean;
  vectorApiKeyDirty: boolean;
  rerankApiKeyDirty: boolean;
  embeddingProviderPreview: string;
  embeddingDryRunLoading: boolean;
  embeddingDryRun: DryRunState<VectorEmbeddingDryRunResult> | null;
  embeddingDryRunError: DryRunErrorState | null;
  rerankDryRunLoading: boolean;
  rerankDryRun: DryRunState<VectorRerankDryRunResult> | null;
  rerankDryRunError: DryRunErrorState | null;
  onSave: () => void;
  onRunEmbeddingDryRun: () => void;
  onRunRerankDryRun: () => void;
};

export function PromptsVectorRagSection(props: PromptsVectorRagSectionProps) {
  const {
    baselineSettings,
    vectorForm,
    setVectorForm,
    vectorRerankTopKDraft,
    setVectorRerankTopKDraft,
    vectorRerankTimeoutDraft,
    setVectorRerankTimeoutDraft,
    vectorRerankHybridAlphaDraft,
    setVectorRerankHybridAlphaDraft,
    vectorApiKeyDraft,
    setVectorApiKeyDraft,
    vectorApiKeyClearRequested,
    setVectorApiKeyClearRequested,
    rerankApiKeyDraft,
    setRerankApiKeyDraft,
    rerankApiKeyClearRequested,
    setRerankApiKeyClearRequested,
    savingVector,
    vectorRagDirty,
    vectorApiKeyDirty,
    rerankApiKeyDirty,
    embeddingProviderPreview,
    embeddingDryRunLoading,
    embeddingDryRun,
    embeddingDryRunError,
    rerankDryRunLoading,
    rerankDryRun,
    rerankDryRunError,
    onSave,
    onRunEmbeddingDryRun,
    onRunRerankDryRun,
  } = props;

  return (
    <section className="panel p-6" id="rag-config" aria-label={UI_COPY.vectorRag.title} role="region">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="font-content text-xl text-ink">{UI_COPY.vectorRag.title}</div>
          <div className="text-xs text-subtext">{UI_COPY.vectorRag.subtitle}</div>
          <div className="text-xs text-subtext">{UI_COPY.vectorRag.apiKeyHint}</div>
        </div>
        <button
          className="btn btn-primary"
          disabled={savingVector || (!vectorRagDirty && !vectorApiKeyDirty && !rerankApiKeyDirty)}
          onClick={onSave}
          type="button"
        >
          {UI_COPY.vectorRag.save}
        </button>
      </div>

      <div className="manuscript-status-list mt-4">
        <span className="manuscript-chip">{baselineSettings ? "资料策略已加载" : "正在加载资料策略"}</span>
        <span className="manuscript-chip">{vectorRagDirty ? "有未保存资料参数" : "资料参数已同步"}</span>
        <span className="manuscript-chip">
          {vectorApiKeyDirty || rerankApiKeyDirty ? "有未保存访问密钥" : "访问密钥未变动"}
        </span>
      </div>

      <FeedbackCallout className="mt-4 text-xs" title="什么时候该来这里">
        如果问题是“找不到该引用的资料”或“命中的片段不够准”，优先在这里排查；如果问题是成文语气、结构或片段顺序，就回模板库或蓝图编排台。
      </FeedbackCallout>

      {baselineSettings ? (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="surface p-3">
              <div className="text-xs text-subtext">资料召回</div>
              <div className="mt-2 text-sm font-semibold text-ink">{formatEmbeddingSummary(baselineSettings)}</div>
            </div>
            <div className="surface p-3">
              <div className="text-xs text-subtext">结果排序</div>
              <div className="mt-2 text-sm font-semibold text-ink">{formatRerankSummary(baselineSettings)}</div>
            </div>
            <div className="surface p-3">
              <div className="text-xs text-subtext">什么时候该回别的页</div>
              <div className="mt-2 text-sm font-semibold text-ink">
                资料找不到或排序不准时留在这里；文案、风格和片段拼装问题则回提示词方案、模板库或蓝图编排台。
              </div>
            </div>
          </div>

          <div className="rounded-atelier border border-border bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-ink">{UI_COPY.vectorRag.dryRunTitle}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={
                    savingVector ||
                    embeddingDryRunLoading ||
                    rerankDryRunLoading ||
                    vectorRagDirty ||
                    vectorApiKeyDirty ||
                    rerankApiKeyDirty
                  }
                  onClick={onRunEmbeddingDryRun}
                  type="button"
                >
                  {embeddingDryRunLoading ? "检查中…" : UI_COPY.vectorRag.dryRunEmbeddingAction}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={
                    savingVector ||
                    embeddingDryRunLoading ||
                    rerankDryRunLoading ||
                    vectorRagDirty ||
                    vectorApiKeyDirty ||
                    rerankApiKeyDirty
                  }
                  onClick={onRunRerankDryRun}
                  type="button"
                >
                  {rerankDryRunLoading ? "检查中…" : UI_COPY.vectorRag.dryRunRerankAction}
                </button>
              </div>
            </div>
            {vectorRagDirty || vectorApiKeyDirty || rerankApiKeyDirty ? (
              <FeedbackCallout className="mt-3 text-xs" tone="warning" title="检查前先保存">
                先保存当前资料策略，再做检查。测试只会使用“已保存”的配置。
              </FeedbackCallout>
            ) : null}

            {embeddingDryRunError ? (
              <FeedbackCallout className="mt-3 text-xs" tone="danger" title="资料召回检查没有通过">
                <div>
                  {embeddingDryRunError.message} ({embeddingDryRunError.code})
                </div>
                <RequestIdBadge requestId={embeddingDryRunError.requestId} className="mt-2" />
                <div className="mt-1 text-[11px] text-subtext">
                  建议先检查召回服务地址、模型名和访问密钥；如果还要继续排查，再根据 request_id 查日志。
                </div>
              </FeedbackCallout>
            ) : null}

            {embeddingDryRun ? (
              <div className="mt-3 rounded-atelier border border-border bg-surface p-3">
                <div className="text-xs text-subtext">
                  资料召回：{embeddingDryRun.result.enabled ? "可用" : "暂不可用"}；向量维度：
                  {embeddingDryRun.result.dims ?? "（未知）"}；耗时：
                  {embeddingDryRun.result.timings_ms?.total ?? "（未知）"}ms
                  {embeddingDryRun.result.error ? `；返回：${embeddingDryRun.result.error}` : ""}
                </div>
                <RequestIdBadge requestId={embeddingDryRun.requestId} className="mt-2" />
              </div>
            ) : null}

            {rerankDryRunError ? (
              <FeedbackCallout className="mt-3 text-xs" tone="danger" title="结果排序检查没有通过">
                <div>
                  {rerankDryRunError.message} ({rerankDryRunError.code})
                </div>
                <RequestIdBadge requestId={rerankDryRunError.requestId} className="mt-2" />
                <div className="mt-1 text-[11px] text-subtext">
                  建议先检查重排服务地址、模型名和访问密钥；若使用外部排序接口，再确认 `/v1/rerank` 可访问。
                </div>
              </FeedbackCallout>
            ) : null}

            {rerankDryRun ? (
              <div className="mt-3 rounded-atelier border border-border bg-surface p-3">
                <div className="text-xs text-subtext">
                  结果排序：{rerankDryRun.result.enabled ? "可用" : "暂不可用"}；方式：
                  {formatRerankMethodLabel(rerankDryRun.result.method ?? "")}；服务：
                  {formatVectorProviderLabel(
                    (rerankDryRun.result.rerank as { provider?: string } | undefined)?.provider ?? "",
                    "（未知）",
                  )}；耗时：
                  {rerankDryRun.result.timings_ms?.total ?? "（未知）"}ms；当前排序：
                  {(rerankDryRun.result.order ?? []).join(" → ") || "（空）"}
                </div>
                <RequestIdBadge requestId={rerankDryRun.requestId} className="mt-2" />
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="text-sm text-ink">结果排序</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-ink sm:col-span-3">
                <input
                  className="checkbox"
                  checked={vectorForm.vector_rerank_enabled}
                  onChange={(e) => setVectorForm((v) => ({ ...v, vector_rerank_enabled: e.target.checked }))}
                  type="checkbox"
                  name="vector_rerank_enabled"
                />
                启用结果排序（让候选片段更贴近当前问题）
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-subtext">重排方式（method）</span>
                <select
                  className="select"
                  value={vectorForm.vector_rerank_method}
                  onChange={(e) => setVectorForm((v) => ({ ...v, vector_rerank_method: e.target.value }))}
                  name="vector_rerank_method"
                >
                  <option value="auto">auto</option>
                  <option value="rapidfuzz_token_set_ratio">rapidfuzz_token_set_ratio</option>
                  <option value="token_overlap">token_overlap</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-subtext">候选片段数（top_k）</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={1000}
                  value={vectorRerankTopKDraft}
                  onBlur={() => {
                    const raw = vectorRerankTopKDraft.trim();
                    if (!raw) {
                      setVectorRerankTopKDraft(String(vectorForm.vector_rerank_top_k));
                      return;
                    }
                    const next = Math.floor(Number(raw));
                    if (!Number.isFinite(next)) {
                      setVectorRerankTopKDraft(String(vectorForm.vector_rerank_top_k));
                      return;
                    }
                    const clamped = Math.max(1, Math.min(1000, next));
                    setVectorForm((v) => ({ ...v, vector_rerank_top_k: clamped }));
                    setVectorRerankTopKDraft(String(clamped));
                  }}
                  onChange={(e) => setVectorRerankTopKDraft(e.target.value)}
                  name="vector_rerank_top_k"
                />
              </label>
            </div>
            <div className="text-[11px] text-subtext">
              提示：启用后会对候选片段做二次排序，通常命中更准，但也可能增加耗时或外部调用成本。
            </div>
          </div>

          <FeedbackDisclosure
            className="rounded-atelier border border-border bg-canvas p-4"
            summaryClassName="px-0 py-0 text-sm text-ink hover:text-ink"
            bodyClassName="pt-4"
            title={UI_COPY.vectorRag.rerankConfigDetailsTitle}
          >
            <div className="grid gap-4">
              <div className="text-xs text-subtext">
                {UI_COPY.vectorRag.backendEnvFallbackHint}
              </div>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankProviderLabel}</span>
                <select
                  className="select"
                  value={vectorForm.vector_rerank_provider}
                  onChange={(e) => setVectorForm((v) => ({ ...v, vector_rerank_provider: e.target.value }))}
                  name="vector_rerank_provider"
                >
                  <option value="">（沿用系统默认服务）</option>
                  <option value="external_rerank_api">外部排序接口（external_rerank_api）</option>
                </select>
                <div className="text-[11px] text-subtext">
                  当前有效：{formatVectorProviderLabel(baselineSettings.vector_rerank_effective_provider)}
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankBaseUrlLabel}</span>
                <input
                  className="input"
                  value={vectorForm.vector_rerank_base_url}
                  onChange={(e) => {
                    const next = e.target.value;
                    setVectorForm((v) => {
                      const shouldAutoSetProvider = !v.vector_rerank_provider.trim() && next.trim().length > 0;
                      return {
                        ...v,
                        vector_rerank_base_url: next,
                        ...(shouldAutoSetProvider ? { vector_rerank_provider: "external_rerank_api" } : {}),
                      };
                    });
                  }}
                  name="vector_rerank_base_url"
                />
                <div className="text-[11px] text-subtext">
                  当前有效：{baselineSettings.vector_rerank_effective_base_url || "（空）"}
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankModelLabel}</span>
                <input
                  className="input"
                  value={vectorForm.vector_rerank_model}
                  onChange={(e) => setVectorForm((v) => ({ ...v, vector_rerank_model: e.target.value }))}
                  name="vector_rerank_model"
                />
                <div className="text-[11px] text-subtext">
                  当前有效：{baselineSettings.vector_rerank_effective_model || "（空）"}
                </div>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankTimeoutLabel}</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={120}
                    value={vectorRerankTimeoutDraft}
                    onBlur={() => {
                      const raw = vectorRerankTimeoutDraft.trim();
                      if (!raw) {
                        setVectorForm((v) => ({ ...v, vector_rerank_timeout_seconds: null }));
                        setVectorRerankTimeoutDraft("");
                        return;
                      }
                      const next = Math.floor(Number(raw));
                      if (!Number.isFinite(next)) {
                        setVectorRerankTimeoutDraft(
                          vectorForm.vector_rerank_timeout_seconds != null
                            ? String(vectorForm.vector_rerank_timeout_seconds)
                            : "",
                        );
                        return;
                      }
                      const clamped = Math.max(1, Math.min(120, next));
                      setVectorForm((v) => ({ ...v, vector_rerank_timeout_seconds: clamped }));
                      setVectorRerankTimeoutDraft(String(clamped));
                    }}
                    onChange={(e) => setVectorRerankTimeoutDraft(e.target.value)}
                    name="vector_rerank_timeout_seconds"
                  />
                  <div className="text-[11px] text-subtext">
                    当前有效：{baselineSettings.vector_rerank_effective_timeout_seconds ?? 15}
                  </div>
                </label>

                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankHybridAlphaLabel}</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={vectorRerankHybridAlphaDraft}
                    onBlur={() => {
                      const raw = vectorRerankHybridAlphaDraft.trim();
                      if (!raw) {
                        setVectorForm((v) => ({ ...v, vector_rerank_hybrid_alpha: null }));
                        setVectorRerankHybridAlphaDraft("");
                        return;
                      }
                      const next = Number(raw);
                      if (!Number.isFinite(next)) {
                        setVectorRerankHybridAlphaDraft(
                          vectorForm.vector_rerank_hybrid_alpha != null
                            ? String(vectorForm.vector_rerank_hybrid_alpha)
                            : "",
                        );
                        return;
                      }
                      const clamped = Math.max(0, Math.min(1, next));
                      setVectorForm((v) => ({ ...v, vector_rerank_hybrid_alpha: clamped }));
                      setVectorRerankHybridAlphaDraft(String(clamped));
                    }}
                    onChange={(e) => setVectorRerankHybridAlphaDraft(e.target.value)}
                    name="vector_rerank_hybrid_alpha"
                  />
                  <div className="text-[11px] text-subtext">
                    当前有效：{baselineSettings.vector_rerank_effective_hybrid_alpha ?? 0}
                  </div>
                </label>
              </div>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankApiKeyLabel}</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={rerankApiKeyDraft}
                  onChange={(e) => {
                    setRerankApiKeyDraft(e.target.value);
                    setRerankApiKeyClearRequested(false);
                  }}
                  name="vector_rerank_api_key"
                />
                <div className="text-[11px] text-subtext">
                  已保存（项目覆盖）：
                  {baselineSettings.vector_rerank_has_api_key
                    ? baselineSettings.vector_rerank_masked_api_key
                    : "（无）"}
                  {baselineSettings.vector_rerank_effective_has_api_key
                    ? ` | 当前有效：${baselineSettings.vector_rerank_effective_masked_api_key}`
                    : " | 当前有效：（无）"}
                  {rerankApiKeyClearRequested ? UI_COPY.vectorRag.pendingClearSuffix : ""}
                </div>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={savingVector || !baselineSettings.vector_rerank_has_api_key}
                  onClick={() => {
                    setRerankApiKeyDraft("");
                    setRerankApiKeyClearRequested(true);
                  }}
                  type="button"
                >
                  {UI_COPY.vectorRag.rerankClearApiKey}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={savingVector}
                  onClick={() => {
                    setVectorForm((v) => ({
                      ...v,
                      vector_rerank_provider: "",
                      vector_rerank_base_url: "",
                      vector_rerank_model: "",
                      vector_rerank_timeout_seconds: null,
                      vector_rerank_hybrid_alpha: null,
                    }));
                    setVectorRerankTimeoutDraft("");
                    setVectorRerankHybridAlphaDraft("");
                    setRerankApiKeyDraft("");
                    setRerankApiKeyClearRequested(true);
                  }}
                  type="button"
                >
                  {UI_COPY.vectorRag.rerankResetOverrides}
                </button>
              </div>
            </div>
          </FeedbackDisclosure>

          <FeedbackDisclosure
            className="rounded-atelier border border-border bg-canvas p-4"
            summaryClassName="px-0 py-0 text-sm text-ink hover:text-ink"
            bodyClassName="pt-4"
            title={UI_COPY.vectorRag.embeddingTitle}
          >
            <div className="grid gap-4">
              <div className="text-xs text-subtext">
                {UI_COPY.vectorRag.backendEnvFallbackHint}
              </div>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingProviderLabel}</span>
                <select
                  className="select"
                  value={vectorForm.vector_embedding_provider}
                  onChange={(e) => setVectorForm((v) => ({ ...v, vector_embedding_provider: e.target.value }))}
                  name="vector_embedding_provider"
                >
                  <option value="">（沿用系统默认服务）</option>
                  <option value="openai_compatible">通用 OpenAI 接口（openai_compatible）</option>
                  <option value="azure_openai">Azure OpenAI（azure_openai）</option>
                  <option value="google">Google 接口（google）</option>
                  <option value="custom">自定义接口（custom）</option>
                  <option value="local_proxy">本地中转服务（local_proxy）</option>
                  <option value="sentence_transformers">本地向量模型（sentence_transformers）</option>
                </select>
                <div className="text-[11px] text-subtext">
                  当前有效：{formatVectorProviderLabel(baselineSettings.vector_embedding_effective_provider)}
                </div>
              </label>

              {embeddingProviderPreview === "azure_openai" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingAzureDeploymentLabel}</span>
                    <input
                      className="input"
                      value={vectorForm.vector_embedding_azure_deployment}
                      onChange={(e) =>
                        setVectorForm((v) => ({ ...v, vector_embedding_azure_deployment: e.target.value }))
                      }
                      name="vector_embedding_azure_deployment"
                    />
                    <div className="text-[11px] text-subtext">
                      当前有效：{baselineSettings.vector_embedding_effective_azure_deployment || "（空）"}
                    </div>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingAzureApiVersionLabel}</span>
                    <input
                      className="input"
                      value={vectorForm.vector_embedding_azure_api_version}
                      onChange={(e) =>
                        setVectorForm((v) => ({ ...v, vector_embedding_azure_api_version: e.target.value }))
                      }
                      name="vector_embedding_azure_api_version"
                    />
                    <div className="text-[11px] text-subtext">
                      当前有效：{baselineSettings.vector_embedding_effective_azure_api_version || "（空）"}
                    </div>
                  </label>
                </div>
              ) : null}

              {embeddingProviderPreview === "sentence_transformers" ? (
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingSentenceTransformersModelLabel}</span>
                  <input
                    className="input"
                    value={vectorForm.vector_embedding_sentence_transformers_model}
                    onChange={(e) =>
                      setVectorForm((v) => ({
                        ...v,
                        vector_embedding_sentence_transformers_model: e.target.value,
                      }))
                    }
                    name="vector_embedding_sentence_transformers_model"
                  />
                  <div className="text-[11px] text-subtext">
                    当前有效：{baselineSettings.vector_embedding_effective_sentence_transformers_model || "（空）"}
                  </div>
                </label>
              ) : null}

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingBaseUrlLabel}</span>
                <input
                  className="input"
                  id="vector_embedding_base_url"
                  name="vector_embedding_base_url"
                  value={vectorForm.vector_embedding_base_url}
                  onChange={(e) => setVectorForm((v) => ({ ...v, vector_embedding_base_url: e.target.value }))}
                />
                <div className="text-[11px] text-subtext">
                  当前有效：{baselineSettings.vector_embedding_effective_base_url || "（空）"}
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingModelLabel}</span>
                <input
                  className="input"
                  id="vector_embedding_model"
                  name="vector_embedding_model"
                  value={vectorForm.vector_embedding_model}
                  onChange={(e) => setVectorForm((v) => ({ ...v, vector_embedding_model: e.target.value }))}
                />
                <div className="text-[11px] text-subtext">
                  当前有效：{baselineSettings.vector_embedding_effective_model || "（空）"}
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingApiKeyLabel}</span>
                <input
                  className="input"
                  id="vector_embedding_api_key"
                  name="vector_embedding_api_key"
                  type="password"
                  autoComplete="off"
                  value={vectorApiKeyDraft}
                  onChange={(e) => {
                    setVectorApiKeyDraft(e.target.value);
                    setVectorApiKeyClearRequested(false);
                  }}
                />
                <div className="text-[11px] text-subtext">
                  已保存（项目覆盖）：
                  {baselineSettings.vector_embedding_has_api_key
                    ? baselineSettings.vector_embedding_masked_api_key
                    : "（无）"}
                  {baselineSettings.vector_embedding_effective_has_api_key
                    ? ` | 当前有效：${baselineSettings.vector_embedding_effective_masked_api_key}`
                    : " | 当前有效：（无）"}
                  {vectorApiKeyClearRequested ? UI_COPY.vectorRag.pendingClearSuffix : ""}
                </div>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={savingVector || !baselineSettings.vector_embedding_has_api_key}
                  onClick={() => {
                    setVectorApiKeyDraft("");
                    setVectorApiKeyClearRequested(true);
                  }}
                  type="button"
                >
                  {UI_COPY.vectorRag.embeddingClearApiKey}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={savingVector}
                  onClick={() => {
                    setVectorForm((v) => ({
                      ...v,
                      vector_embedding_provider: "",
                      vector_embedding_base_url: "",
                      vector_embedding_model: "",
                      vector_embedding_azure_deployment: "",
                      vector_embedding_azure_api_version: "",
                      vector_embedding_sentence_transformers_model: "",
                    }));
                    setVectorApiKeyDraft("");
                    setVectorApiKeyClearRequested(true);
                  }}
                  type="button"
                >
                  {UI_COPY.vectorRag.embeddingResetOverrides}
                </button>
              </div>
            </div>
          </FeedbackDisclosure>
        </div>
      ) : (
        <FeedbackEmptyState
          className="mt-4"
          variant="compact"
          title="正在加载资料策略"
          description="配置加载完成后，你就可以在这里检查召回、排序和访问密钥状态。"
        />
      )}
    </section>
  );
}
