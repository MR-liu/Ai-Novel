import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import clsx from "clsx";

import { ToastContext } from "./toast";
import type { ToastApi } from "./toast";
import { RequestIdBadge } from "./RequestIdBadge";

type ToastItem = {
  id: string;
  variant: "success" | "warning" | "error";
  message: string;
  requestId?: string;
  action?: { label: string; onClick: () => void | Promise<void> };
};

export function ToastProvider(props: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toastGroupId = useId();
  const timersByIdRef = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersByIdRef.current.get(id);
    if (timer === undefined) return;

    window.clearTimeout(timer);
    timersByIdRef.current.delete(id);
  }, []);

  const remove = useCallback(
    (id: string) => {
      clearTimer(id);
      setItems((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  const push = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { id, ...toast }]);
      const ttl = toast.action ? 12000 : 4500;
      const timer = window.setTimeout(() => remove(id), ttl);
      timersByIdRef.current.set(id, timer);
    },
    [remove],
  );

  useEffect(() => {
    const timersById = timersByIdRef.current;
    return () => {
      for (const timer of timersById.values()) {
        window.clearTimeout(timer);
      }
      timersById.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toastSuccess: (message, requestId, action) => push({ variant: "success", message, requestId, action }),
      toastWarning: (message, requestId, action) => push({ variant: "warning", message, requestId, action }),
      toastError: (message, requestId, action) => push({ variant: "error", message, requestId, action }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div
        id={`atelier-toast-stack-${toastGroupId}`}
        className="fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "rounded-atelier border bg-surface/85 p-3 shadow-sm backdrop-blur ui-transition-fast",
              t.variant === "error"
                ? "border-danger/50"
                : t.variant === "warning"
                  ? "border-warning/50"
                  : "border-success/50",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm whitespace-pre-wrap break-words text-ink">{t.message}</div>
                {t.action ? (
                  <div className="mt-2">
                    <button
                      className="btn btn-secondary w-full"
                      onClick={async () => {
                        try {
                          await t.action?.onClick();
                        } finally {
                          remove(t.id);
                        }
                      }}
                      type="button"
                    >
                      {t.action.label}
                    </button>
                  </div>
                ) : null}
                {t.requestId ? <RequestIdBadge requestId={t.requestId} className="mt-2" /> : null}
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => remove(t.id)}
                type="button"
                aria-label="关闭提示"
                title="关闭"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
