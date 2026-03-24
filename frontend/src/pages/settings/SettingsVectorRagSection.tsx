import type { Dispatch, SetStateAction } from "react";

import { FeedbackCallout, FeedbackDisclosure } from "../../components/ui/Feedback";
import { RequestIdBadge } from "../../components/ui/RequestIdBadge";
import { UI_COPY } from "../../lib/uiCopy";
import {
  formatEmbeddingSummary,
  formatRerankMethodLabel,
  formatRerankSummary,
  formatVectorProviderLabel,
} from "../../lib/vectorRagCopy";
import type { ProjectSettings } from "../../types";

import type { SettingsForm, VectorEmbeddingDryRunResult, VectorRerankDryRunResult } from "./models";
import { SETTINGS_COPY } from "./settingsCopy";

export type SettingsVectorRagSectionProps = {
  projectId?: string;
  onOpenPromptsConfig: () => void;
  baselineSettings: ProjectSettings;
  settingsForm: SettingsForm;
  setSettingsForm: Dispatch<SetStateAction<SettingsForm>>;
  saving: boolean;
  dirty: boolean;
  vectorApiKeyDirty: boolean;
  rerankApiKeyDirty: boolean;
  vectorRerankTopKDraft: string;
  setVectorRerankTopKDraft: Dispatch<SetStateAction<string>>;
  vectorRerankTimeoutDraft: string;
  setVectorRerankTimeoutDraft: Dispatch<SetStateAction<string>>;
  vectorRerankHybridAlphaDraft: string;
  setVectorRerankHybridAlphaDraft: Dispatch<SetStateAction<string>>;
  rerankApiKeyDraft: string;
  setRerankApiKeyDraft: Dispatch<SetStateAction<string>>;
  rerankApiKeyClearRequested: boolean;
  setRerankApiKeyClearRequested: Dispatch<SetStateAction<boolean>>;
  vectorApiKeyDraft: string;
  setVectorApiKeyDraft: Dispatch<SetStateAction<string>>;
  vectorApiKeyClearRequested: boolean;
  setVectorApiKeyClearRequested: Dispatch<SetStateAction<boolean>>;
  embeddingProviderPreview: string;
  embeddingDryRunLoading: boolean;
  embeddingDryRun: null | { requestId: string; result: VectorEmbeddingDryRunResult };
  embeddingDryRunError: null | { message: string; code: string; requestId?: string };
  rerankDryRunLoading: boolean;
  rerankDryRun: null | { requestId: string; result: VectorRerankDryRunResult };
  rerankDryRunError: null | { message: string; code: string; requestId?: string };
  onRunEmbeddingDryRun: () => void;
  onRunRerankDryRun: () => void;
};

