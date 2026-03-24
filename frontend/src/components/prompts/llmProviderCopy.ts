import type { LLMProvider } from "../../types";

export function describeLlmProvider(provider: LLMProvider): string {
  if (provider === "openai") return "OpenAI 官方对话接口";
  if (provider === "openai_responses") return "OpenAI 官方 Responses 接口";
  if (provider === "openai_compatible") return "通用 OpenAI 对话接口";
  if (provider === "openai_responses_compatible") return "通用 OpenAI Responses 接口";
  if (provider === "anthropic") return "Anthropic Claude";
  return "Google Gemini";
}

export function formatLlmProviderModel(provider: LLMProvider, model: string): string {
  return `${describeLlmProvider(provider)} / ${model}`;
}
