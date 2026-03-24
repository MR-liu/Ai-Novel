import { describe, expect, it } from "vitest";

import type { MemoryAnnotation } from "./types";
import {
  countAnnotationsInScope,
  filterAnnotationsByQuery,
  filterAnnotationsByScope,
  getAnnotationPriority,
  isAnnotationDone,
  matchesAnnotationQuery,
  matchesMemoryScope,
} from "./memorySidebarFilters";

function makeAnnotation(args: Partial<MemoryAnnotation> & { id: string }): MemoryAnnotation {
  return {
    id: args.id,
    type: args.type ?? "plot_point",
    title: args.title ?? null,
    content: args.content ?? "",
    importance: args.importance ?? 0.5,
    position: args.position ?? 0,
    length: args.length ?? 12,
    tags: args.tags ?? [],
    metadata: args.metadata ?? {},
  };
}

describe("memorySidebarFilters", () => {
  it("detects done state from annotation metadata", () => {
    expect(isAnnotationDone(makeAnnotation({ id: "done", metadata: { done: true } }))).toBe(true);
    expect(isAnnotationDone(makeAnnotation({ id: "open", metadata: {} }))).toBe(false);
  });

  it("treats actionable scope as unfinished items", () => {
    const validIds = new Set(["a", "b"]);
    const open = makeAnnotation({ id: "a" });
    const done = makeAnnotation({ id: "b", metadata: { done: true } });

    expect(matchesMemoryScope(open, validIds, "actionable")).toBe(true);
    expect(matchesMemoryScope(done, validIds, "actionable")).toBe(false);
  });

  it("filters unmapped items independently from done state", () => {
    const annotations = [
      makeAnnotation({ id: "mapped-open" }),
      makeAnnotation({ id: "mapped-done", metadata: { done: true } }),
      makeAnnotation({ id: "unmapped-open" }),
      makeAnnotation({ id: "unmapped-done", metadata: { done: true } }),
    ];
    const validIds = new Set(["mapped-open", "mapped-done"]);

    expect(filterAnnotationsByScope(annotations, validIds, "unmapped").map((annotation) => annotation.id)).toEqual([
      "unmapped-open",
      "unmapped-done",
    ]);
    expect(countAnnotationsInScope(annotations, validIds, "actionable")).toBe(2);
  });

  it("matches query against title, content, tags and type label", () => {
    const annotation = makeAnnotation({
      id: "match",
      type: "foreshadow",
      title: "旧灯塔",
      content: "她在港口再次看到那盏灯。",
      tags: ["海港", "回收线索"],
    });

    expect(matchesAnnotationQuery(annotation, "灯塔")).toBe(true);
    expect(matchesAnnotationQuery(annotation, "海港")).toBe(true);
    expect(matchesAnnotationQuery(annotation, "伏笔")).toBe(true);
    expect(matchesAnnotationQuery(annotation, "不存在")).toBe(false);
  });

  it("filters annotations by search query", () => {
    const annotations = [
      makeAnnotation({ id: "a", title: "主角状态", content: "角色心态变化" }),
      makeAnnotation({ id: "b", title: "旧承诺", content: "伏笔将在终章回收", type: "foreshadow" }),
    ];

    expect(filterAnnotationsByQuery(annotations, "伏笔").map((annotation) => annotation.id)).toEqual(["b"]);
    expect(filterAnnotationsByQuery(annotations, "").map((annotation) => annotation.id)).toEqual(["a", "b"]);
  });

  it("scores unmapped and important unfinished annotations higher", () => {
    const validIds = new Set(["stable"]);

    const risky = getAnnotationPriority({
      annotation: makeAnnotation({ id: "risky", importance: 0.9 }),
      validIds,
    });
    const stable = getAnnotationPriority({
      annotation: makeAnnotation({ id: "stable", importance: 0.4, metadata: { done: true } }),
      validIds,
    });

    expect(risky.reasons).toContain("unmapped");
    expect(risky.reasons).toContain("open");
    expect(risky.reasons).toContain("important");
    expect(risky.score).toBeGreaterThan(stable.score);
  });
});
