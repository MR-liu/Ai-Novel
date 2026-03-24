import clsx from "clsx";
import React from "react";

import { EditorialMetaSummary } from "../layout/EditorialMeta";
import { FeedbackDisclosure } from "../ui/Feedback";

type DebugPageShellProps = {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  eyebrow?: string;
  whenToUse?: React.ReactNode;
  outcome?: React.ReactNode;
  risk?: React.ReactNode;
  headerVariant?: "default" | "compact";
};

export function DebugPageShell(props: DebugPageShellProps) {
  const hasMeta = Boolean(props.whenToUse || props.outcome || props.risk);
  const headerVariant = props.headerVariant ?? "compact";

  return (
    <div className="studio-shell">
      <section className={clsx("studio-shell-header", headerVariant === "compact" && "studio-shell-header-compact")}>
        <div className="studio-shell-header-row">
          <div className="min-w-0 max-w-4xl">
            <div className="editorial-kicker">{props.eyebrow ?? "研究台"}</div>
            <div
              className={clsx(
                "mt-3 font-content text-ink",
                headerVariant === "compact" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl",
              )}
            >
              {props.title}
            </div>
            {props.description ? <div className="studio-shell-description">{props.description}</div> : null}
          </div>
          {props.actions ? <div className="studio-shell-actions">{props.actions}</div> : null}
        </div>
        {hasMeta ? (
          <EditorialMetaSummary
            items={[
              { key: "when", label: "现在可以做什么", value: props.whenToUse },
              { key: "outcome", label: "你会得到什么", value: props.outcome },
              { key: "risk", label: "风险或限制", value: props.risk },
            ]}
            variant={headerVariant === "compact" ? "inline" : "grid"}
          />
        ) : null}
      </section>
      <div className="studio-shell-body">{props.children}</div>
    </div>
  );
}

type DebugDetailsProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function DebugDetails(props: DebugDetailsProps) {
  return <FeedbackDisclosure title={props.title} defaultOpen={props.defaultOpen}>{props.children}</FeedbackDisclosure>;
}
