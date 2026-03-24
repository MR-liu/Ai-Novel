export type PinyinMatchMode = "pinyin_full" | "pinyin_initials";

export type PinyinMatchResult = {
  matched: boolean;
  mode: PinyinMatchMode | null;
};

type PinyinIndex = { full: string; initials: string };

const PINYIN_INDEX_CACHE = new Map<string, PinyinIndex>();
type PinyinFn = (text: string, options?: Record<string, unknown>) => string;

let pinyinFn: PinyinFn | null = null;
let pinyinLoader: Promise<PinyinFn | null> | null = null;

export function hasChineseText(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function normalizeAsciiToken(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function tokenizeSearch(value: string): string[] {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return [];
  return raw.split(/\s+/g).filter(Boolean);
}

export function looksLikePinyinToken(token: string): boolean {
  return /[a-z]/i.test(token);
}

export function isPinyinSupportReady(): boolean {
  return pinyinFn !== null;
}

export function shouldPreloadPinyinSupport(tokens: string[], texts: Iterable<string>): boolean {
  if (!tokens.some(looksLikePinyinToken)) return false;
  for (const text of texts) {
    if (hasChineseText(text)) return true;
  }
  return false;
}

export async function preloadPinyinSupport(): Promise<boolean> {
  if (pinyinFn) return true;
  if (!pinyinLoader) {
    pinyinLoader = import("pinyin-pro")
      .then((mod) => {
        pinyinFn = mod.pinyin;
        return pinyinFn;
      })
      .catch(() => null)
      .finally(() => {
        pinyinLoader = null;
      });
  }
  return Boolean(await pinyinLoader);
}

export function getPinyinIndex(text: string): PinyinIndex | null {
  const key = String(text || "");
  if (!key) return { full: "", initials: "" };
  if (!hasChineseText(key)) return null;
  if (!pinyinFn) return null;

  const cached = PINYIN_INDEX_CACHE.get(key);
  if (cached) return cached;

  try {
    const full = normalizeAsciiToken(
      pinyinFn(key, {
        toneType: "none",
        separator: "",
        nonZh: "removed",
        v: true,
      }),
    );
    const initials = normalizeAsciiToken(
      pinyinFn(key, {
        toneType: "none",
        pattern: "first",
        separator: "",
        nonZh: "removed",
        v: true,
      }),
    );

    const out = { full, initials };
    PINYIN_INDEX_CACHE.set(key, out);
    return out;
  } catch {
    return null;
  }
}

export function containsPinyinMatch(text: string, token: string): PinyinMatchResult {
  const t = normalizeAsciiToken(token);
  if (!t) return { matched: false, mode: null };

  const idx = getPinyinIndex(text);
  if (!idx) return { matched: false, mode: null };

  if (idx.full.includes(t)) return { matched: true, mode: "pinyin_full" };
  if (idx.initials.includes(t)) return { matched: true, mode: "pinyin_initials" };
  return { matched: false, mode: null };
}
