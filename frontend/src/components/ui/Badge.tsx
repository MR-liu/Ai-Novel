import clsx from "clsx";
import { type ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-border bg-canvas text-subtext",
  accent: "border-accent/25 bg-accent/10 text-ink",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
  info: "border-info/25 bg-info/10 text-info",
};

export function Badge(props: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  const tone = props.tone ?? "neutral";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none tracking-[0.01em]",
        toneClass[tone],
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}
