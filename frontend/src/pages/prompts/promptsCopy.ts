export const PROMPTS_COPY = {
  vectorRag: {
    saveBeforeTestToast: "请先保存资料策略后再做检查（检查只会使用已保存配置）",
    saveBeforeTestHint: "提示：检查只会使用已保存配置；请先点“保存资料策略”。",
    saveSuccess: "资料召回策略已保存",
    embeddingDryRunSuccess: "资料召回连接检查已完成",
    rerankDryRunSuccess: "结果排序检查已完成",
    topKInvalid: "候选片段数必须是 1-1000 的整数",
    timeoutInvalid: "排序超时秒数必须是 1-120 的整数，或留空恢复默认",
    hybridAlphaInvalid: "混合权重必须是 0-1 的数字，或留空恢复默认",
  },
  llm: {
    mainSaveSuccess: "默认调用设置已保存",
    saveAllSuccess: "默认调用设置和任务例外都已保存",
    saveAllFailed: "还有未保存的默认调用设置或任务例外，请先检查参数和连接档案绑定",
    switchProfileSuccess: "已切换默认连接档案",
    createProfileSuccess: "已新建连接档案，并设为当前项目默认连接",
    updateProfileSuccess: "连接档案已更新",
    deleteProfileSuccess: "连接档案已删除",
    saveProfileApiKeySuccess: "连接档案的访问密钥（API Key）已保存",
    clearProfileApiKeySuccess: "连接档案的访问密钥（API Key）已清除",
    fillProfileName: "请先填写连接档案名称",
    selectProfile: "请先选择一个连接档案",
    selectOrCreateProfile: "请先选择或新建一个连接档案",
    fillApiKey: "请先填写访问密钥（API Key）",
    taskBusyUpdatingKey: "这条任务例外正在更新访问密钥，请稍后再试",
    taskBoundProfileMissing: "这条任务例外绑定的连接档案不存在，请重新选择",
    taskProviderMismatch: "任务例外使用的模型来源必须与绑定的连接档案一致",
    taskSaved: "任务例外已保存",
    unsavedTaskRemoved: "已移除未保存的任务例外草稿",
    taskDeleted: "任务例外已删除，后续将回退默认调用设置",
    bindTaskProfileFirst: "请先为这条任务例外绑定连接档案，或先设置默认连接档案",
    effectiveProfileMissing: "当前生效的连接档案不存在，请刷新页面后重试",
  },
  confirm: {
    switchProfileDirty: {
      title: "当前有未保存修改，是否切换默认连接档案？",
      description: "切换后会刷新当前表单。如果这些改动还想保留，建议先保存再切换。",
      confirmText: "保存并切换",
      secondaryText: "直接切换",
      cancelText: "取消",
    },
  },
} as const;

export function buildPromptsActionError(action: string, message: string, code: string) {
  return `${action}失败：${message} (${code})`;
}

export function formatPromptsPresetValidationMessage(message: string) {
  if (message.includes("模型（model）不能为空")) return "请先填写模型名称";
  if (message.includes("extra 必须是合法 JSON object")) return "扩展参数 extra 需要是合法的 JSON 对象";
  if (message.includes("Anthropic thinking budget_tokens")) return "Anthropic 的思考预算必须填写为正整数";
  if (message.includes("Gemini thinkingBudget")) return "Gemini 的思考预算必须填写为正整数";
  return message;
}

function buildPreviewSuffix(preview: string) {
  const trimmed = preview.trim();
  return trimmed ? `，返回示例：${trimmed}` : "";
}

export function buildDeleteProfileConfirm(profileName?: string) {
  return {
    title: "删除连接档案？",
    description: profileName
      ? `连接档案「${profileName}」删除后不可恢复。当前项目会解除默认绑定，需要重新选择或新建档案并保存访问密钥（API Key）。`
      : "删除后不可恢复。当前项目会解除默认绑定，需要重新选择或新建档案并保存访问密钥（API Key）。",
    confirmText: "删除",
  } as const;
}

export function buildClearProfileApiKeyConfirm(profileName?: string) {
  return {
    title: "清除连接档案的访问密钥（API Key）？",
    description: profileName
      ? `清除后，连接档案「${profileName}」将无法继续生成或做连接检查，直到重新保存访问密钥（API Key）。`
      : "清除后将无法继续生成或做连接检查，直到重新保存访问密钥（API Key）。",
    confirmText: "清除",
  } as const;
}

export function buildDeleteTaskModuleConfirm(taskLabel: string) {
  return {
    title: "删除任务例外",
    description: `确认删除任务「${taskLabel}」的单独设置吗？删除后它会回到默认调用设置。`,
    confirmText: "删除",
    cancelText: "取消",
  } as const;
}

export function buildClearTaskApiKeyConfirm(profileName: string) {
  return {
    title: "清除任务所用连接档案的访问密钥（API Key）？",
    description: `将清除连接档案「${profileName}」的访问密钥（API Key）。若其他任务也共用这份档案，它们会一起失效。`,
    confirmText: "清除",
    cancelText: "取消",
  } as const;
}

export function buildTaskProfileApiKeySavedToast(profileName: string) {
  return `连接档案「${profileName}」的访问密钥（API Key）已保存`;
}

export function buildTaskProfileApiKeyClearedToast(taskLabel: string) {
  return `任务「${taskLabel}」所用连接档案的访问密钥（API Key）已清除`;
}

export function buildMainConnectionSuccessToast(latencyMs: number, preview: string) {
  return `默认连接检查通过（延迟 ${latencyMs}ms${buildPreviewSuffix(preview)}）`;
}

export function buildTaskConnectionSuccessToast(taskLabel: string, latencyMs: number, preview: string) {
  return `任务「${taskLabel}」连接检查通过（延迟 ${latencyMs}ms${buildPreviewSuffix(preview)}）`;
}
