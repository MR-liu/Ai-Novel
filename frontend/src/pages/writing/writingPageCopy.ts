import { buildProjectReviewPath } from "../../lib/projectRoutes";
import { humanizeChapterStatus } from "../../lib/humanize";

const DRAFTING_LABEL = humanizeChapterStatus("drafting");
const DONE_LABEL = humanizeChapterStatus("done");

export const WRITING_PAGE_COPY = {
  loading: "加载中...",
  emptyState: "请选择或新建章节开始写作。",
  emptyStateNoChapterTitle: "先建第一章，把故事真正推起来",
  emptyStateNoChapterCopy:
    "现在大纲和资料已经就位，下一步不是继续配置，而是先建立第一章。先有章节，后面的起草、校对和连续性更新才有落点。",
  emptyStateSelectChapterTitle: "先回到一章正在写的稿面",
  emptyStateSelectChapterCopy:
    "项目里已经有章节了。先从目录里选一章继续写，或者直接新建下一章，把故事主线往前推一步。",
  emptyStatePrimaryAction: "新建章节",
  emptyStateOpenDirectory: "打开章节目录",
  emptyStateStepPlan: "先写要点",
  emptyStateStepDraft: "起草正文",
  emptyStateStepReview: "再进校对",
  chapterListEmptyTitle: "章节目录还没开始长出来",
  chapterListEmptyCopy: "先建第一章。章节一旦出现，目录、主稿和校对链路就都能真正跑起来。",
  dirtyBadge: "（未保存）",
  updatedAtPrefix: "最近修改：",
  hotkeyHint: "快捷键：Ctrl/Cmd + S 保存当前稿面",
  titleLabel: "标题",
  statusLabel: "状态",
  planLabel: "本章要点",
  contentLabel: "正文主稿",
  contentPlaceholder: "开始写作...",
  summaryLabel: "摘要（可选）",
  titleHelper: "章节名更像你的路标，回头扫一眼就该知道这一章在推进什么。",
  planHelper: "先写清这一章要发生什么、冲突怎么推进，后面更容易稳定地扩写。",
  contentHelper: "正文区保持为视觉中心。需要检查排版时可以切到预览，再回来继续写。",
  summaryHelper: "用两三句记下这一章已经落定的事实，后续回看和连续性更新都会更轻松。",
  editorSavedFootnote: "当前稿面已同步，可以安心切章、去校对，或继续扩写。",
  editorDirtyFootnote: "你还有未保存修改，建议先落盘再切章节或触发后续动作。",
  editorReadonlyFootnote: "当前是定稿只读稿面；如果要修改，请先回退为草稿。",
  editorSaveStateSaved: "稿面已保存",
  editorSaveStateDirty: "等待保存",
  editorSaveStateSaving: "正在保存",
  editorSaveStateAutoUpdating: "正在同步后续更新",
  runtimeGeneratingTitle: "AI 正在接续这一章",
  runtimeGeneratingCopy: "你可以继续停留在稿面里阅读和思考；如果想调整要求或中止生成，随时回到生成面板。",
  runtimeAutoUpdateTitle: "后台正在同步故事资料",
  runtimeAutoUpdateCopy: "本章定稿后的连续性、资料和索引更新任务正在创建，稍后可去任务中心确认结果。",
  runtimeBatchTitle: "批量生成仍在推进",
  runtimeBatchCopyPrefix: "后台还有批量写作任务在继续推进",
  analysis: "分析",
  trace: "标注回溯",
  delete: "删除",
  saveAndTrigger: "保存并同步故事资料",
  saveAndTriggerPending: "正在保存并同步...",
  save: "保存",
  saving: "保存中...",
  openTaskCenter: "打开任务中心",
  openChapterAnalysis: "打开标注页",
  switchedOutline: "已切换大纲",
  saveQueued: "保存中：已加入队列，将自动保存。",
  saveSuccess: "已保存",
  createSuccess: "已创建",
  deleteSuccess: "已删除",
  chapterNumberInvalid: "章号必须 >= 1",
  generateDoneUnsaved: "生成完成（别忘了保存）",
  generateEmptyStream: "未收到流式分片（可能上游未返回分片或输出为空）",
  generateFallback: "流式生成失败，已回退非流式",
  generateUnsupportedProviderFallback: "已回退非流式生成",
  generateCanceled: "已取消生成",
  generateFailed: "生成失败",
  applyRunSuccess: "已应用生成结果（别忘了保存）",
  applyRunEmpty: "生成记录为空，无法应用",
  autoUpdatesCreated: "已保存并创建无感更新任务",
  locateExcerptFailed: "未在正文中找到该引用片段（可复制后 Ctrl/Cmd+F 搜索）",
  memoryUpdateNeedsSaveFirst: "请先保存当前章节后再进行记忆更新。",
  promptPresetRequired: "请先在 AI 工作室保存默认调用设置",
  analyzeEmptyContent: "正文为空，无法分析",
  analyzeDone: "分析完成",
  analyzeParseFailedPrefix: "分析解析失败：",
  analyzeInstructionDefault: "按分析建议重写，减少重复，保持叙事连续。",
  rewriteNeedsAnalysis: "请先完成章节分析",
  rewriteEmptyContent: "正文为空，无法重写",
  rewriteParseFailed: "重写解析失败",
  rewriteAppliedUnsaved: "已应用重写结果到编辑器（未保存）",
  saveAndGenerateLastChapter: "已保存，已是最后一章",
  streamFloatingTitle: "草稿正在接续",
  streamFloatingPending: "系统正在把新的段落写回当前稿面…",
  streamFloatingExpand: "回到生成面板",
  streamFloatingHint: "你可以留在稿面继续看当前章节；生成完成后，新的内容会自动回到编辑区。",
  cancel: "取消",
  postEditRawApplied: "已采用原稿（别忘了保存）",
  postEditEditedApplied: "已采用后处理稿（别忘了保存）",
  contentOptimizeRawApplied: "已采用优化前原稿（别忘了保存）",
  contentOptimizeOptimizedApplied: "已采用正文优化稿（别忘了保存）",
  adoptionRecordFailedPrefix: "记录采用策略失败：",
  readonlyCalloutAction: `回退为 ${DRAFTING_LABEL} 并编辑`,
  confirms: {
    switchChapter: {
      title: "章节有未保存修改，是否切换？",
      description: "切换后未保存内容会丢失。",
      confirmText: "保存并切换",
      secondaryText: "不保存切换",
      cancelText: "取消",
    },
    switchOutline: {
      title: "章节有未保存修改，是否切换大纲？",
      description: "切换大纲后未保存内容会丢失。",
      confirmText: "保存并切换",
      secondaryText: "不保存切换",
      cancelText: "取消",
    },
    applyGenerationRun: {
      title: "章节有未保存修改，是否应用生成记录？",
      description: "应用后会覆盖编辑器内容（不会自动保存）。",
      confirmText: "保存并应用",
      secondaryText: "直接应用（不保存）",
      cancelText: "取消",
    },
    generateWithDirty: {
      title: "章节有未保存修改，如何生成？",
      description: "生成结果会写入编辑器，但不会自动保存。",
      confirmText: "保存并生成",
      secondaryText: "直接生成（不保存当前修改）",
      cancelText: "取消",
    },
    deleteChapter: {
      title: "删除章节？",
      description: "删除后该章节正文与摘要将丢失。",
      confirmText: "删除",
    },
    nextChapterReplace: {
      description: "将以“替换”模式生成草稿（生成结果不会自动保存）。",
      confirmText: "继续",
      cancelText: "取消",
    },
  },
} as const;

