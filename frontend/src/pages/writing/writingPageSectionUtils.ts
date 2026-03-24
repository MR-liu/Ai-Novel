export function estimateCharacterCount(value: string): number {
  return String(value || "").replace(/\s+/g, "").length;
}

export function compactPreview(text: string, limit = 96): string {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}
