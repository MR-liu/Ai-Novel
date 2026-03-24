import clsx from "clsx";
import type { ReactNode } from "react";

export type WritingDrawerMetaItem = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
};

function toneClass(tone: WritingDrawerMetaItem["tone"]) {
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "danger") return "text-danger";
  return "text-ink";
}

export function WritingDrawerHeader(props: {
  titleId?: string;
  kicker: string;
  title: string;
  description: string;
  meta?: WritingDrawerMetaItem[];
  actions?: ReactNode;
  callout?: ReactNode;
}) {
  return (
    <header className="drawer-workbench-header">
      <div className="drawer-workbench-header-row">
        <div className="min-w-0">
          <div className="drawer-workbench-kicker">{props.kicker}</div>
          <div className="drawer-workbench-title" id={props.titleId}>
            {props.title}
          </div>
          <div className="drawer-workbench-copy">{props.description}</div>
        </div>
        {props.actions ? <div className="drawer-workbench-actions-row">{props.actions}</div> : null}
      </div>

      {props.meta?.length ? (
        <div className="drawer-workbench-meta-grid">
          {props.meta.map((item) => (
            <div key={`${item.label}:${item.value}`} className="drawer-workbench-meta-card">
              <div className="drawer-workbench-meta-label">{item.label}</div>
              <div className={clsx("drawer-workbench-meta-value", toneClass(item.tone))}>{item.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {props.callout ? <div className="drawer-workbench-callout">{props.callout}</div> : null}
    </header>
  );
}

export function WritingDrawerSection(props: {
  kicker?: string;
  title: string;
  copy?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("drawer-workbench-section", props.className)}>
      {props.kicker ? <div className="drawer-workbench-section-kicker">{props.kicker}</div> : null}
      <div className="drawer-workbench-section-title">{props.title}</div>
      {props.copy ? <div className="drawer-workbench-section-copy">{props.copy}</div> : null}
      {props.children ? <div className="mt-3">{props.children}</div> : null}
    </section>
  );
}