export const WRITING_DISCLOSURE_COPY = {
  toolbarMoreActions: "更多写作动作",
  headerMoreActions: "更多正文操作",
  statusDetails: "本章进度详情",
  workflowMoreWriting: "更多写作动作",
  workflowMoreResearch: "更多资料检查",
  workflowMoreContinuity: "更多连续性处理",
  drawerMoreReview: "更多回看动作",
  drawerMoreResearch: "更多资料检查",
  drawerMoreContinuity: "更多连续性处理",
  planReady: "写前准备 · 已整理",
  planPending: "写前准备 · 待补充",
  summaryReady: "已定事实 · 已记录",
  summaryPending: "已定事实 · 可稍后补",
} as const;

export function getWritingChapterHeading(chapterNumber: number): string {
  return `第 ${chapterNumber} 章`;
}

export function getWritingReadonlyCallout(): string {
  return `本章已定稿：为避免误操作，编辑区默认只读。如需修改，请先回退为 ${DRAFTING_LABEL}。`;
}

export function getWritingStatusHint(): string {
  return `提示：保存不等于定稿。仅状态为 ${DONE_LABEL} 的章节允许进行连续性更新并写入长期资料；定稿章默认只读，修改请先切回 ${DRAFTING_LABEL}。`;
}

export function getWritingDoneOnlyWarning(): string {
  return `仅状态为 ${DONE_LABEL} 的章节允许记忆更新；请先将章节标记为 ${DONE_LABEL}。`;
}

export type WritingRevisionStatus = "unchanged" | "dirty" | "saved";

export function getWritingAnalysisHref(
  projectId: string,
  chapterId: string,
  annotationId?: string | null,
  revisionStatus?: WritingRevisionStatus | null,
): string {
  const params = new URLSearchParams();
  params.set("chapterId", chapterId);
  if (annotationId) params.set("annotationId", annotationId);
  if (revisionStatus) params.set("revisionStatus", revisionStatus);
  return `${buildProjectReviewPath(projectId, "analysis")}?${params.toString()}`;
}

export function getWritingNextChapterReplaceTitle(chapterNumber: number): string {
  return `下一章（第 ${chapterNumber} 章）已有内容，仍要开始生成？`;
}

export function getWritingGenerateIndicatorLabel(message?: string, progress?: number): string {
  if (!message) return "AI 正在沿着当前章节的设定接续正文，你可以先留在稿面里整理思路。";
  return `${message} · 当前进度 ${Math.max(0, Math.min(100, progress ?? 0))}%`;
}

export function getWritingMissingPrerequisiteMessage(numbers: number[]): string {
  return `缺少前置章节内容：第 ${numbers.join("、")} 章`;
}

export function getWritingJumpToChapterLabel(chapterNumber: number): string {
  return `跳转到第 ${chapterNumber} 章`;
}

export function getWritingApplyMemorySuccess(count: number): string {
  return `已生成 ${count} 条记忆（标注可用）`;
}
