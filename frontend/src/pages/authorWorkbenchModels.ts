import {
  buildProjectHomePath,
  buildProjectOutlinePath,
  buildProjectReviewPath,
  buildProjectWritePath,
  buildStoryBiblePath,
  buildStudioSystemPath,
  type ProjectHomeTab,
  type StoryBibleTab,
} from "../lib/projectRoutes";

export const PROJECT_HOME_TABS: ProjectHomeTab[] = ["overview", "setup", "settings"];
export const STORY_BIBLE_TABS: StoryBibleTab[] = ["overview", "characters", "world", "glossary", "continuity", "tables"];

type WorkbenchTrackCopy = {
  title: string;
  text: string;
  focusLabel: string;
  focusValue: string;
  focusCopy: string;
  nextLabel: string;
  nextValue: string;
  nextCopy: string;
  riskLabel: string;
  riskValue: string;
  riskCopy: string;
};

export const PROJECT_HOME_TAB_COPY: Record<ProjectHomeTab, WorkbenchTrackCopy> = {
  overview: {
    title: "概览",
    text: "先看项目现在进行到哪、下一步最适合做什么，再决定是否进入写作、校对或设置。",
    focusLabel: "这一步先看什么",
    focusValue: "项目现状",
    focusCopy: "优先看完成度、章节进展和项目基础信息，先判断今天适合从哪里接着写。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或校对",
    nextCopy: "如果主线还在推进就回写作；如果章节已经成形，就转去校对检查阅读感和连续性。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不做深层配置",
    riskCopy: "概览只负责帮助你判断和跳转，具体配置与底层调试仍在更深页面里。",
  },
  setup: {
    title: "开工准备",
    text: "把模型、设定、角色、大纲和章节骨架补齐，让项目主线进入可持续创作状态。",
    focusLabel: "这一步先看什么",
    focusValue: "准备缺口",
    focusCopy: "优先补那些会直接影响写作稳定性的前置项，比如角色、设定和章节骨架。",
    nextLabel: "下一步通常去哪",
    nextValue: "大纲或写作",
    nextCopy: "准备项补齐后，通常会进入大纲/章节规划，或直接回写作台开始推进正文。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不追求细节完备",
    riskCopy: "这里的目标是让项目能顺利开写，不是一次性把全部底层资料做到完美。",
  },
  settings: {
    title: "项目设置",
    text: "集中维护项目基础设定、约束和生成默认行为，减少后续写作中反复返工。",
    focusLabel: "这一步先看什么",
    focusValue: "默认规则",
    focusCopy: "优先确认那些会反复影响生成和写作判断的全局规则，比如风格、约束和自动更新开关。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或故事资料",
    nextCopy: "设置稳定后，通常会回到写作台继续推进，或去故事资料页补充世界与角色信息。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不直接产出正文",
    riskCopy: "项目设置负责打底，不会直接改变章节内容；真正的创作仍要回到正文工作流里完成。",
  },
};

