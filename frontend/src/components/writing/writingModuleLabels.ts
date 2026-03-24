export const WRITING_MEMORY_MODULE_LABELS = {
  worldbook: "世界书",
  story_memory: "剧情记忆",
  semantic_history: "语义历史",
  foreshadow_open_loops: "未回收伏笔",
  structured: "结构化资料",
  tables: "表格系统",
  vector_rag: "资料召回",
  graph: "关系图",
  fractal: "剧情脉络",
} as const;

export const WRITING_MEMORY_MODULE_TECH_LABELS = {
  worldbook: "世界书（worldbook）",
  story_memory: "剧情记忆（story_memory）",
  semantic_history: "语义历史（semantic_history）",
  foreshadow_open_loops: "未回收伏笔（foreshadow_open_loops）",
  structured: "结构化资料（structured）",
  tables: "表格系统（tables）",
  vector_rag: "资料召回（vector_rag）",
  graph: "关系图（graph）",
  fractal: "剧情脉络（fractal）",
} as const;

export const WRITING_RESEARCH_COPY = {
  mcpStageLabel: "资料收集",
  mcpTitle: "资料收集工具（只读）",
  mcpEmptyTitle: "本次未启用资料收集工具",
  mcpSummaryTitle: "资料收集摘要",
  mcpLoadingTools: "正在加载资料收集工具…",
  mcpLoadingErrorTitle: "资料收集工具加载失败",
} as const;

export function getWritingMemoryModuleLabel(key: string): string {
  return WRITING_MEMORY_MODULE_LABELS[key as keyof typeof WRITING_MEMORY_MODULE_LABELS] ?? key;
}

export function getWritingMemoryModuleTechLabel(key: string): string {
  return WRITING_MEMORY_MODULE_TECH_LABELS[key as keyof typeof WRITING_MEMORY_MODULE_TECH_LABELS] ?? key;
}
