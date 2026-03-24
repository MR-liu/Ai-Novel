export type ContinuityRevisionBridgeDraft = {
  id?: string | null;
  chapterId: string;
  title?: string | null;
  type?: string | null;
  excerpt?: string | null;
};

export type ContinuityRevisionBridge = {
  source: "analysis";
  id: string;
  chapterId: string;
  title: string;
  type: string;
  excerpt: string;
  hasExcerpt: boolean;
};

const REVISION_SOURCE_KEY = "revision_source";
const REVISION_ID_KEY = "revision_id";
const REVISION_CHAPTER_ID_KEY = "revision_chapter_id";
const REVISION_TITLE_KEY = "revision_title";
const REVISION_TYPE_KEY = "revision_type";
const REVISION_EXCERPT_KEY = "revision_excerpt";

const REVISION_KEYS = [
  REVISION_SOURCE_KEY,
  REVISION_ID_KEY,
  REVISION_CHAPTER_ID_KEY,
  REVISION_TITLE_KEY,
  REVISION_TYPE_KEY,
  REVISION_EXCERPT_KEY,
] as const;

function normalizeValue(value: string | null | undefined, maxLength: number): string {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

export function clearContinuityRevisionSearchParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  for (const key of REVISION_KEYS) next.delete(key);
  return next;
}

export function applyContinuityRevisionSearchParams(
  searchParams: URLSearchParams,
  draft: ContinuityRevisionBridgeDraft,
): URLSearchParams {
  const next = clearContinuityRevisionSearchParams(searchParams);
  const id = normalizeValue(draft.id, 160);
  const chapterId = normalizeValue(draft.chapterId, 120);
  const title = normalizeValue(draft.title, 120);
  const type = normalizeValue(draft.type, 48);
  const excerpt = normalizeValue(draft.excerpt, 180);

  if (!chapterId || (!title && !excerpt)) return next;

  next.set(REVISION_SOURCE_KEY, "analysis");
  if (id) next.set(REVISION_ID_KEY, id);
  next.set(REVISION_CHAPTER_ID_KEY, chapterId);
  if (title) next.set(REVISION_TITLE_KEY, title);
  if (type) next.set(REVISION_TYPE_KEY, type);
  if (excerpt) next.set(REVISION_EXCERPT_KEY, excerpt);
  return next;
}

export function parseContinuityRevisionSearchParams(searchParams: URLSearchParams): ContinuityRevisionBridge | null {
  const source = normalizeValue(searchParams.get(REVISION_SOURCE_KEY), 32);
  if (source && source !== "analysis") return null;

  const id = normalizeValue(searchParams.get(REVISION_ID_KEY), 160);
  const chapterId = normalizeValue(searchParams.get(REVISION_CHAPTER_ID_KEY), 120);
  const title = normalizeValue(searchParams.get(REVISION_TITLE_KEY), 120);
  const type = normalizeValue(searchParams.get(REVISION_TYPE_KEY), 48) || "other";
  const excerpt = normalizeValue(searchParams.get(REVISION_EXCERPT_KEY), 180);

  if (!chapterId || (!title && !excerpt)) return null;

  return {
    source: "analysis",
    id: id || `${chapterId}:${type}:${title || excerpt}`,
    chapterId,
    title: title || excerpt,
    type,
    excerpt,
    hasExcerpt: Boolean(excerpt),
  };
}
