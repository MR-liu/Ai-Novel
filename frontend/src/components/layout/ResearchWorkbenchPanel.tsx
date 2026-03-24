import clsx from "clsx";

type ResearchWorkbenchPanelProps = {
  eyebrow?: string;
  title: string;
  text: string;
  focusValue: string;
  focusCopy: string;
  nextValue: string;
  nextCopy: string;
  cautionValue: string;
  cautionCopy: string;
  variant?: "default" | "compact";
};

export function ResearchWorkbenchPanel(props: ResearchWorkbenchPanelProps) {
  const variant = props.variant ?? "default";

  return (
    <section className={clsx(variant === "compact" ? "research-guide-panel" : "review-track-panel")}>
      <div className="editorial-kicker">{props.eyebrow ?? "当前研究路径"}</div>
      <div className={clsx("font-content text-ink", variant === "compact" ? "research-guide-title" : "mt-3 text-2xl")}>
        {props.title}
      </div>
      <div className={variant === "compact" ? "research-guide-copy" : "mt-2 max-w-3xl text-sm leading-7 text-subtext"}>
        {props.text}
      </div>
      <div className={variant === "compact" ? "research-guide-grid" : "review-track-grid"}>
        <div className={variant === "compact" ? "research-guide-card is-emphasis" : "review-track-card is-emphasis"}>
          <div className={variant === "compact" ? "research-guide-label" : "review-track-label"}>此刻最该先看什么</div>
          <div className={variant === "compact" ? "research-guide-value" : "review-track-value"}>{props.focusValue}</div>
          <div className={variant === "compact" ? "research-guide-card-copy" : "review-track-copy"}>{props.focusCopy}</div>
        </div>
        <div className={variant === "compact" ? "research-guide-card" : "review-track-card"}>
          <div className={variant === "compact" ? "research-guide-label" : "review-track-label"}>接下来通常做什么</div>
          <div className={variant === "compact" ? "research-guide-value" : "review-track-value"}>{props.nextValue}</div>
          <div className={variant === "compact" ? "research-guide-card-copy" : "review-track-copy"}>{props.nextCopy}</div>
        </div>
        <div className={variant === "compact" ? "research-guide-card" : "review-track-card"}>
          <div className={variant === "compact" ? "research-guide-label" : "review-track-label"}>最容易踩的坑</div>
          <div className={variant === "compact" ? "research-guide-value" : "review-track-value"}>{props.cautionValue}</div>
          <div className={variant === "compact" ? "research-guide-card-copy" : "review-track-copy"}>{props.cautionCopy}</div>
        </div>
      </div>
    </section>
  );
}
