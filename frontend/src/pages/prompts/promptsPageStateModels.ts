import type { LlmModelListState, LlmTaskFormDraft } from "../../components/prompts/types";
import type { LLMTaskCatalogItem, LLMTaskPreset, ProjectSettings } from "../../types";
import { buildPresetPayload, payloadEquals, payloadFromPreset, type VectorRagForm } from "./models";

export type TaskModuleView = {
  task_key: string;
  label: string;
  group: string;
  description: string;
  llm_profile_id: string | null;
  form: LlmTaskFormDraft["form"];
  dirty: boolean;
  saving: boolean;
  deleting: boolean;
  modelList: LlmModelListState;
};

export const EMPTY_MODEL_LIST_STATE: LlmModelListState = {
  loading: false,
  options: [],
  warning: null,
  error: null,
  requestId: null,
};

export function buildTaskCatalogByKey(taskCatalog: LLMTaskCatalogItem[]): Map<string, LLMTaskCatalogItem> {
  const map = new Map<string, LLMTaskCatalogItem>();
  for (const item of taskCatalog) {
    map.set(item.key, item);
  }
  return map;
}

export function buildTaskModuleViews(args: {
  taskDrafts: Record<string, LlmTaskFormDraft>;
  taskBaseline: Record<string, LLMTaskPreset>;
  taskCatalogByKey: Map<string, LLMTaskCatalogItem>;
  taskSaving: Record<string, boolean>;
  taskDeleting: Record<string, boolean>;
  taskModelLists: Record<string, LlmModelListState>;
}): TaskModuleView[] {
  const { taskDrafts, taskBaseline, taskCatalogByKey, taskSaving, taskDeleting, taskModelLists } = args;
  return Object.values(taskDrafts)
    .map((draft) => {
      const baseline = taskBaseline[draft.task_key] ?? null;
      const baselinePayload = baseline ? payloadFromPreset(baseline) : null;
      const payload = buildPresetPayload(draft.form);
      const payloadDirty = baselinePayload === null || !payload.ok ? true : !payloadEquals(payload.payload, baselinePayload);
      const bindingDirty = (draft.llm_profile_id ?? null) !== (baseline?.llm_profile_id ?? null);
      const item = taskCatalogByKey.get(draft.task_key);
      return {
        task_key: draft.task_key,
        label: item?.label ?? draft.task_key,
        group: item?.group ?? "custom",
        description: item?.description ?? "任务例外设置",
        llm_profile_id: draft.llm_profile_id,
        form: draft.form,
        dirty: draft.isNew || payloadDirty || bindingDirty,
        saving: Boolean(taskSaving[draft.task_key]),
        deleting: Boolean(taskDeleting[draft.task_key]),
        modelList: taskModelLists[draft.task_key] ?? { ...EMPTY_MODEL_LIST_STATE },
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group, "zh-Hans-CN") || a.label.localeCompare(b.label, "zh-Hans-CN"));
}

export function pickNextAddTaskKey(addableTasks: LLMTaskCatalogItem[], currentKey: string): string {
  if (!addableTasks.length) {
    return "";
  }
  if (currentKey && addableTasks.some((item) => item.key === currentKey)) {
    return currentKey;
  }
  return addableTasks[0].key;
}

export function isVectorRagDirty(
  baselineSettings: ProjectSettings | null,
  vectorForm: VectorRagForm,
): boolean {
  if (!baselineSettings) {
    return false;
  }
  return (
    vectorForm.vector_rerank_enabled !== baselineSettings.vector_rerank_effective_enabled ||
    vectorForm.vector_rerank_method.trim() !== baselineSettings.vector_rerank_effective_method ||
    Math.max(1, Math.min(1000, Math.floor(vectorForm.vector_rerank_top_k))) !==
      baselineSettings.vector_rerank_effective_top_k ||
    vectorForm.vector_rerank_provider !== baselineSettings.vector_rerank_provider ||
    vectorForm.vector_rerank_base_url !== baselineSettings.vector_rerank_base_url ||
    vectorForm.vector_rerank_model !== baselineSettings.vector_rerank_model ||
    (vectorForm.vector_rerank_timeout_seconds ?? null) !== (baselineSettings.vector_rerank_timeout_seconds ?? null) ||
    (vectorForm.vector_rerank_hybrid_alpha ?? null) !== (baselineSettings.vector_rerank_hybrid_alpha ?? null) ||
    vectorForm.vector_embedding_provider !== baselineSettings.vector_embedding_provider ||
    vectorForm.vector_embedding_base_url !== baselineSettings.vector_embedding_base_url ||
    vectorForm.vector_embedding_model !== baselineSettings.vector_embedding_model ||
    vectorForm.vector_embedding_azure_deployment !== baselineSettings.vector_embedding_azure_deployment ||
    vectorForm.vector_embedding_azure_api_version !== baselineSettings.vector_embedding_azure_api_version ||
    vectorForm.vector_embedding_sentence_transformers_model !==
      baselineSettings.vector_embedding_sentence_transformers_model
  );
}

export function deriveEmbeddingProviderPreview(
  vectorForm: VectorRagForm,
  baselineSettings: ProjectSettings | null,
): string {
  return (
    vectorForm.vector_embedding_provider.trim() ||
    baselineSettings?.vector_embedding_effective_provider ||
    "openai_compatible"
  ).trim();
}
