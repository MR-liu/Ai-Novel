import { describe, expect, it } from "vitest";

import type { LlmTaskFormDraft } from "../../components/prompts/types";
import type { LLMTaskCatalogItem, LLMTaskPreset, ProjectSettings } from "../../types";
import { DEFAULT_VECTOR_RAG_FORM, formFromPreset } from "./models";
import {
  buildTaskCatalogByKey,
  buildTaskModuleViews,
  deriveEmbeddingProviderPreview,
  EMPTY_MODEL_LIST_STATE,
  isVectorRagDirty,
  pickNextAddTaskKey,
} from "./promptsPageStateModels";

function buildTaskPreset(taskKey: string, overrides: Partial<LLMTaskPreset> = {}): LLMTaskPreset {
  return {
    project_id: "project-1",
    task_key: taskKey,
    provider: "openai",
    base_url: "",
    model: "gpt-4o-mini",
    temperature: 0.7,
    top_p: 1,
    max_tokens: 1200,
    presence_penalty: 0,
    frequency_penalty: 0,
    top_k: 0,
    stop: [],
    timeout_seconds: 60,
    extra: {},
    llm_profile_id: null,
    ...overrides,
  };
}

function buildSettings(overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    project_id: "project-1",
    world_setting: "",
    style_guide: "",
    constraints: "",
    context_optimizer_enabled: false,
    auto_update_worldbook_enabled: false,
    auto_update_characters_enabled: false,
    auto_update_story_memory_enabled: false,
    auto_update_graph_enabled: false,
    auto_update_vector_enabled: false,
    auto_update_search_enabled: false,
    auto_update_fractal_enabled: false,
    auto_update_tables_enabled: false,
    vector_rerank_enabled: true,
    vector_rerank_method: "auto",
    vector_rerank_top_k: 20,
    vector_rerank_provider: "external_rerank_api",
    vector_rerank_base_url: "https://rerank.example.com",
    vector_rerank_model: "rerank-1",
    vector_rerank_timeout_seconds: 30,
    vector_rerank_hybrid_alpha: 0.2,
    vector_rerank_has_api_key: false,
    vector_rerank_masked_api_key: "",
    vector_rerank_effective_enabled: true,
    vector_rerank_effective_method: "auto",
    vector_rerank_effective_top_k: 20,
    vector_rerank_effective_source: "project",
    vector_rerank_effective_provider: "external_rerank_api",
    vector_rerank_effective_base_url: "https://rerank.example.com",
    vector_rerank_effective_model: "rerank-1",
    vector_rerank_effective_timeout_seconds: 30,
    vector_rerank_effective_hybrid_alpha: 0.2,
    vector_rerank_effective_has_api_key: false,
    vector_rerank_effective_masked_api_key: "",
    vector_rerank_effective_config_source: "project",
    vector_embedding_provider: "openai_compatible",
    vector_embedding_base_url: "https://embed.example.com",
    vector_embedding_model: "text-embedding-3-large",
    vector_embedding_azure_deployment: "",
    vector_embedding_azure_api_version: "",
    vector_embedding_sentence_transformers_model: "",
    vector_embedding_has_api_key: false,
    vector_embedding_masked_api_key: "",
    vector_embedding_effective_provider: "openai_compatible",
    vector_embedding_effective_base_url: "https://embed.example.com",
    vector_embedding_effective_model: "text-embedding-3-large",
    vector_embedding_effective_azure_deployment: "",
    vector_embedding_effective_azure_api_version: "",
    vector_embedding_effective_sentence_transformers_model: "",
    vector_embedding_effective_has_api_key: false,
    vector_embedding_effective_masked_api_key: "",
    vector_embedding_effective_disabled_reason: null,
    vector_embedding_effective_source: "project",
    ...overrides,
  };
}

describe("promptsPageStateModels", () => {
  it("builds task module views with stable dirty flags and sorting", () => {
    const outlinePreset = buildTaskPreset("outline_generate");
    const chapterPreset = buildTaskPreset("chapter_generate", { llm_profile_id: "profile-2" });

    const taskCatalog: LLMTaskCatalogItem[] = [
      { key: "chapter_generate", label: "章节生成", group: "generation", description: "生成正文" },
      { key: "outline_generate", label: "大纲生成", group: "analysis", description: "生成大纲" },
    ];

    const taskDrafts: Record<string, LlmTaskFormDraft> = {
      outline_generate: {
        task_key: "outline_generate",
        llm_profile_id: null,
        form: formFromPreset(outlinePreset),
        isNew: false,
      },
      chapter_generate: {
        task_key: "chapter_generate",
        llm_profile_id: "profile-2",
        form: { ...formFromPreset(chapterPreset), model: "gpt-4.1" },
        isNew: false,
      },
    };

    const views = buildTaskModuleViews({
      taskDrafts,
      taskBaseline: {
        outline_generate: outlinePreset,
        chapter_generate: chapterPreset,
      },
      taskCatalogByKey: buildTaskCatalogByKey(taskCatalog),
      taskSaving: { chapter_generate: true },
      taskDeleting: {},
      taskModelLists: {
        chapter_generate: { ...EMPTY_MODEL_LIST_STATE, options: [{ id: "gpt-4.1", display_name: "GPT-4.1" }] },
      },
    });

    expect(views.map((item) => item.task_key)).toEqual(["outline_generate", "chapter_generate"]);
    expect(views[0].dirty).toBe(false);
    expect(views[1].dirty).toBe(true);
    expect(views[1].saving).toBe(true);
    expect(views[1].modelList.options[0]?.id).toBe("gpt-4.1");
  });

  it("picks the next addable task key and derives embedding provider preview", () => {
    const addableTasks: LLMTaskCatalogItem[] = [
      { key: "outline_generate", label: "大纲生成", group: "analysis", description: "" },
      { key: "chapter_generate", label: "章节生成", group: "generation", description: "" },
    ];

    expect(pickNextAddTaskKey(addableTasks, "")).toBe("outline_generate");
    expect(pickNextAddTaskKey(addableTasks, "chapter_generate")).toBe("chapter_generate");
    expect(pickNextAddTaskKey([], "chapter_generate")).toBe("");

    expect(deriveEmbeddingProviderPreview(DEFAULT_VECTOR_RAG_FORM, buildSettings())).toBe("openai_compatible");
    expect(
      deriveEmbeddingProviderPreview(
        {
          ...DEFAULT_VECTOR_RAG_FORM,
          vector_embedding_provider: "sentence_transformers",
        },
        buildSettings(),
      ),
    ).toBe("sentence_transformers");
  });

  it("detects vector rag dirty state from effective baseline settings", () => {
    const baseline = buildSettings();
    const unchanged = {
      ...DEFAULT_VECTOR_RAG_FORM,
      vector_rerank_enabled: true,
      vector_rerank_method: "auto",
      vector_rerank_top_k: 20,
      vector_rerank_provider: "external_rerank_api",
      vector_rerank_base_url: "https://rerank.example.com",
      vector_rerank_model: "rerank-1",
      vector_rerank_timeout_seconds: 30,
      vector_rerank_hybrid_alpha: 0.2,
      vector_embedding_provider: "openai_compatible",
      vector_embedding_base_url: "https://embed.example.com",
      vector_embedding_model: "text-embedding-3-large",
    };

    expect(isVectorRagDirty(baseline, unchanged)).toBe(false);
    expect(isVectorRagDirty(baseline, { ...unchanged, vector_rerank_top_k: 50 })).toBe(true);
    expect(isVectorRagDirty(null, unchanged)).toBe(false);
  });
});
