import type { AnnotatedTextSegment } from "./annotatedTextSegments";
import type { MemoryAnnotation } from "./types";

export type AnnotationLens = "all" | string;

export function filterAnnotationsByLens(annotations: MemoryAnnotation[], lens: AnnotationLens): MemoryAnnotation[] {
  if (lens === "all") return annotations;
  return annotations.filter((annotation) => annotation.type === lens);
}

export function segmentMatchesLens(segment: AnnotatedTextSegment, lens: AnnotationLens): boolean {
  if (segment.kind === "text" || lens === "all") return true;
  return segment.groupAnnotations.some((annotation) => annotation.type === lens);
}
