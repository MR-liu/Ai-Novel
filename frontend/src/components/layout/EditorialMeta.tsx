import clsx from "clsx";
import type { ReactNode } from "react";

export type EditorialMetaVariant = "grid" | "inline";

export type EditorialMetaItem = {
  key: string;
  label: string;
  value?: ReactNode;
};

type EditorialMetaSummaryProps = {
  items: EditorialMetaItem[];
  variant?: EditorialMetaVariant;
  className?: string;
};

function hasRenderableValue(value: ReactNode | undefined): boolean {
  return value !== undefined && value !== null && value !== false;
}

export function EditorialMetaSummary(props: EditorialMetaSummaryProps) {
  const items = props.items.filter((item) => hasRenderableValue(item.value));
  if (items.length === 0) return null;

  const variant = props.variant ?? "grid";

  return (
    <div className={clsx(variant === "inline" ? "editorial-meta-inline" : "editorial-meta-grid", props.className)}>
      {items.map((item) => (
        <div
          key={item.key}
          className={variant === "inline" ? "editorial-meta-inline-item" : "editorial-meta-card"}
        >
          <div className="editorial-meta-label">{item.label}</div>
          <div className="editorial-meta-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
