import clsx from "clsx";
import type { ReactNode } from "react";

type FeedbackTone = "info" | "warning" | "danger";

type FeedbackCalloutProps = {
  tone?: FeedbackTone;
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

type FeedbackStateCardProps = {
  title: ReactNode;
  description?: ReactNode;
  kicker?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
};

type FeedbackEmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  variant?: "default" | "compact";
  className?: string;
};

type FeedbackDisclosureProps = {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
  summaryClassName?: string;
  bodyClassName?: string;
};

const FEEDBACK_TONE_CLASS: Record<FeedbackTone, string> = {
  info: "callout-info",
  warning: "callout-warning",
  danger: "callout-danger",
};

export function FeedbackCallout(props: FeedbackCalloutProps) {
  const tone = props.tone ?? "info";

  return (
    <div className={clsx(FEEDBACK_TONE_CLASS[tone], "feedback-callout", props.className)}>
      {props.title ? <div className="feedback-callout-title">{props.title}</div> : null}
      <div className={clsx("feedback-callout-body", props.title && "mt-1")}>{props.children}</div>
      {props.actions ? <div className="feedback-callout-actions">{props.actions}</div> : null}
    </div>
  );
}

export function FeedbackStateCard(props: FeedbackStateCardProps) {
  return (
    <div className={clsx("feedback-state", props.tone === "danger" && "feedback-state-danger", props.className)}>
      {props.kicker ? <div className="feedback-state-kicker">{props.kicker}</div> : null}
      <div className={clsx(props.kicker ? "feedback-state-title" : "state-title")}>{props.title}</div>
      {props.description ? (
        <div className={clsx(props.kicker ? "feedback-state-copy" : "state-desc")}>{props.description}</div>
      ) : null}
      {props.meta ? <div className="feedback-state-meta">{props.meta}</div> : null}
      {props.actions ? <div className="feedback-state-actions">{props.actions}</div> : null}
    </div>
  );
}

export function FeedbackEmptyState(props: FeedbackEmptyStateProps) {
  return (
    <div
      className={clsx(
        "feedback-empty",
        props.variant === "compact" && "feedback-empty-compact",
        props.className,
      )}
    >
      {props.kicker ? <div className="feedback-empty-kicker">{props.kicker}</div> : null}
      <div className="feedback-empty-title">{props.title}</div>
      {props.description ? <div className="feedback-empty-copy">{props.description}</div> : null}
      {props.actions ? <div className="feedback-empty-actions">{props.actions}</div> : null}
    </div>
  );
}

export function FeedbackDisclosure(props: FeedbackDisclosureProps) {
  return (
    <details
      className={clsx("feedback-disclosure", props.className)}
      open={props.open ?? (props.defaultOpen ? true : undefined)}
      onToggle={(event) => props.onToggle?.((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={clsx("feedback-disclosure-summary", props.summaryClassName)}>{props.title}</summary>
      <div className={clsx("feedback-disclosure-body", props.bodyClassName)}>{props.children}</div>
    </details>
  );
}
