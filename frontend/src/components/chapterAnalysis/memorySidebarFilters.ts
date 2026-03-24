import { labelForAnnotationType } from "./types";
import type { MemoryAnnotation } from "./types";

export type MemoryListScope = "all" | "actionable" | "unmapped";
export type MemoryPriorityReason = "unmapped" | "open" | "important";

export function isAnnotationDone(annotation: MemoryAnnotation): boolean {
  const meta = annotation.metadata;
  if (!meta || typeof meta !== "object") return false;
  return Boolean((meta as Record<string, unknown>).done);
}

export function matchesMemoryScope(
  annotation: MemoryAnnotation,
  validIds: Set<string>,
  scope: MemoryListScope,
): boolean {
  switch (scope) {
    case "actionable":
      return !isAnnotationDone(annotation);
    case "unmapped":
      return !validIds.has(annotation.id);
    case "all":
    default:
      return true;
  }
}

export function filterAnnotationsByScope(
  annotations: MemoryAnnotation[],
  validIds: Set<string>,
  scope: MemoryListScope,
): MemoryAnnotation[] {
  return annotations.filter((annotation) => matchesMemoryScope(annotation, validIds, scope));
}

export function countAnnotationsInScope(
  annotations: MemoryAnnotation[],
  validIds: Set<string>,
  scope: MemoryListScope,
): number {
  let count = 0;
  for (const annotation of annotations) {
    if (matchesMemoryScope(annotation, validIds, scope)) count += 1;
  }
  return count;
}

function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function matchesAnnotationQuery(annotation: MemoryAnnotation, query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;

  const haystacks = [
    annotation.title,
    annotation.content,
    labelForAnnotationType(annotation.type),
    annotation.type,
    ...(annotation.tags ?? []),
  ];

  return haystacks.some((value) => normalizeSearchText(value).includes(normalized));
}

export function filterAnnotationsByQuery(annotations: MemoryAnnotation[], query: string): MemoryAnnotation[] {
  return annotations.filter((annotation) => matchesAnnotationQuery(annotation, query));
}

export function getAnnotationPriority(args: {
  annotation: MemoryAnnotation;
  validIds: Set<string>;
}): { score: number; reasons: MemoryPriorityReason[] } {
  const reasons: MemoryPriorityReason[] = [];
  let score = 0;

  if (!args.validIds.has(args.annotation.id)) {
    score += 5;
    reasons.push("unmapped");
  }
  if (!isAnnotationDone(args.annotation)) {
    score += 2;
    reasons.push("open");
  }
  if (args.annotation.importance >= 0.75) {
    score += 2;
    reasons.push("important");
  }

  score += Math.round(args.annotation.importance * 10);
  return { score, reasons };
}
