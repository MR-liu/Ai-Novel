import type { MemoryAnnotation } from "./types";

export type AnnotationRevisionQueueSeed = {
  id: string;
  title: string;
  type: string;
  excerpt: string;
  hasExcerpt: boolean;
};

function compactPreview(text: string | null | undefined, limit = 72): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

export function buildAnnotationRevisionQueueSeed(
  annotation: MemoryAnnotation,
  content: string,
  validIds: Set<string>,
): AnnotationRevisionQueueSeed {
  const title = (annotation.title ?? "").trim() || compactPreview(annotation.content, 72);
  if (!validIds.has(annotation.id)) {
    return {
      id: annotation.id,
      title,
      type: annotation.type,
      excerpt: "",
      hasExcerpt: false,
    };
  }

  const excerpt = content
    .slice(annotation.position, annotation.position + annotation.length)
    .replace(/\s+/g, " ")
    .trim();

  return {
    id: annotation.id,
    title,
    type: annotation.type,
    excerpt,
    hasExcerpt: Boolean(excerpt),
  };
}
