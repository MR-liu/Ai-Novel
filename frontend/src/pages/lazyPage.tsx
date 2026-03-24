import { Suspense, lazy, type ComponentType, type ReactNode } from "react";

import { importWithChunkRetry } from "../lib/lazyImportRetry";

export function lazyPage<TModule>(
  importer: () => Promise<TModule>,
  select: (module: TModule) => ComponentType<any>,
) {
  return lazy(async () => {
    const mod = await importWithChunkRetry(importer);
    return { default: select(mod) };
  });
}

export function PageContentLoader(props: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="rounded-atelier border border-border bg-surface px-4 py-6 text-sm text-subtext">加载中…</div>}>
      {props.children}
    </Suspense>
  );
}
