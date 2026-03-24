export const DASHBOARD_START_GUIDE = [
  "如果脑子里已经有下一章，就直接继续写作。",
  "如果忘了自己写到哪，先看项目主页和下一步建议。",
  "如果人物、设定或称呼开始打架，再去故事资料和校对轨道。",
];

export const DASHBOARD_AUTHOR_FLOW = [
  "项目主页：确认现在卡在哪。",
  "故事资料：补设定、统一称呼。",
  "大纲 / 写作：推进正文。",
  "校对：通读、细读、核连续性。",
  "发布：导出阅读稿或项目快照。",
];

export function getLaunchPadSummary(projectCount: number, readyCount: number): {
  projectLabel: string;
  readyLabel: string;
  shelfLabel: string;
} {
  return {
    projectLabel: projectCount === 0 ? "还没有项目" : `共 ${projectCount} 个项目`,
    readyLabel: readyCount === 0 ? "暂时没有进入持续写作状态的项目" : `${readyCount} 个项目可直接继续写作`,
    shelfLabel:
      projectCount === 0 ? "新建项目后，这里会开始形成你的最近书架" : projectCount === 1 ? "最近书架里只有这一部作品" : "最近书架按最近更新排序",
  };
}