export function SettingsVectorRagSection(props: SettingsVectorRagSectionProps) {
  return (
    <section className="panel p-6" id="rag-config" aria-label={UI_COPY.vectorRag.title} role="region">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="font-content text-xl text-ink">{UI_COPY.vectorRag.title}</div>
          <div className="text-xs text-subtext">{UI_COPY.vectorRag.subtitle}</div>
          <div className="text-xs text-subtext">{UI_COPY.vectorRag.apiKeyHint}</div>
        </div>
        <span className="manuscript-chip">只有命中不准时再回来调这里</span>
      </div>

      <FeedbackDisclosure
        className="mt-4 rounded-atelier border border-border bg-canvas p-4"
        summaryClassName="px-0 py-0"
        bodyClassName="pt-4"
        title={
          <div className="grid gap-1">
            <div className="text-sm text-ink">展开资料召回与排序设置</div>
            <div className="text-xs text-subtext">
              这里负责“资料找不找得到”和“候选排得是否靠前”。如果你要调整文风或生成语气，应该回提示词与模板配置。
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          {props.projectId ? (
            <FeedbackCallout
              className="text-xs"
              title="需要继续核对项目内召回策略？"
              actions={
                <button className="btn btn-secondary" onClick={props.onOpenPromptsConfig} type="button">
                  {SETTINGS_COPY.vectorRag.openPromptsConfigCta}
                </button>
              }
            >
              <div className="min-w-0">{SETTINGS_COPY.vectorRag.openPromptsConfigHint}</div>
            </FeedbackCallout>
          ) : null}

          <FeedbackCallout className="text-xs" title="什么时候该调这里">
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                资料召回负责先把可引用的内容找回来；结果排序负责把候选片段重新排到更贴题的位置。两者可以分别配置，必要时也能各走各的服务。
              </li>
              <li>
                保存后可先用上方检查按钮做一轮只读自检；如果还要继续排查，再记录 request_id 去看后端日志。
              </li>
              <li>
                想验证是否真的生效，可以去项目内“知识库 / 搜索”链路跑一次真实查询，看命中的资料是否更准、排序是否更贴题。
              </li>
            </ul>
          </FeedbackCallout>

          <div className="rounded-atelier border border-border bg-canvas p-4 text-xs text-subtext">
            <div>{formatEmbeddingSummary(props.baselineSettings)}</div>
            <div className="mt-1">{formatRerankSummary(props.baselineSettings)}</div>
          </div>

          <div className="rounded-atelier border border-border bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-ink">{UI_COPY.vectorRag.dryRunTitle}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={
                    props.saving ||
                    props.dirty ||
                    props.embeddingDryRunLoading ||
                    props.rerankDryRunLoading ||
                    props.vectorApiKeyDirty ||
                    props.rerankApiKeyDirty
                  }
                  onClick={props.onRunEmbeddingDryRun}
                  type="button"
                >
                  {props.embeddingDryRunLoading ? "检查中…" : UI_COPY.vectorRag.dryRunEmbeddingAction}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={
                    props.saving ||
                    props.dirty ||
                    props.embeddingDryRunLoading ||
                    props.rerankDryRunLoading ||
                    props.vectorApiKeyDirty ||
                    props.rerankApiKeyDirty
                  }
                  onClick={props.onRunRerankDryRun}
                  type="button"
                >
                  {props.rerankDryRunLoading ? "检查中…" : UI_COPY.vectorRag.dryRunRerankAction}
                </button>
              </div>
            </div>
            {props.dirty || props.vectorApiKeyDirty || props.rerankApiKeyDirty ? (
              <FeedbackCallout className="mt-3 text-xs" tone="warning" title="检查前先保存">
                {SETTINGS_COPY.vectorRag.saveBeforeTestHint}
              </FeedbackCallout>
            ) : null}

            {props.embeddingDryRunError ? (
              <FeedbackCallout className="mt-3 text-xs" tone="danger" title="资料召回检查没有通过">
                <div>
                  {props.embeddingDryRunError.message} ({props.embeddingDryRunError.code})
                </div>
                <RequestIdBadge requestId={props.embeddingDryRunError.requestId} className="mt-2" />
                <div className="mt-1 text-[11px] text-subtext">
                  建议先检查召回服务地址、模型名和访问密钥；如果还要继续排查，再根据 request_id 查日志。
                </div>
              </FeedbackCallout>
            ) : null}

            {props.embeddingDryRun ? (
              <div className="mt-3 rounded-atelier border border-border bg-surface p-3">
                <div className="text-xs text-subtext">
                  资料召回：{props.embeddingDryRun.result.enabled ? "可用" : "暂不可用"}；向量维度：
                  {props.embeddingDryRun.result.dims ?? "（未知）"}；耗时:
                  {props.embeddingDryRun.result.timings_ms?.total ?? "（未知）"}ms
                  {props.embeddingDryRun.result.error ? `；返回：${props.embeddingDryRun.result.error}` : ""}
                </div>
                <RequestIdBadge requestId={props.embeddingDryRun.requestId} className="mt-2" />
              </div>
            ) : null}

            {props.rerankDryRunError ? (
              <FeedbackCallout className="mt-3 text-xs" tone="danger" title="结果排序检查没有通过">
                <div>
                  {props.rerankDryRunError.message} ({props.rerankDryRunError.code})
                </div>
                <RequestIdBadge requestId={props.rerankDryRunError.requestId} className="mt-2" />
                <div className="mt-1 text-[11px] text-subtext">
                  建议先检查重排服务地址、模型名和访问密钥；若使用外部排序接口，再确认 `/v1/rerank` 可访问。
                </div>
              </FeedbackCallout>
            ) : null}

            {props.rerankDryRun ? (
              <div className="mt-3 rounded-atelier border border-border bg-surface p-3">
                <div className="text-xs text-subtext">
                  结果排序：{props.rerankDryRun.result.enabled ? "可用" : "暂不可用"}；方式：
                  {formatRerankMethodLabel(props.rerankDryRun.result.method ?? "")}；服务：
                  {formatVectorProviderLabel(
                    (props.rerankDryRun.result.rerank as { provider?: string } | undefined)?.provider ?? "",
                    "（未知）",
                  )}
                  ；耗时:
                  {props.rerankDryRun.result.timings_ms?.total ?? "（未知）"}ms；当前排序：
                  {(props.rerankDryRun.result.order ?? []).join(" → ") || "（空）"}
                </div>
                <RequestIdBadge requestId={props.rerankDryRun.requestId} className="mt-2" />
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="text-sm text-ink">{UI_COPY.vectorRag.rerankTitle}</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-ink sm:col-span-3">
                <input
                  className="checkbox"
                  checked={props.settingsForm.vector_rerank_enabled}
                  onChange={(e) =>
                    props.setSettingsForm((value) => ({ ...value, vector_rerank_enabled: e.target.checked }))
                  }
                  type="checkbox"
                />
                启用结果重排（对候选片段做相关性重排）
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-subtext">重排方式（method）</span>
                <select
                  className="select"
                  id="settings_vector_rerank_method"
                  name="vector_rerank_method"
                  aria-label="settings_vector_rerank_method"
                  value={props.settingsForm.vector_rerank_method}
                  onChange={(e) =>
                    props.setSettingsForm((value) => ({ ...value, vector_rerank_method: e.target.value }))
                  }
                >
                  <option value="auto">auto</option>
                  <option value="rapidfuzz_token_set_ratio">rapidfuzz_token_set_ratio</option>
                  <option value="token_overlap">token_overlap</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-subtext">候选数量（top_k）</span>
                <input
                  className="input"
                  id="settings_vector_rerank_top_k"
                  name="vector_rerank_top_k"
                  aria-label="settings_vector_rerank_top_k"
                  type="number"
                  min={1}
                  max={1000}
                  value={props.vectorRerankTopKDraft}
                  onBlur={() => {
                    const raw = props.vectorRerankTopKDraft.trim();
                    if (!raw) {
                      props.setVectorRerankTopKDraft(String(props.settingsForm.vector_rerank_top_k));
                      return;
                    }
                    const next = Math.floor(Number(raw));
                    if (!Number.isFinite(next)) {
                      props.setVectorRerankTopKDraft(String(props.settingsForm.vector_rerank_top_k));
                      return;
                    }
                    const clamped = Math.max(1, Math.min(1000, next));
                    props.setSettingsForm((value) => ({ ...value, vector_rerank_top_k: clamped }));
                    props.setVectorRerankTopKDraft(String(clamped));
                  }}
                  onChange={(e) => props.setVectorRerankTopKDraft(e.target.value)}
                />
              </label>
            </div>
            <div className="text-[11px] text-subtext">
              提示：启用后会对候选结果做二次排序，通常命中更好，但也可能增加耗时和成本。
            </div>

            <FeedbackDisclosure
              className="rounded-atelier border border-border bg-canvas p-4"
              summaryClassName="px-0 py-0 text-sm text-ink hover:text-ink"
              bodyClassName="pt-4"
              title={UI_COPY.vectorRag.rerankConfigDetailsTitle}
            >
              <div className="grid gap-4">
                <div className="text-xs text-subtext">{UI_COPY.vectorRag.backendEnvFallbackHint}</div>

                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankProviderLabel}</span>
                  <select
                    className="select"
                    id="settings_vector_rerank_provider"
                    name="vector_rerank_provider"
                    aria-label="settings_vector_rerank_provider"
                    value={props.settingsForm.vector_rerank_provider}
                    onChange={(e) =>
                      props.setSettingsForm((value) => ({ ...value, vector_rerank_provider: e.target.value }))
                    }
                  >
                    <option value="">（沿用系统默认服务）</option>
                    <option value="external_rerank_api">外部排序接口（external_rerank_api）</option>
                  </select>
                  <div className="text-[11px] text-subtext">
                    当前有效：{props.baselineSettings.vector_rerank_effective_provider || "（空）"}
                  </div>
                </label>

                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankBaseUrlLabel}</span>
                  <input
                    className="input"
                    id="settings_vector_rerank_base_url"
                    name="vector_rerank_base_url"
                    aria-label="settings_vector_rerank_base_url"
                    value={props.settingsForm.vector_rerank_base_url}
                    onChange={(e) => {
                      const next = e.target.value;
                      props.setSettingsForm((value) => {
                        const shouldAutoSetProvider = !value.vector_rerank_provider.trim() && next.trim().length > 0;
                        return {
                          ...value,
                          vector_rerank_base_url: next,
                          ...(shouldAutoSetProvider ? { vector_rerank_provider: "external_rerank_api" } : {}),
                        };
                      });
                    }}
                  />
                  <div className="text-[11px] text-subtext">
                    当前有效：{props.baselineSettings.vector_rerank_effective_base_url || "（空）"}
                  </div>
                </label>

                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankModelLabel}</span>
                  <input
                    className="input"
                    id="settings_vector_rerank_model"
                    name="vector_rerank_model"
                    aria-label="settings_vector_rerank_model"
                    value={props.settingsForm.vector_rerank_model}
                    onChange={(e) =>
                      props.setSettingsForm((value) => ({ ...value, vector_rerank_model: e.target.value }))
                    }
                  />
                  <div className="text-[11px] text-subtext">
                    当前有效：{props.baselineSettings.vector_rerank_effective_model || "（空）"}
                  </div>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankTimeoutLabel}</span>
                    <input
                      className="input"
                      id="settings_vector_rerank_timeout_seconds"
                      name="vector_rerank_timeout_seconds"
                      aria-label="settings_vector_rerank_timeout_seconds"
                      type="number"
                      min={1}
                      max={120}
                      value={props.vectorRerankTimeoutDraft}
                      onBlur={() => {
                        const raw = props.vectorRerankTimeoutDraft.trim();
                        if (!raw) {
                          props.setSettingsForm((value) => ({ ...value, vector_rerank_timeout_seconds: null }));
                          props.setVectorRerankTimeoutDraft("");
                          return;
                        }
                        const next = Math.floor(Number(raw));
                        if (!Number.isFinite(next)) {
                          props.setVectorRerankTimeoutDraft(
                            props.settingsForm.vector_rerank_timeout_seconds != null
                              ? String(props.settingsForm.vector_rerank_timeout_seconds)
                              : "",
                          );
                          return;
                        }
                        const clamped = Math.max(1, Math.min(120, next));
                        props.setSettingsForm((value) => ({ ...value, vector_rerank_timeout_seconds: clamped }));
                        props.setVectorRerankTimeoutDraft(String(clamped));
                      }}
                      onChange={(e) => props.setVectorRerankTimeoutDraft(e.target.value)}
                    />
                    <div className="text-[11px] text-subtext">
                      当前有效：{props.baselineSettings.vector_rerank_effective_timeout_seconds ?? 15}
                    </div>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankHybridAlphaLabel}</span>
                    <input
                      className="input"
                      id="settings_vector_rerank_hybrid_alpha"
                      name="vector_rerank_hybrid_alpha"
                      aria-label="settings_vector_rerank_hybrid_alpha"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={props.vectorRerankHybridAlphaDraft}
                      onBlur={() => {
                        const raw = props.vectorRerankHybridAlphaDraft.trim();
                        if (!raw) {
                          props.setSettingsForm((value) => ({ ...value, vector_rerank_hybrid_alpha: null }));
                          props.setVectorRerankHybridAlphaDraft("");
                          return;
                        }
                        const next = Number(raw);
                        if (!Number.isFinite(next)) {
                          props.setVectorRerankHybridAlphaDraft(
                            props.settingsForm.vector_rerank_hybrid_alpha != null
                              ? String(props.settingsForm.vector_rerank_hybrid_alpha)
                              : "",
                          );
                          return;
                        }
                        const clamped = Math.max(0, Math.min(1, next));
                        props.setSettingsForm((value) => ({ ...value, vector_rerank_hybrid_alpha: clamped }));
                        props.setVectorRerankHybridAlphaDraft(String(clamped));
                      }}
                      onChange={(e) => props.setVectorRerankHybridAlphaDraft(e.target.value)}
                    />
                    <div className="text-[11px] text-subtext">
                      当前有效：{props.baselineSettings.vector_rerank_effective_hybrid_alpha ?? 0}
                    </div>
                  </label>
                </div>

                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{UI_COPY.vectorRag.rerankApiKeyLabel}</span>
                  <input
                    className="input"
                    id="settings_vector_rerank_api_key"
                    name="vector_rerank_api_key"
                    aria-label="settings_vector_rerank_api_key"
                    type="password"
                    autoComplete="off"
                    value={props.rerankApiKeyDraft}
                    onChange={(e) => {
                      props.setRerankApiKeyDraft(e.target.value);
                      props.setRerankApiKeyClearRequested(false);
                    }}
                  />
                  <div className="text-[11px] text-subtext">
                    已保存（项目覆盖）：
                    {props.baselineSettings.vector_rerank_has_api_key
                      ? props.baselineSettings.vector_rerank_masked_api_key
                      : "（无）"}
                    {props.baselineSettings.vector_rerank_effective_has_api_key
                      ? ` | 当前有效：${props.baselineSettings.vector_rerank_effective_masked_api_key}`
                      : " | 当前有效：（无）"}
                    {props.rerankApiKeyClearRequested ? UI_COPY.vectorRag.pendingClearSuffix : ""}
                  </div>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-secondary"
                    aria-label="settings_vector_rerank_api_key_clear"
                    disabled={props.saving || !props.baselineSettings.vector_rerank_has_api_key}
                    onClick={() => {
                      props.setRerankApiKeyDraft("");
                      props.setRerankApiKeyClearRequested(true);
                    }}
                    type="button"
                  >
                    {UI_COPY.vectorRag.rerankClearApiKey}
                  </button>
                  <button
                    className="btn btn-secondary"
                    aria-label="settings_vector_rerank_reset_overrides"
                    disabled={props.saving}
                    onClick={() => {
                      props.setSettingsForm((value) => ({
                        ...value,
                        vector_rerank_provider: "",
                        vector_rerank_base_url: "",
                        vector_rerank_model: "",
                        vector_rerank_timeout_seconds: null,
                        vector_rerank_hybrid_alpha: null,
                      }));
                      props.setVectorRerankTimeoutDraft("");
                      props.setVectorRerankHybridAlphaDraft("");
                      props.setRerankApiKeyDraft("");
                      props.setRerankApiKeyClearRequested(true);
                    }}
                    type="button"
                  >
                    {UI_COPY.vectorRag.rerankResetOverrides}
                  </button>
                </div>
              </div>
            </FeedbackDisclosure>
          </div>

          <FeedbackDisclosure
            className="rounded-atelier border border-border bg-canvas p-4"
            summaryClassName="px-0 py-0 text-sm text-ink hover:text-ink"
            bodyClassName="pt-4"
            title={UI_COPY.vectorRag.embeddingTitle}
          >
            <div className="grid gap-4">
              <div className="text-xs text-subtext">{UI_COPY.vectorRag.backendEnvFallbackHint}</div>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingProviderLabel}</span>
                <select
                  className="select"
                  value={props.settingsForm.vector_embedding_provider}
                  onChange={(e) =>
                    props.setSettingsForm((value) => ({ ...value, vector_embedding_provider: e.target.value }))
                  }
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
                  当前有效：{formatVectorProviderLabel(props.baselineSettings.vector_embedding_effective_provider)}
                </div>
              </label>

              {props.embeddingProviderPreview === "azure_openai" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs text-subtext">
                      {UI_COPY.vectorRag.embeddingAzureDeploymentLabel}
                    </span>
                    <input
                      className="input"
                      value={props.settingsForm.vector_embedding_azure_deployment}
                      onChange={(e) =>
                        props.setSettingsForm((value) => ({
                          ...value,
                          vector_embedding_azure_deployment: e.target.value,
                        }))
                      }
                    />
                    <div className="text-[11px] text-subtext">
                      当前有效：{props.baselineSettings.vector_embedding_effective_azure_deployment || "（空）"}
                    </div>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-subtext">
                      {UI_COPY.vectorRag.embeddingAzureApiVersionLabel}
                    </span>
                    <input
                      className="input"
                      value={props.settingsForm.vector_embedding_azure_api_version}
                      onChange={(e) =>
                        props.setSettingsForm((value) => ({
                          ...value,
                          vector_embedding_azure_api_version: e.target.value,
                        }))
                      }
                    />
                    <div className="text-[11px] text-subtext">
                      当前有效：{props.baselineSettings.vector_embedding_effective_azure_api_version || "（空）"}
                    </div>
                  </label>
                </div>
              ) : null}

              {props.embeddingProviderPreview === "sentence_transformers" ? (
                <label className="grid gap-1">
                  <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingSentenceTransformersModelLabel}</span>
                  <input
                    className="input"
                    value={props.settingsForm.vector_embedding_sentence_transformers_model}
                    onChange={(e) =>
                      props.setSettingsForm((value) => ({
                        ...value,
                        vector_embedding_sentence_transformers_model: e.target.value,
                      }))
                    }
                  />
                  <div className="text-[11px] text-subtext">
                    当前有效：
                    {props.baselineSettings.vector_embedding_effective_sentence_transformers_model || "（空）"}
                  </div>
                </label>
              ) : null}

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingBaseUrlLabel}</span>
                <input
                  className="input"
                  id="vector_embedding_base_url"
                  name="vector_embedding_base_url"
                  value={props.settingsForm.vector_embedding_base_url}
                  onChange={(e) =>
                    props.setSettingsForm((value) => ({ ...value, vector_embedding_base_url: e.target.value }))
                  }
                />
                <div className="text-[11px] text-subtext">
                  当前有效：{props.baselineSettings.vector_embedding_effective_base_url || "（空）"}
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-subtext">{UI_COPY.vectorRag.embeddingModelLabel}</span>
                <input
                  className="input"
                  id="vector_embedding_model"
                  name="vector_embedding_model"
                  value={props.settingsForm.vector_embedding_model}
                  onChange={(e) =>
                    props.setSettingsForm((value) => ({ ...value, vector_embedding_model: e.target.value }))
                  }
                />
                <div className="text-[11px] text-subtext">
                  当前有效：{props.baselineSettings.vector_embedding_effective_model || "（空）"}
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
                  value={props.vectorApiKeyDraft}
                  onChange={(e) => {
                    props.setVectorApiKeyDraft(e.target.value);
                    props.setVectorApiKeyClearRequested(false);
                  }}
                />
                <div className="text-[11px] text-subtext">
                  已保存（项目覆盖）：
                  {props.baselineSettings.vector_embedding_has_api_key
                    ? props.baselineSettings.vector_embedding_masked_api_key
                    : "（无）"}
                  {props.baselineSettings.vector_embedding_effective_has_api_key
                    ? ` | 当前有效：${props.baselineSettings.vector_embedding_effective_masked_api_key}`
                    : " | 当前有效：（无）"}
                  {props.vectorApiKeyClearRequested ? UI_COPY.vectorRag.pendingClearSuffix : ""}
                </div>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary"
                  disabled={props.saving || !props.baselineSettings.vector_embedding_has_api_key}
                  onClick={() => {
                    props.setVectorApiKeyDraft("");
                    props.setVectorApiKeyClearRequested(true);
                  }}
                  type="button"
                >
                  {UI_COPY.vectorRag.embeddingClearApiKey}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={props.saving}
                  onClick={() => {
                    props.setSettingsForm((value) => ({
                      ...value,
                      vector_embedding_provider: "",
                      vector_embedding_base_url: "",
                      vector_embedding_model: "",
                      vector_embedding_azure_deployment: "",
                      vector_embedding_azure_api_version: "",
                      vector_embedding_sentence_transformers_model: "",
                    }));
                    props.setVectorApiKeyDraft("");
                    props.setVectorApiKeyClearRequested(true);
                  }}
                  type="button"
                >
                  {UI_COPY.vectorRag.embeddingResetOverrides}
                </button>
              </div>
            </div>
          </FeedbackDisclosure>
        </div>
      </FeedbackDisclosure>
    </section>
  );
}
