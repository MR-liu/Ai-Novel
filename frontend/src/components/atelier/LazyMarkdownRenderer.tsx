import { Suspense, lazy, type ReactNode } from "react";

import clsx from "clsx";

import { importWithChunkRetry } from "../../lib/lazyImportRetry";

import type { MarkdownRendererProps } from "./MarkdownRenderer";

const MarkdownRenderer = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./MarkdownRenderer"));
  return { default: mod.MarkdownRenderer };
});

type LazyMarkdownRendererProps = MarkdownRendererProps & {
  fallback?: ReactNode;
  fallbackClassName?: string;
  fallbackText?: string;
};

export function LazyMarkdownRenderer({
  fallback,
  fallbackClassName,
  fallbackText = "加载预览…",
  className,
  ...props
}: LazyMarkdownRendererProps) {
  return (
    <Suspense
      fallback={
        fallback ?? <div className={clsx(className, fallbackClassName, "text-subtext")}>{fallbackText}</div>
      }
    >
      <MarkdownRenderer className={className} {...props} />
    </Suspense>
  );
}
