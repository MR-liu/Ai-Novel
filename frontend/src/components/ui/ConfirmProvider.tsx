import React, { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";

import { ConfirmContext } from "./confirm";
import type { ChooseOptions, ConfirmApi, ConfirmChoice, ConfirmOptions } from "./confirm";
import { importWithChunkRetry } from "../../lib/lazyImportRetry";

const LazyConfirmDialog = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./ConfirmDialog"));
  return { default: mod.ConfirmDialog };
});

export function ConfirmProvider(props: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<"confirm" | "choose">("confirm");
  const [options, setOptions] = useState<ConfirmOptions | ChooseOptions | null>(null);
  const resolverRef = useRef<((value: unknown) => void) | null>(null);

  const confirm = useCallback(async (opts: ConfirmOptions) => {
    setVariant("confirm");
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve as (value: unknown) => void;
    });
  }, []);

  const choose = useCallback(async (opts: ChooseOptions) => {
    setVariant("choose");
    setOptions(opts);
    setOpen(true);
    return new Promise<ConfirmChoice>((resolve) => {
      resolverRef.current = resolve as (value: unknown) => void;
    });
  }, []);

  const close = useCallback((value: unknown) => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
    window.setTimeout(() => setOptions(null), 400);
  }, []);

  const api = useMemo<ConfirmApi>(() => ({ confirm, choose }), [choose, confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {props.children}
      {options ? (
        <Suspense fallback={null}>
          <LazyConfirmDialog open={open} variant={variant} options={options} onClose={close} />
        </Suspense>
      ) : null}
    </ConfirmContext.Provider>
  );
}
