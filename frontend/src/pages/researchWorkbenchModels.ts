export type ResearchWorkbenchKey = "import-docs" | "knowledge-base" | "search" | "graph";

type ResearchWorkbenchSummary = {
  title: string;
  text: string;
  focusValue: string;
  focusCopy: string;
  nextValue: string;
  nextCopy: string;
  cautionValue: string;
  cautionCopy: string;
};

export const RESEARCH_WORKBENCH_COPY: Record<ResearchWorkbenchKey, ResearchWorkbenchSummary> = {
  "import-docs": {
    title: "先把外部资料变成可审核素材",
    text: "导入页的职责不是一键写入项目，而是让你先看到处理状态、切块质量和提案摘要，再决定哪些内容值得正式纳入这本书。",
    focusValue: "处理状态与切块质量",
    focusCopy: "先确认文件有没有处理完、切块是否合理，再去判断提案摘要是不是可信。",
    nextValue: "审核提案后再应用",
    nextCopy: "世界资料和剧情记忆都应该在看过摘要后再写入，避免把原始资料原封不动塞进系统。",
    cautionValue: "导入成功不等于资料已生效",
    cautionCopy: "真正进入项目的是你审核并应用后的结果，不是上传文件这一动作本身。",
  },
  "knowledge-base": {
    title: "先确认检索链路是不是真的健康",
    text: "知识库页更像一次检索体检：先看资料有没有进入库、索引是否过期，再决定要同步、重建还是直接验证命中效果。",
    focusValue: "索引状态与参与查询的知识库",
    focusCopy: "如果索引已过期或知识库未启用，继续查命中通常只会放大误判。",
    nextValue: "重建后立刻做一次真实查询",
    nextCopy: "最好的验证方式不是看参数，而是拿一段你真正在写的内容做一次检索测试。",
    cautionValue: "不要把参数调试放到前面",
    cautionCopy: "只有当基础链路已经正常但结果仍不稳定时，才值得深入到高级重排和实验参数。",
  },
  search: {
    title: "先把问题压缩成一句可验证的话",
    text: "搜索页最适合解决“我记得这件事出现过，但忘了在哪”这种问题。问题越具体，越容易直接跳回正确页面继续修稿。",
    focusValue: "一个具体的人名、设定或事件组合",
    focusCopy: "优先用“角色 + 事件”或“设定 + 关键词”的短语，而不是只搜一个泛词。",
    nextValue: "命中后立刻回原页面核对",
    nextCopy: "搜索的价值是帮你定位，不是替你判断哪一条一定是最新事实。",
    cautionValue: "别把旧命中当成当前版本",
    cautionCopy: "结果会混合多个来源，仍要结合章节、设定页和上下文判断哪条才该被采纳。",
  },
  graph: {
    title: "先把关系问题写成可抽取的线索",
    text: "图谱页适合排查“谁和谁是什么关系、证据从哪来、为什么系统会这么理解”这类结构问题，而不是做全文搜索。",
    focusValue: "实体、关系和证据是否同时命中",
    focusCopy: "只有节点、关系线和证据能对得上时，图谱结果才值得继续回写到系统。",
    nextValue: "确认后再创建图谱回写任务",
    nextCopy: "先把关系判断做实，再回写到底层系统，会比盲目自动更新更稳。",
    cautionValue: "图谱适合结构排查，不适合代替文本检索",
    cautionCopy: "如果你只是想找一句话或一个段落，通常先去搜索页会更直接。",
  },
};
