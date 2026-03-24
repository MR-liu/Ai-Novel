import { useCallback, useMemo, useRef, useState } from "react";

import { ApiError, apiJson } from "../../services/apiClient";
import type { ProjectSettings } from "../../types";
import {
  DEFAULT_VECTOR_RAG_FORM,
  mapVectorFormFromSettings,
  type VectorEmbeddingDryRunResult,
  type VectorRagForm,
  type VectorRerankDryRunResult,
} from "./models";
import { buildPromptsActionError, PROMPTS_COPY } from "./promptsCopy";
import { deriveEmbeddingProviderPreview, isVectorRagDirty } from "./promptsPageStateModels";

type PromptsToastApi = {
  toastError: (message: string, requestId?: string) => void;
  toastSuccess: (message: string, requestId?: string) => void;
};

export function usePromptsVectorRagState(args: { projectId?: string; toast: PromptsToastApi }) {
  const { projectId, toast } = args;

  const [baselineSettings, setBaselineSettings] = useState<ProjectSettings | null>(null);
  const [vectorForm, setVectorForm] = useState<VectorRagForm>(DEFAULT_VECTOR_RAG_FORM);
  const [vectorRerankTopKDraft, setVectorRerankTopKDraft] = useState(
    String(DEFAULT_VECTOR_RAG_FORM.vector_rerank_top_k),
  );
  const [vectorRerankTimeoutDraft, setVectorRerankTimeoutDraft] = useState("");
  const [vectorRerankHybridAlphaDraft, setVectorRerankHybridAlphaDraft] = useState("");
  const [vectorApiKeyDraft, setVectorApiKeyDraft] = useState("");
  const [vectorApiKeyClearRequested, setVectorApiKeyClearRequested] = useState(false);
  const [rerankApiKeyDraft, setRerankApiKeyDraft] = useState("");
  const [rerankApiKeyClearRequested, setRerankApiKeyClearRequested] = useState(false);
  const [savingVector, setSavingVector] = useState(false);
  const savingVectorRef = useRef(false);
  const [embeddingDryRunLoading, setEmbeddingDryRunLoading] = useState(false);
  const [embeddingDryRun, setEmbeddingDryRun] = useState<null | {
    requestId: string;
    result: VectorEmbeddingDryRunResult;
  }>(null);
  const [embeddingDryRunError, setEmbeddingDryRunError] = useState<null | {
    message: string;
    code: string;
    requestId?: string;
  }>(null);
  const [rerankDryRunLoading, setRerankDryRunLoading] = useState(false);
  const [rerankDryRun, setRerankDryRun] = useState<null | { requestId: string; result: VectorRerankDryRunResult }>(
    null,
  );
  const [rerankDryRunError, setRerankDryRunError] = useState<null | {
    message: string;
    code: string;
    requestId?: string;
  }>(null);

  const applyLoadedSettings = useCallback((settings: ProjectSettings) => {
    const mappedVector = mapVectorFormFromSettings(settings);
    setBaselineSettings(settings);
    setVectorForm(mappedVector.vectorForm);
    setVectorRerankTopKDraft(mappedVector.vectorRerankTopKDraft);
    setVectorRerankTimeoutDraft(mappedVector.vectorRerankTimeoutDraft);
    setVectorRerankHybridAlphaDraft(mappedVector.vectorRerankHybridAlphaDraft);
    setVectorApiKeyDraft("");
    setVectorApiKeyClearRequested(false);
    setRerankApiKeyDraft("");
    setRerankApiKeyClearRequested(false);
  }, []);

  const vectorApiKeyDirty = vectorApiKeyClearRequested || vectorApiKeyDraft.trim().length > 0;
  const rerankApiKeyDirty = rerankApiKeyClearRequested || rerankApiKeyDraft.trim().length > 0;
  const vectorRagDirty = useMemo(() => isVectorRagDirty(baselineSettings, vectorForm), [baselineSettings, vectorForm]);

  const saveVectorRagConfig = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    if (!baselineSettings) return false;
    if (!vectorRagDirty && !vectorApiKeyDirty && !rerankApiKeyDirty) return true;
    if (savingVectorRef.current) return false;

    const rerankMethod = vectorForm.vector_rerank_method.trim() || "auto";
    const rawTopK = vectorRerankTopKDraft.trim();
    const parsedTopK = Math.floor(Number(rawTopK || String(vectorForm.vector_rerank_top_k)));
    if (!Number.isFinite(parsedTopK) || parsedTopK < 1 || parsedTopK > 1000) {
      toast.toastError(PROMPTS_COPY.vectorRag.topKInvalid);
      return false;
    }

    const timeoutRaw = vectorRerankTimeoutDraft.trim();
    const parsedTimeoutSeconds = timeoutRaw ? Math.floor(Number(timeoutRaw)) : null;
    if (
      parsedTimeoutSeconds !== null &&
      (!Number.isFinite(parsedTimeoutSeconds) || parsedTimeoutSeconds < 1 || parsedTimeoutSeconds > 120)
    ) {
      toast.toastError(PROMPTS_COPY.vectorRag.timeoutInvalid);
      return false;
    }

    const alphaRaw = vectorRerankHybridAlphaDraft.trim();
    const parsedHybridAlpha = alphaRaw ? Number(alphaRaw) : null;
    if (
      parsedHybridAlpha !== null &&
      (!Number.isFinite(parsedHybridAlpha) || parsedHybridAlpha < 0 || parsedHybridAlpha > 1)
    ) {
      toast.toastError(PROMPTS_COPY.vectorRag.hybridAlphaInvalid);
      return false;
    }

    savingVectorRef.current = true;
    setSavingVector(true);
    try {
      const res = await apiJson<{ settings: ProjectSettings }>(`/api/projects/${projectId}/settings`, {
        method: "PUT",
        body: JSON.stringify({
          vector_rerank_enabled: Boolean(vectorForm.vector_rerank_enabled),
          vector_rerank_method: rerankMethod,
          vector_rerank_top_k: parsedTopK,
          vector_rerank_provider: vectorForm.vector_rerank_provider,
          vector_rerank_base_url: vectorForm.vector_rerank_base_url,
          vector_rerank_model: vectorForm.vector_rerank_model,
          vector_rerank_timeout_seconds: parsedTimeoutSeconds,
          vector_rerank_hybrid_alpha: parsedHybridAlpha,
          vector_embedding_provider: vectorForm.vector_embedding_provider,
          vector_embedding_base_url: vectorForm.vector_embedding_base_url,
          vector_embedding_model: vectorForm.vector_embedding_model,
          vector_embedding_azure_deployment: vectorForm.vector_embedding_azure_deployment,
          vector_embedding_azure_api_version: vectorForm.vector_embedding_azure_api_version,
          vector_embedding_sentence_transformers_model: vectorForm.vector_embedding_sentence_transformers_model,
          ...(rerankApiKeyDirty ? { vector_rerank_api_key: rerankApiKeyClearRequested ? "" : rerankApiKeyDraft } : {}),
          ...(vectorApiKeyDirty
            ? { vector_embedding_api_key: vectorApiKeyClearRequested ? "" : vectorApiKeyDraft }
            : {}),
        }),
      });

      applyLoadedSettings(res.data.settings);
      toast.toastSuccess(PROMPTS_COPY.vectorRag.saveSuccess);
      return true;
    } catch (e) {
      const err = e as ApiError;
      toast.toastError(buildPromptsActionError("保存资料策略", err.message, err.code), err.requestId);
      return false;
    } finally {
      setSavingVector(false);
      savingVectorRef.current = false;
    }
  }, [
    applyLoadedSettings,
    baselineSettings,
    projectId,
    rerankApiKeyClearRequested,
    rerankApiKeyDirty,
    rerankApiKeyDraft,
    toast,
    vectorApiKeyClearRequested,
    vectorApiKeyDirty,
    vectorApiKeyDraft,
    vectorForm,
    vectorRagDirty,
    vectorRerankHybridAlphaDraft,
    vectorRerankTopKDraft,
    vectorRerankTimeoutDraft,
  ]);

  const runEmbeddingDryRun = useCallback(async () => {
    if (!projectId) return;
    if (savingVector || embeddingDryRunLoading || rerankDryRunLoading) return;

    if (vectorRagDirty || vectorApiKeyDirty || rerankApiKeyDirty) {
      toast.toastError(PROMPTS_COPY.vectorRag.saveBeforeTestToast);
      return;
    }

    setEmbeddingDryRunLoading(true);
    setEmbeddingDryRunError(null);
    try {
      const res = await apiJson<{ result: VectorEmbeddingDryRunResult }>(
        `/api/projects/${projectId}/vector/embeddings/dry-run`,
        {
          method: "POST",
          body: JSON.stringify({ text: "hello world" }),
        },
      );
      setEmbeddingDryRun({ requestId: res.request_id, result: res.data.result });
      toast.toastSuccess(PROMPTS_COPY.vectorRag.embeddingDryRunSuccess, res.request_id);
    } catch (e) {
      const err = e as ApiError;
      setEmbeddingDryRunError({ message: err.message, code: err.code, requestId: err.requestId });
      toast.toastError(buildPromptsActionError("检查资料召回连接", err.message, err.code), err.requestId);
    } finally {
      setEmbeddingDryRunLoading(false);
    }
  }, [
    embeddingDryRunLoading,
    projectId,
    rerankApiKeyDirty,
    rerankDryRunLoading,
    savingVector,
    toast,
    vectorApiKeyDirty,
    vectorRagDirty,
  ]);

  const runRerankDryRun = useCallback(async () => {
    if (!projectId) return;
    if (savingVector || embeddingDryRunLoading || rerankDryRunLoading) return;

    if (vectorRagDirty || vectorApiKeyDirty || rerankApiKeyDirty) {
      toast.toastError(PROMPTS_COPY.vectorRag.saveBeforeTestToast);
      return;
    }

    setRerankDryRunLoading(true);
    setRerankDryRunError(null);
    try {
      const res = await apiJson<{ result: VectorRerankDryRunResult }>(
        `/api/projects/${projectId}/vector/rerank/dry-run`,
        {
          method: "POST",
          body: JSON.stringify({
            query_text: "dragon castle",
            documents: ["apple banana", "dragon castle"],
          }),
        },
      );
      setRerankDryRun({ requestId: res.request_id, result: res.data.result });
      toast.toastSuccess(PROMPTS_COPY.vectorRag.rerankDryRunSuccess, res.request_id);
    } catch (e) {
      const err = e as ApiError;
      setRerankDryRunError({ message: err.message, code: err.code, requestId: err.requestId });
      toast.toastError(buildPromptsActionError("检查结果排序链路", err.message, err.code), err.requestId);
    } finally {
      setRerankDryRunLoading(false);
    }
  }, [
    embeddingDryRunLoading,
    projectId,
    rerankApiKeyDirty,
    rerankDryRunLoading,
    savingVector,
    toast,
    vectorApiKeyDirty,
    vectorRagDirty,
  ]);

  const embeddingProviderPreview = useMemo(
    () => deriveEmbeddingProviderPreview(vectorForm, baselineSettings),
    [baselineSettings, vectorForm],
  );

  return {
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
    applyLoadedSettings,
    saveVectorRagConfig,
    runEmbeddingDryRun,
    runRerankDryRun,
  };
}
