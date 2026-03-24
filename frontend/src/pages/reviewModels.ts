import type { ReviewTab } from "../lib/projectRoutes";

export const REVIEW_TABS: ReviewTab[] = ["preview", "reader", "analysis", "foreshadows"];

export const REVIEW_TAB_COPY: Record<ReviewTab, { title: string; text: string }> = {
  preview: { title: "通读", text: "像读者一样顺着读，先感受整章的节奏、断句和阅读流畅度。" },
  reader: { title: "细读", text: "更靠近文本细节，逐段核对语句、段落和局部问题。" },
  analysis: { title: "连续性", text: "检查角色、设定、记忆和剧情前后是否一致，找出潜在冲突。" },
  foreshadows: { title: "伏笔", text: "追踪尚未回收的伏笔，看它们埋在哪里、下一步该怎么闭环。" },
};

type ReviewTrackSummary = {
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

const REVIEW_TRACK_SUMMARY: Record<ReviewTab, ReviewTrackSummary> = {
  preview: {
    focusLabel: "这一步先看什么",
    focusValue: "整体阅读感",
    focusCopy: "先判断节奏、段落衔接和章节收束是否顺，不必一开始就抠每一句话。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或细读",
    nextCopy: "通读发现问题先回写作页；如果问题需要逐段核对，就切到细读继续看。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不做深层排错",
    riskCopy: "通读更适合抓阅读体验，不适合在这里处理底层资料缺口或复杂连续性问题。",
  },
  reader: {
    focusLabel: "这一步先看什么",
    focusValue: "逐段核对",
    focusCopy: "正文和参考侧记会放在同一视线里，方便你逐段确认语句、信息量和资料是否对得上。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或连续性",
    nextCopy: "局部问题回写作页修正文稿；如果已经怀疑设定冲突，就切到连续性页继续定位。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不替你改稿",
    riskCopy: "细读负责帮你更快发现问题，但不会自动改正文，也不会替代作者判断。",
  },
  analysis: {
    focusLabel: "这一步先看什么",
    focusValue: "设定与事实",
    focusCopy: "优先看人物状态、世界设定和剧情事实有没有前后打架，再决定回哪里修稿。",
    nextLabel: "下一步通常去哪",
    nextValue: "回写作修正",
    nextCopy: "连续性页负责定位，不负责修正文稿；发现冲突后，最直接的动作仍然是回写作页改稿。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不处理阅读节奏",
    riskCopy: "如果你关心的是读起来顺不顺、段落是否拖沓，更适合先回通读或细读。",
  },
  foreshadows: {
    focusLabel: "这一步先看什么",
    focusValue: "未闭环线索",
    focusCopy: "先判断哪些伏笔最该近期回收，哪些还缺来源章节，避免主线悬置太久。",
    nextLabel: "下一步通常去哪",
    nextValue: "写作或连续性",
    nextCopy: "确认埋设位置后回写作推进回收；如果要复核线索是否前后一致，可切到连续性页。",
    riskLabel: "这一步不适合做什么",
    riskValue: "不直接改正文",
    riskCopy: "伏笔台帮你做决策和回溯，但真正的埋设与回收仍要回到正文里完成。",
  },
};

export function getReviewTrackSummary(tab: ReviewTab): ReviewTrackSummary {
  return REVIEW_TRACK_SUMMARY[tab];
}
