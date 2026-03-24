import { getCurrentUserId } from "./currentUser";
import { storageKey } from "./storageKeys";

export type ContinuityRevisionQueueItem = {
  id: string;
  source: "analysis";
  chapterId: string;
  title: string;
  type: string;
  excerpt: string;
  hasExcerpt: boolean;
  createdAt: string;
  progressStatus: ContinuityRevisionProgressStatus | null;
  progressUpdatedAt: string | null;
};

export type ContinuityRevisionProgressStatus = "dirty" | "saved";

export type ContinuityRevisionQueueDraft = {
  id: string;
  chapterId: string;
  title?: string | null;
  type?: string | null;
  excerpt?: string | null;
  hasExcerpt?: boolean;
};

const MAX_QUEUE_ITEMS = 12;

function continuityRevisionQueueStorageKey(userId: string, projectId: string, chapterId: string): string {
  return storageKey("continuity_revision_queue", userId, projectId, chapterId);
}

function normalizeValue(value: string | null | undefined, maxLength: number): string {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function normalizeProgressStatus(value: unknown): ContinuityRevisionProgressStatus | null {
  switch (value) {
    case "dirty":
    case "saved":
      return value;
    default:
      return null;
  }
}

function normalizeDraft(draft: ContinuityRevisionQueueDraft): ContinuityRevisionQueueItem | null {
  const id = normalizeValue(draft.id, 160);
  const chapterId = normalizeValue(draft.chapterId, 120);
  const title = normalizeValue(draft.title, 120);
  const type = normalizeValue(draft.type, 48) || "other";
  const excerpt = normalizeValue(draft.excerpt, 180);
  const hasExcerpt = Boolean(excerpt) && (draft.hasExcerpt ?? true);

  if (!id || !chapterId || (!title && !excerpt)) return null;

  return {
    id,
    source: "analysis",
    chapterId,
    title: title || excerpt,
    type,
    excerpt,
    hasExcerpt,
    createdAt: new Date().toISOString(),
    progressStatus: null,
    progressUpdatedAt: null,
  };
}

function readRawQueue(userId: string, projectId: string, chapterId: string): ContinuityRevisionQueueItem[] {
  try {
    const raw = localStorage.getItem(continuityRevisionQueueStorageKey(userId, projectId, chapterId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: ContinuityRevisionQueueItem[] } | ContinuityRevisionQueueItem[];
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => Boolean(item && typeof item.id === "string" && item.id.trim()))
      .map((item) => {
        const progressStatus = normalizeProgressStatus((item as Partial<ContinuityRevisionQueueItem>).progressStatus);
        return {
          ...item,
          progressStatus,
          progressUpdatedAt: progressStatus
            ? normalizeValue((item as Partial<ContinuityRevisionQueueItem>).progressUpdatedAt, 80) || item.createdAt
            : null,
        };
      });
  } catch {
    return [];
  }
}

function writeRawQueue(userId: string, projectId: string, chapterId: string, items: ContinuityRevisionQueueItem[]): void {
  const key = continuityRevisionQueueStorageKey(userId, projectId, chapterId);
  if (!items.length) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify({ items }));
}

export function readContinuityRevisionQueue(projectId: string, chapterId: string, userId = getCurrentUserId()): ContinuityRevisionQueueItem[] {
  return readRawQueue(userId, projectId, chapterId);
}

export function upsertContinuityRevisionQueueItems(
  projectId: string,
  chapterId: string,
  drafts: ContinuityRevisionQueueDraft[],
  userId = getCurrentUserId(),
): ContinuityRevisionQueueItem[] {
  const existing = readRawQueue(userId, projectId, chapterId);
  const itemsById = new Map(existing.map((item) => [item.id, item]));

  for (const draft of drafts) {
    const normalized = normalizeDraft(draft);
    if (!normalized) continue;
    const current = itemsById.get(normalized.id);
    itemsById.set(normalized.id, current ? { ...current, ...normalized, createdAt: current.createdAt } : normalized);
  }

  const next = Array.from(itemsById.values())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-MAX_QUEUE_ITEMS);
  writeRawQueue(userId, projectId, chapterId, next);
  return next;
}

export function removeContinuityRevisionQueueItem(
  projectId: string,
  chapterId: string,
  itemId: string,
  userId = getCurrentUserId(),
): ContinuityRevisionQueueItem[] {
  const next = readRawQueue(userId, projectId, chapterId).filter((item) => item.id !== itemId);
  writeRawQueue(userId, projectId, chapterId, next);
  return next;
}

export function setContinuityRevisionQueueItemProgress(
  projectId: string,
  chapterId: string,
  itemId: string,
  progressStatus: ContinuityRevisionProgressStatus | null,
  userId = getCurrentUserId(),
): ContinuityRevisionQueueItem[] {
  const next = readRawQueue(userId, projectId, chapterId).map((item) => {
    if (item.id !== itemId) return item;
    return {
      ...item,
      progressStatus,
      progressUpdatedAt: progressStatus ? new Date().toISOString() : null,
    };
  });
  writeRawQueue(userId, projectId, chapterId, next);
  return next;
}

export function clearContinuityRevisionQueue(projectId: string, chapterId: string, userId = getCurrentUserId()): void {
  writeRawQueue(userId, projectId, chapterId, []);
}
