import type { StudioAiTab, StudioResearchTab, StudioSystemTab } from "../lib/projectRoutes";

export const STUDIO_AI_TABS: StudioAiTab[] = ["models", "prompts", "prompt-studio", "templates", "styles"];
export const STUDIO_RESEARCH_TABS: StudioResearchTab[] = ["import-docs", "knowledge-base", "search", "graph"];
export const STUDIO_SYSTEM_TABS: StudioSystemTab[] = ["tasks", "structured-memory", "fractal"];

type StudioWorkbenchCopy = {
  title: string;
  text: string;
  bestFor: string;
  nextStep: string;
  caution: string;
};

export const STUDIO_AI_TAB_COPY: Record<StudioAiTab, StudioWorkbenchCopy> = {
  models: {
    title: "模型与连接",
    text: "先确认连接、模型和能力边界，再决定生成应该怎么跑。",
    bestFor: "切换模型、排查连接或确认哪些能力当前可用。",
    nextStep: "模型确认后，通常会继续去“提示词方案”或“蓝图编排台”调整生成策略。",
    caution: "这里改的是底层能力边界，可能影响所有后续生成结果。",
  },
  prompts: {
    title: "提示词方案",
    text: "这里不是纯技术页，而是生成策略、约束和表现风格的调度台。",
    bestFor: "想统一项目级生成策略，而不是只改某一套片段蓝图时。",
    nextStep: "如果你已经知道要细调哪套方案，再进入“蓝图编排台”做片段级拆解。",
    caution: "改动会影响更大范围的生成行为，适合先小步调整再回写作页验证。",
  },
  "prompt-studio": {
    title: "蓝图编排台",
    text: "把一套生成方案拆成可排序、可预览、可复用的片段蓝图，再做真实检查。",
    bestFor: "需要知道到底是哪一段说明在影响生成，或想为不同任务准备不同蓝图时。",
    nextStep: "改完后先做生成前检查，再回写作页跑一次真实起草确认效果。",
    caution: "这里的粒度更细，适合在已经明确问题的大前提下进入。",
  },
  templates: {
    title: "模板库",
    text: "把稳定的任务模板沉淀下来，减少每次都从零调提示。",
    bestFor: "把常用任务固化成可复用模板，适合长期维护稳态方案。",
    nextStep: "模板稳定后，再到“蓝图编排台”验证它们在真实拼装里的表现。",
    caution: "模板更偏长期沉淀，不适合处理一次性的章节临时试验。",
  },
  styles: {
    title: "风格",
    text: "维护长期可复用的写作风格，而不是一章一章临时试运气。",
    bestFor: "你想让作品整体语气更稳定，而不是只修某一次生成。",
    nextStep: "风格定下后，回写作页或蓝图页看它是否真的被正确调用。",
    caution: "风格配置更像长期方向盘，修改后最好在多种任务里都做一次抽样验证。",
  },
};

export const STUDIO_RESEARCH_TAB_COPY: Record<StudioResearchTab, StudioWorkbenchCopy> = {
  "import-docs": {
    title: "导入文档",
    text: "先把外部资料整理进项目，再决定哪些内容值得进入资料库。",
    bestFor: "刚拿到外部资料，需要先把文档导入并确认分段、提案和解析结果时。",
    nextStep: "导入后通常会继续去“资料库”确认资料是否已经可查，再回“搜索”验证命中是否可用。",
    caution: "导入的是参考资料，不是项目本体；大体量文档整理和重建可能会耗时。",
  },
  "knowledge-base": {
    title: "资料库",
    text: "这里处理资料是否已经整理好、索引是否跟上，以及实际查询有没有命中，而不是只看参数。",
    bestFor: "需要确认资料库状态、重建进度或实际查询是否顺畅时。",
    nextStep: "资料状态稳定后，通常会继续去“搜索”或“关系图”做真实回查与关系排查。",
    caution: "这里会看到更多系统状态和检查信息，不适合作为日常写作首页。",
  },
  search: {
    title: "搜索",
    text: "全项目搜索用于快速定位信息，适合写作前后做事实回查。",
    bestFor: "想快速找到某个角色、地点、设定、章节片段或导入文档证据时。",
    nextStep: "如果已经不只是找文本，而是在找实体关系和结构问题，再去“关系图”。",
    caution: "搜索适合定位文本和命中，不负责自动解释结构关系。",
  },
  graph: {
    title: "关系图",
    text: "关系图更适合关系追踪和结构性排查，不用把它当成技术展示页。",
    bestFor: "要排查人物、地点、组织和事件之间的关系结构，或怀疑剧情链路断裂时。",
    nextStep: "关系图定位完关系后，通常会回写作页、连续性页或世界资料页处理正文和设定。",
    caution: "关系图更适合结构性排查，不一定适合逐句文本搜索。",
  },
};

export const STUDIO_SYSTEM_TAB_COPY: Record<StudioSystemTab, StudioWorkbenchCopy> = {
  tasks: {
    title: "任务中心",
    text: "从这里看任务是否顺利完成、卡在哪，以及是否需要重试或继续检查。",
    bestFor: "你怀疑自动更新、导入、重建或批量任务卡住时。",
    nextStep: "确认任务状态后，通常会回对应业务页重试，或继续查看更深一层的系统信息。",
    caution: "这里更偏运行状态检查，不适合作为日常写作页面长期停留。",
  },
  "structured-memory": {
    title: "连续性底座",
    text: "连续性底座承接实体、关系、事件与证据，是更深层的故事状态面板。",
    bestFor: "连续性问题已经不是正文表层冲突，而是要看更深层的实体、事件和证据链时。",
    nextStep: "定位到深层状态后，通常回“连续性检查”或写作页修正文稿。",
    caution: "这里信息密度更高，适合明确知道自己在查什么的时候进入。",
  },
  fractal: {
    title: "长期记忆",
    text: "长期记忆负责更深层的摘要与回忆注入，适合在设定漂移或记忆异常时进入检查。",
    bestFor: "你怀疑长期记忆漂移、召回异常，或想确认系统记住了什么时。",
    nextStep: "排查完记忆状态后，通常回写作页、连续性页或资料检索页做实际验证。",
    caution: "长期记忆更偏系统校准与核对，不是普通写作阶段的高频入口。",
  },
};