export const STORY_BIBLE_TAB_COPY: Record<StoryBibleTab, WorkbenchTrackCopy> = {
  overview: {
    title: "总览",
    text: "先按作者语义找到资料入口，再决定要不要进入更深的工作室工具。",
    focusLabel: "这一步先看什么",
    focusValue: "资料全景",
    focusCopy: "优先确认角色、世界、术语和表格资料分别放在哪里，避免写作时来回找入口。",
    nextLabel: "下一步通常去哪",
    nextValue: "角色、世界或连续性",
    nextCopy: "如果是补资料就进入对应卷宗；如果是排查冲突，就直接切到连续性轨道。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不做底层调试",
    riskCopy: "总览只承接作者常用入口，更深的结构化引擎和系统页仍留在工作室模式。",
  },
  characters: {
    title: "角色",
    text: "维护人物卡、关系和关键状态，让角色在后续章节里不跑偏。",
    focusLabel: "这一步先看什么",
    focusValue: "人物状态",
    focusCopy: "先确认主角、配角和阵营关系，再补那些会直接影响后续剧情判断的角色信息。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或连续性",
    nextCopy: "角色信息更新后，通常回写作继续推进，或去连续性页核对人物状态是否已经跑偏。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不替代正文描写",
    riskCopy: "角色卷宗负责统一设定，不会替你完成角色在正文里的真实呈现和情绪推进。",
  },
  world: {
    title: "世界",
    text: "整理地点、规则和世界资料，减少写作时反复翻找设定。",
    focusLabel: "这一步先看什么",
    focusValue: "规则与地点",
    focusCopy: "优先补那些最常被章节调用的地点、制度和世界规则，让正文引用更稳定。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或检索",
    nextCopy: "世界资料稳定后，回写作页使用；如果要继续深挖资料来源，再进入工作室检索页。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不做全文分析",
    riskCopy: "世界页负责收资料，不负责跨章节排查冲突；那部分更适合交给连续性和检索链路。",
  },
  glossary: {
    title: "术语",
    text: "统一专有名词、别名和称呼，避免正文里叫法飘来飘去。",
    focusLabel: "这一步先看什么",
    focusValue: "称呼一致性",
    focusCopy: "优先整理容易混用的名称、头衔和别名，让后续写作与校对都更稳。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或通读",
    nextCopy: "术语整理后，回正文继续写；如果怀疑已有章节叫法不统一，可再去通读或细读复查。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不直接改历史正文",
    riskCopy: "术语表会帮你建立统一规则，但历史章节是否已经统一，仍需要你在正文链路里处理。",
  },
  continuity: {
    title: "连续性",
    text: "把设定冲突、人物状态错位和伏笔闭环都放进同一条资料轨道里查看。",
    focusLabel: "这一步先看什么",
    focusValue: "冲突与开环",
    focusCopy: "优先看哪些章节已经出现记忆冲突，哪些伏笔还没回收，避免越写越散。",
    nextLabel: "下一步通常去哪",
    nextValue: "连续性页或伏笔台",
    nextCopy: "定位冲突就去连续性检查，追踪线索闭环就去伏笔台，必要时再进工作室模式看底层引擎。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不直接写正文",
    riskCopy: "连续性轨道负责帮助你判断和定位，真正修稿仍要回到写作页完成。",
  },
  tables: {
    title: "表格",
    text: "把时间线、组织、资源和数值状态整理成结构化资料，方便后续引用。",
    focusLabel: "这一步先看什么",
    focusValue: "结构化状态",
    focusCopy: "优先整理那些很难靠自然语言稳定维护的东西，比如时间线、阵营资源和数值变化。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或连续性",
    nextCopy: "表格信息稳定后回写作使用；如果担心跨章节状态断裂，再去连续性页复核。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不追求系统化过度",
    riskCopy: "表格应该服务创作，而不是把作者拖进后台管理；只整理真正会反复引用的结构化信息。",
  },
};

export function getProjectHomeQuickLinks(projectId: string): Array<{ key: string; label: string; to: string }> {
  return [
    { key: "setup", label: "开工准备", to: buildProjectHomePath(projectId, "setup") },
    { key: "settings", label: "项目设置", to: buildProjectHomePath(projectId, "settings") },
    { key: "outline", label: "大纲与章节规划", to: buildProjectOutlinePath(projectId) },
    { key: "write", label: "打开写作台", to: buildProjectWritePath(projectId) },
  ];
}

export function getStoryBibleOverviewCards(projectId: string): Array<{
  key: string;
  kicker: string;
  title: string;
  description: string;
  to: string;
}> {
  return [
    {
      key: "characters",
      kicker: "角色",
      title: "人物卡与关系",
      description: "维护主角、配角、阵营和人物关系，让角色在后续章节里不跑偏。",
      to: buildStoryBiblePath(projectId, "characters"),
    },
    {
      key: "world",
      kicker: "世界",
      title: "世界资料",
      description: "集中维护地点、规则、设定文本和世界书，减少写作时来回翻找。",
      to: buildStoryBiblePath(projectId, "world"),
    },
    {
      key: "glossary",
      kicker: "术语",
      title: "术语表",
      description: "整理专有名词、别名和来源，让称呼、称谓和命名始终一致。",
      to: buildStoryBiblePath(projectId, "glossary"),
    },
    {
      key: "tables",
      kicker: "结构化资料",
      title: "表格资料",
      description: "把资源、组织、时间线、数值状态等结构化信息放在同一个资料夹里。",
      to: buildStoryBiblePath(projectId, "tables"),
    },
    {
      key: "continuity",
      kicker: "连续性",
      title: "设定与伏笔检查",
      description: "从这里进入连续性检查、伏笔状态和更深的连续性引擎，避免角色关系、设定和剧情前后互相打架。",
      to: buildStoryBiblePath(projectId, "continuity"),
    },
    {
      key: "engine",
      kicker: "工作室",
      title: "连续性引擎",
      description: "如果你已经在工作室模式，可以继续深入查看结构化记忆和更底层的连续性数据。",
      to: buildStudioSystemPath(projectId, "structured-memory"),
    },
  ];
}

export function getStoryBibleContinuityLinks(projectId: string): Array<{ key: string; label: string; text: string; to: string }> {
  return [
    {
      key: "analysis",
      label: "连续性检查",
      text: "按章节查看记忆标注与正文位置，核对设定和剧情是否自洽。",
      to: buildProjectReviewPath(projectId, "analysis"),
    },
    {
      key: "foreshadows",
      label: "伏笔状态",
      text: "查看未回收伏笔，追踪它们在哪一章埋下、在哪一章闭环。",
      to: buildProjectReviewPath(projectId, "foreshadows"),
    },
  ];
}
