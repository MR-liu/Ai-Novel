export type AiWorkbenchKey = "project-strategy" | "prompt-studio" | "templates" | "styles";

type AiWorkbenchSummary = {
  title: string;
  text: string;
  focusValue: string;
  focusCopy: string;
  nextValue: string;
  nextCopy: string;
  cautionValue: string;
  cautionCopy: string;
};

export const AI_WORKBENCH_COPY: Record<AiWorkbenchKey, AiWorkbenchSummary> = {
  "project-strategy": {
    title: "先把项目级方向盘调稳",
    text: "项目级策略页最适合决定模型、连接和检索的大方向。只有底座稳定了，模板和片段级微调才更容易看出真实作用。",
    focusValue: "模型连接、能力边界和检索链路",
    focusCopy: "先确认连接和资料链路是不是可用，再去调整模板或蓝图，不然很难判断问题到底出在哪里。",
    nextValue: "稳定后再去模板库或蓝图台",
    nextCopy: "当项目级方向盘已经顺手，下一步通常是沉淀稳态模板，或深入蓝图台拆解片段。",
    cautionValue: "这一层改动影响范围很大",
    cautionCopy: "这里不是只改一个任务，而是会影响整本书后续的大部分生成结果，最好小步验证。",
  },
  "prompt-studio": {
    title: "先拆清楚是哪一段说明在起作用",
    text: "蓝图台更像生成解剖台，适合把一套方案拆成片段、区分不同任务，再用预览确认到底是哪段说明真正改变了输出。",
    focusValue: "当前蓝图、片段顺序和预览结果",
    focusCopy: "先看选中的蓝图和预览有没有明显缺口，再去改片段顺序、触发条件和内容。",
    nextValue: "检查通过后回写作页实战",
    nextCopy: "蓝图台的价值是帮你定位原因，最后仍要回真实章节起草里看效果是不是顺手。",
    cautionValue: "别一口气同时改很多片段",
    cautionCopy: "如果一次动太多块，预览就很难告诉你到底是哪一段改动带来了变化。",
  },
  templates: {
    title: "先改长期要复用的稳定模板",
    text: "模板库最适合处理默认开场、结构要求和常用约束这类长期复用文案，不需要一上来就进入更复杂的片段系统。",
    focusValue: "当前模板、适用任务和未保存片段",
    focusCopy: "先确认自己改的是哪套模板、服务哪个任务，再决定是微调一段还是切去蓝图台。",
    nextValue: "改完先跑预览，再回实战验证",
    nextCopy: "模板页适合排除明显问题，但最终是否真的好用，还是要回章节生成里看实际输出。",
    cautionValue: "模板适合轻改，不适合排复杂注入关系",
    cautionCopy: "如果你开始关心片段顺序、触发条件或多任务拼装，说明问题已经超出模板页的舒适区。",
  },
  styles: {
    title: "先决定作品长期想保持什么口吻",
    text: "风格页更像长期写作习惯库，适合沉淀要持续复用的叙述语气、节奏和禁用表达，而不是临时应急补丁。",
    focusValue: "项目默认风格和可复用风格库",
    focusCopy: "先确定项目默认，再判断哪些要求值得单独沉淀成个人风格，避免每次都重写同样说明。",
    nextValue: "设定后回写作页看输出气质",
    nextCopy: "风格真正的检验标准不是配置是否漂亮，而是章节输出读起来是否稳定、是否像同一本书。",
    cautionValue: "风格不是越强越好",
    cautionCopy: "过重的风格约束会压住剧情推进和信息表达，最好用真实章节抽样验证强度。",
  },
};
