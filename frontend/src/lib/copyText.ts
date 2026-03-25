import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { importWithChunkRetry } from "./lazyImportRetry";

export type CopyTextOptions = {
  title?: string;
  description?: string;
};

async function showCopyFallbackModal(text: string, opts: CopyTextOptions | undefined): Promise<void> {
  if (typeof document === "undefined") return;

  const container = document.createElement("div");
  container.dataset.ainovel = "copy-fallback-modal";
  document.body.appendChild(container);

  const root = createRoot(container);
  const cleanup = () => {
    root.unmount();
    container.remove();
  };

  const mod = await importWithChunkRetry(() => import("../components/ui/CopyFallbackModal"));
  root.render(
    createElement(mod.CopyFallbackModal, {
      text,
      title: opts?.title ?? "复制失败，请手动复制",
      description: opts?.description ?? "浏览器拒绝访问 Clipboard API。你可以在下面文本框中手动复制。",
      onClose: cleanup,
    }),
  );
}

export async function copyText(text: string, opts?: CopyTextOptions): Promise<boolean> {
  const safeText = String(text ?? "");
  if (!safeText) return true;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(safeText);
      return true;
    }
  } catch {
    // noop
  }

  await showCopyFallbackModal(safeText, opts);
  return false;
}
