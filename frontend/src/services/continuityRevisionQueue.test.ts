import { beforeEach, describe, expect, it } from "vitest";

import { setCurrentUserId } from "./currentUser";
import {
  clearContinuityRevisionQueue,
  readContinuityRevisionQueue,
  removeContinuityRevisionQueueItem,
  setContinuityRevisionQueueItemProgress,
  upsertContinuityRevisionQueueItems,
} from "./continuityRevisionQueue";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function createLocalStorageMock(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("continuityRevisionQueue service", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createLocalStorageMock(),
    });
    setCurrentUserId("writer-1");
  });

  it("stores and reads a chapter-scoped queue", () => {
    upsertContinuityRevisionQueueItems("p1", "c1", [
      {
        id: "ann-1",
        chapterId: "c1",
        title: "人物状态冲突",
        type: "character_state",
        excerpt: "她说自己毫无睡意。",
      },
    ]);

    expect(readContinuityRevisionQueue("p1", "c1")).toEqual([
      expect.objectContaining({
        id: "ann-1",
        chapterId: "c1",
        title: "人物状态冲突",
        type: "character_state",
        excerpt: "她说自己毫无睡意。",
        hasExcerpt: true,
      }),
    ]);
  });

  it("deduplicates by item id and preserves queue order", () => {
    upsertContinuityRevisionQueueItems("p1", "c1", [
      { id: "ann-1", chapterId: "c1", title: "A" },
      { id: "ann-2", chapterId: "c1", title: "B" },
    ]);
    upsertContinuityRevisionQueueItems("p1", "c1", [
      { id: "ann-1", chapterId: "c1", title: "A2", excerpt: "定位句" },
    ]);

    expect(readContinuityRevisionQueue("p1", "c1").map((item) => item.id)).toEqual(["ann-1", "ann-2"]);
    expect(readContinuityRevisionQueue("p1", "c1")[0]).toEqual(
      expect.objectContaining({
        title: "A2",
        excerpt: "定位句",
      }),
    );
  });

  it("removes and clears queue items", () => {
    upsertContinuityRevisionQueueItems("p1", "c1", [
      { id: "ann-1", chapterId: "c1", title: "A" },
      { id: "ann-2", chapterId: "c1", title: "B" },
    ]);

    expect(removeContinuityRevisionQueueItem("p1", "c1", "ann-1").map((item) => item.id)).toEqual(["ann-2"]);
    clearContinuityRevisionQueue("p1", "c1");
    expect(readContinuityRevisionQueue("p1", "c1")).toEqual([]);
  });

  it("stores persistent progress status for queued items", () => {
    upsertContinuityRevisionQueueItems("p1", "c1", [
      { id: "ann-1", chapterId: "c1", title: "A" },
      { id: "ann-2", chapterId: "c1", title: "B" },
    ]);

    const next = setContinuityRevisionQueueItemProgress("p1", "c1", "ann-2", "saved");
    expect(next[1]).toEqual(
      expect.objectContaining({
        id: "ann-2",
        progressStatus: "saved",
      }),
    );
    expect(readContinuityRevisionQueue("p1", "c1")[1]).toEqual(
      expect.objectContaining({
        id: "ann-2",
        progressStatus: "saved",
      }),
    );

    expect(setContinuityRevisionQueueItemProgress("p1", "c1", "ann-2", null)[1]).toEqual(
      expect.objectContaining({
        id: "ann-2",
        progressStatus: null,
        progressUpdatedAt: null,
      }),
    );
  });

  it("isolates queue by user and chapter", () => {
    upsertContinuityRevisionQueueItems("p1", "c1", [{ id: "ann-1", chapterId: "c1", title: "A" }]);
    upsertContinuityRevisionQueueItems("p1", "c2", [{ id: "ann-2", chapterId: "c2", title: "B" }]);
    setCurrentUserId("writer-2");

    expect(readContinuityRevisionQueue("p1", "c1")).toEqual([]);
    setCurrentUserId("writer-1");
    expect(readContinuityRevisionQueue("p1", "c1").map((item) => item.id)).toEqual(["ann-1"]);
    expect(readContinuityRevisionQueue("p1", "c2").map((item) => item.id)).toEqual(["ann-2"]);
  });
});
