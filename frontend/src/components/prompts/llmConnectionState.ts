import type { LLMProfile, LLMProvider } from "../../types";

import { describeLlmProvider, formatLlmProviderModel } from "./llmProviderCopy";
import type { LlmModelListState } from "./types";

export type LlmModuleAccessStage = "missing_profile" | "missing_key" | "provider_mismatch" | "ready";

export type LlmModuleAccessState = {
  stage: LlmModuleAccessStage;
  tone: "warning" | "success";
  title: string;
  detail: string;
  actionReason: string | null;
  effectiveProfile: LLMProfile | null;
};

type DeriveOptions = {
  scope: "main" | "task";
  moduleProvider: LLMProvider;
  selectedProfile: LLMProfile | null;
  boundProfile?: LLMProfile | null;
};

function profileSummary(profile: LLMProfile): string {
  const masked = profile.masked_api_key ? `，访问密钥：${profile.masked_api_key}` : "";
  return `连接档案「${profile.name}」(${formatLlmProviderModel(profile.provider, profile.model)}${masked})`;
}

function createBlockedState(
  stage: Exclude<LlmModuleAccessStage, "ready">,
  title: string,
  detail: string,
  actionReason: string,
  effectiveProfile: LLMProfile | null = null,
): LlmModuleAccessState {
  return {
    stage,
    tone: "warning",
    title,
    detail,
    actionReason,
    effectiveProfile,
  };
}

export function deriveLlmModuleAccessState(options: DeriveOptions): LlmModuleAccessState {
  const boundProfile = options.boundProfile ?? null;
  const effectiveProfile = boundProfile ?? options.selectedProfile ?? null;
  const usingFallback = options.scope === "task" && !boundProfile;
  const sourceLabel = boundProfile ? "任务绑定连接档案" : usingFallback ? "主调用模块回退连接档案" : "主调用连接档案";

  if (!effectiveProfile) {
    return createBlockedState(
      "missing_profile",
      "连接状态：还没绑定连接档案",
      options.scope === "task"
        ? "当前任务还没有独立连接档案，也没有可回退的主调用连接档案。先绑定档案，再保存访问密钥。"
        : "当前主调用模块还没有绑定连接档案。先选择或新建档案，再保存访问密钥。",
      options.scope === "task" ? "请先为该任务绑定连接档案，或先设置主调用连接档案。" : "请先绑定主调用连接档案。",
    );
  }

  if (effectiveProfile.provider !== options.moduleProvider) {
    return createBlockedState(
      "provider_mismatch",
      "连接状态：模型来源还没对齐",
      `当前模块的模型来源是 ${describeLlmProvider(options.moduleProvider)}，但${sourceLabel}使用的是 ${describeLlmProvider(effectiveProfile.provider)}。先统一两边，再刷新模型或做连接检查。`,
      `${sourceLabel}与当前模块的模型来源不一致。`,
      effectiveProfile,
    );
  }

  if (!effectiveProfile.has_api_key) {
    return createBlockedState(
      "missing_key",
      "连接状态：已绑定档案，但还没保存密钥",
      `${sourceLabel}已绑定，但还没有保存访问密钥。保存后才能刷新模型列表或做连接检查。`,
      `${sourceLabel} 还没有保存访问密钥。`,
      effectiveProfile,
    );
  }

  return {
    stage: "ready",
    tone: "success",
    title: "连接状态：可以开始检查",
    detail: `${sourceLabel}已就绪：${profileSummary(effectiveProfile)}。现在可以刷新模型列表，也可以做连接检查。`,
    actionReason: null,
    effectiveProfile,
  };
}

export function describeModelListState(modelList: LlmModelListState, accessState: LlmModuleAccessState): string {
  if (accessState.actionReason) return `现在还不能刷新模型列表：${accessState.actionReason}`;
  if (modelList.loading) return "正在向模型服务刷新候选模型…";
  if (modelList.error) return `${modelList.error}。你仍然可以手动填写模型名。`;
  if (modelList.warning) return `模型服务返回提醒：${modelList.warning}。你仍然可以手动填写模型名。`;
  if (modelList.options.length > 0) {
    return `已刷新 ${modelList.options.length} 个候选模型；可以下拉选择，也可以手动填写模型名。`;
  }
  if (modelList.requestId) {
    return "已经请求模型服务，但没有返回候选模型；请检查模型来源和服务地址，或直接手动填写模型名。";
  }
  return "支持“刷新候选模型 + 手动填写模型名”两种方式。";
}
