import type { ReactNode } from "react";

type StudioWorkbenchPanelProps = {
  title: string;
  text: string;
  bestFor: string;
  nextStep: string;
  caution: string;
  actions?: ReactNode;
};

export function StudioWorkbenchPanel(props: StudioWorkbenchPanelProps) {
  return (
    <section className="review-track-panel">
      <div className="min-w-0">
        <div className="editorial-kicker">当前研究台</div>
        <div className="mt-3 font-content text-2xl text-ink">{props.title}</div>
        <div className="mt-2 max-w-3xl text-sm leading-7 text-subtext">{props.text}</div>
      </div>
      <div className="review-track-grid">
        <div className="review-track-card is-emphasis">
          <div className="review-track-label">什么时候最该来这里</div>
          <div className="review-track-value">{props.bestFor}</div>
          <div className="review-track-copy">这页最适合处理的，是当前阶段最容易卡住的那类问题。</div>
        </div>
        <div className="review-track-card">
          <div className="review-track-label">下一步通常去哪</div>
          <div className="review-track-value">{props.nextStep}</div>
          <div className="review-track-copy">研究台的目标不是停留，而是帮你更快回到正文、校对或资料修正动作。</div>
        </div>
        <div className="review-track-card">
          <div className="review-track-label">这页最需要注意什么</div>
          <div className="review-track-value">{props.caution}</div>
          <div className="review-track-copy">先明确问题再深入，会比在高密度工具里漫游更省心。</div>
        </div>
      </div>
      {props.actions ? <div className="mt-4 flex flex-wrap gap-2">{props.actions}</div> : null}
    </section>
  );
}
