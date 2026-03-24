export function formatBinaryStatus(enabled: boolean): "enabled" | "disabled" {
  return enabled ? "enabled" : "disabled";
}

export const SETTINGS_COPY = {
  featureDefaults: {
    status: (enabled: boolean) => `status: memory_injection_default=${formatBinaryStatus(enabled)} (localStorage)`,
  },
  contextOptimizer: {
    status: (enabled: boolean) => `status: ${formatBinaryStatus(enabled)}`,
  },
  queryPreprocess: {
    ariaLabel: "检索前整理",
    title: "检索前整理",
    subtitle: "在检索前先清理查询词，让世界书、资料召回和关系图的命中更稳定（默认关闭）。",
    featureHint: "可做的事：提取 #tag、移除排除词，并可选识别章节引用（index_ref_enhance）。",
    enableLabel: "启用检索前整理（默认关闭）",
    tagsLabel: "保留标签（每行一条；匹配 #tag；留空=提取所有标签）",
    tagsHint: "最大 50 条；每条最多 64 字符。",
    exclusionRulesLabel: "排除词（每行一条；命中则移除）",
    exclusionRulesHint: "最大 50 条；每条最多 256 字符。",
    indexRefEnhanceLabel: "识别章节引用（如“第N章 / chapter N”，并追加引用 token）",
    previewTitle: "预览整理结果（基于已保存配置）",
    previewHint: "修改配置后请先保存，再点击预览。",
    previewPlaceholder: "例如：回顾第1章 #foo REMOVE",
    previewButton: "预览",
    previewLoadingButton: "预览中…",
    clearResultButton: "清空结果",
    emptyState: "启用后可配置标签和排除词，并可在下方预览整理后的查询文本（保存后生效）。",
  },
  vectorRag: {
    openPromptsConfigHint:
      "更上层的资料范围与注入策略入口已迁移到「模型配置」页（向量检索）。建议先在那边确认项目策略，再回这里核对服务是否真的生效。",
    openPromptsConfigCta: "打开模型配置",
    saveBeforeTestToast: "请先保存设置后再测试（测试使用已保存配置）",
    saveBeforeTestHint: "提示：测试使用已保存配置；请先保存当前设置。",
  },
} as const;
