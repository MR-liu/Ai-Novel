import clsx from "clsx";
import type { ReactNode } from "react";

import { FeedbackDisclosure } from "../ui/Feedback";

export function WritingCompactDisclosure(props: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <FeedbackDisclosure
      title={props.title}
      defaultOpen={props.defaultOpen}
      className={clsx("drawer-workbench-disclosure writing-compact-disclosure", props.className)}
      summaryClassName={clsx("writing-compact-disclosure-summary", props.summaryClassName)}
      bodyClassName={clsx("writing-compact-disclosure-body", props.bodyClassName)}
    >
      {props.children}
    </FeedbackDisclosure>
  );
}
