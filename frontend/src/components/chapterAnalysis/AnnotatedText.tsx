import clsx from "clsx";
import { useEffect, useMemo, useRef } from "react";

import { filterAnnotationsByLens, segmentMatchesLens, type AnnotationLens } from "./annotationLens";
import { buildAnnotationMiniMap } from "./annotationMiniMap";
import { buildAnnotationTimeline } from "./annotationTimeline";
import type { AnnotatedTextSegment } from "./annotatedTextSegments";
import { buildAnnotatedTextSegments } from "./annotatedTextSegments";
import type { MemoryAnnotation } from "./types";
import { labelForAnnotationType } from "./types";

function buildTooltipText(annotations: MemoryAnnotation[]): string {
  const pieces: string[] = [];
  const sorted = [...annotations].sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id));
  for (const a of sorted) {
    const title = (a.title ?? "").trim();
    const head = `${labelForAnnotationType(a.type)} · ${title || "（无标题）"} · ${(a.importance * 10).toFixed(1)}/10`;
    const snippet = (a.content ?? "").trim().slice(0, 120);
    pieces.push(snippet ? `${head}\n${snippet}` : head);
  }
  return pieces.join("\n\n");
}

function buildSegmentMetaText(args: { isOverlap: boolean; isBridge: boolean; overlapCount: number; activeCount: number }) {
  if (args.isBridge) return `桥接片段 · 连接 ${args.overlapCount} 条相邻命中`;
  if (args.isOverlap) return `重叠片段 · 当前同时命中 ${args.activeCount} 条记忆`;
  return null;
}

function compactPreview(text: string | null | undefined, limit = 80): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "（空）";
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function colorClassForType(type: string): { border: string; activeBg: string; hoverBg: string } {
  switch (type) {
    case "hook":
      return { border: "border-accent/70", activeBg: "bg-accent/10", hoverBg: "hover:bg-accent/5" };
    case "foreshadow":
      return { border: "border-info/70", activeBg: "bg-info/10", hoverBg: "hover:bg-info/5" };
    case "plot_point":
      return { border: "border-success/70", activeBg: "bg-success/10", hoverBg: "hover:bg-success/5" };
    case "character_state":
      return { border: "border-warning/70", activeBg: "bg-warning/10", hoverBg: "hover:bg-warning/5" };
    case "chapter_summary":
      return { border: "border-border", activeBg: "bg-canvas/60", hoverBg: "hover:bg-canvas/40" };
    default:
      return { border: "border-border", activeBg: "bg-canvas/60", hoverBg: "hover:bg-canvas/40" };
  }
}

function typeSummaryForAnnotations(annotations: MemoryAnnotation[]): string {
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    counts.set(annotation.type, (counts.get(annotation.type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([type, count]) => `${labelForAnnotationType(type)} ${count}`)
    .join(" · ");
}

const LEGEND_ITEMS: Array<{ key: string; label: string; copy: string; badge?: string; tone?: "overlap" | "bridge" }> = [
  {
    key: "single",
    label: "单条命中",
    copy: "普通底边表示当前句子主要命中一条记忆，适合先做基础核对。",
  },
  {
    key: "overlap",
    label: "重叠命中",
    copy: "带 ×N 的虚线底边表示同一段正文同时命中多条记忆，优先仔细检查。",
    badge: "×N",
    tone: "overlap",
  },
  {
    key: "bridge",
    label: "桥接片段",
    copy: "带“桥”的点线底边表示两条命中彼此很近，适合连着判断，不要拆开看。",
    badge: "桥",
    tone: "bridge",
  },
];

const FOCUS_PRIORITIES: Array<{
  key: string;
  label: string;
  tone?: "warning" | "info" | "accent";
  getCount: (args: { overlapSegmentCount: number; bridgeSegmentCount: number; importantCount: number }) => number;
  getCopy: (count: number) => string;
}> = [
  {
    key: "overlap",
    label: "先看重叠段",
    tone: "warning",
    getCount: ({ overlapSegmentCount }) => overlapSegmentCount,
    getCopy: (count) => (count > 0 ? `有 ${count} 段正文同时命中多条记忆，最容易出连续性冲突。` : "当前没有重叠命中，可以按常规顺序核对。"),
  },
  {
    key: "important",
    label: "高重要度条目",
    tone: "accent",
    getCount: ({ importantCount }) => importantCount,
    getCopy: (count) => (count > 0 ? `有 ${count} 条重要度较高的命中，适合作为第一轮核对主线。` : "当前没有特别高的重要度条目。"),
  },
  {
    key: "bridge",
    label: "连着看桥接段",
    tone: "info",
    getCount: ({ bridgeSegmentCount }) => bridgeSegmentCount,
    getCopy: (count) => (count > 0 ? `有 ${count} 段桥接片段，阅读时更适合把相邻命中连起来判断。` : "当前桥接片段不多，可以逐条单看。"),
  },
];

export function AnnotatedText(props: {
  content: string;
  annotations: MemoryAnnotation[];
  annotationLens: AnnotationLens;
  activeAnnotationId?: string | null;
  hoveredAnnotationIds?: string[];
  scrollToAnnotationId?: string | null;
  onAnnotationClick?: (annotation: MemoryAnnotation, opts?: { scroll?: boolean }) => void;
  onAnnotationLensChange?: (lens: AnnotationLens) => void;
  onHoverAnnotationIdsChange?: (ids: string[]) => void;
  className?: string;
}) {
  const refsByIdRef = useRef<Map<string, { pos: number; el: HTMLButtonElement }>>(new Map());
  const segments = useMemo(
    () =>
      buildAnnotatedTextSegments({
        content: props.content,
        annotations: props.annotations,
        adjacencyTolerance: 5,
      }),
    [props.annotations, props.content],
  );
  const countsByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const annotation of props.annotations) {
      counts.set(annotation.type, (counts.get(annotation.type) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [props.annotations]);
  const activeAnnotation = useMemo(
    () => props.annotations.find((annotation) => annotation.id === props.activeAnnotationId) ?? null,
    [props.activeAnnotationId, props.annotations],
  );
  const focusedAnnotations = useMemo(
    () => filterAnnotationsByLens(props.annotations, props.annotationLens),
    [props.annotationLens, props.annotations],
  );
  const focusedSegments = useMemo(
    () =>
      segments.filter(
        (segment): segment is Extract<AnnotatedTextSegment, { kind: "annotated" }> =>
          segment.kind === "annotated" && segmentMatchesLens(segment, props.annotationLens),
      ),
    [props.annotationLens, segments],
  );
  const overlapSegmentCount = useMemo(
    () => focusedSegments.filter((segment) => segment.isOverlap).length,
    [focusedSegments],
  );
  const bridgeSegmentCount = useMemo(
    () => focusedSegments.filter((segment) => segment.isBridge).length,
    [focusedSegments],
  );
  const importantCount = useMemo(
    () => focusedAnnotations.filter((annotation) => annotation.importance >= 0.75).length,
    [focusedAnnotations],
  );
  const hoveredIds = props.hoveredAnnotationIds ?? [];
  const miniMap = useMemo(
    () => buildAnnotationMiniMap({ annotations: focusedAnnotations, contentLength: Math.max(props.content.length, 1) }),
    [focusedAnnotations, props.content.length],
  );
  const timelineZones = useMemo(
    () => buildAnnotationTimeline({ annotations: focusedAnnotations, contentLength: Math.max(props.content.length, 1) }),
    [focusedAnnotations, props.content.length],
  );
  const focusItems = useMemo(() => {
    const context = { overlapSegmentCount, bridgeSegmentCount, importantCount };
    return FOCUS_PRIORITIES.map((item) => ({
      ...item,
      count: item.getCount(context),
      copy: item.getCopy(item.getCount(context)),
    })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [bridgeSegmentCount, importantCount, overlapSegmentCount]);

  useEffect(() => {
    if (!props.scrollToAnnotationId) return;
    const target = refsByIdRef.current.get(props.scrollToAnnotationId)?.el;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [props.scrollToAnnotationId, segments]);

  const lensLabel = props.annotationLens === "all" ? "全部命中" : labelForAnnotationType(props.annotationLens);

  return (
    <div className={clsx("grid gap-4", props.className)}>
      <div className="review-reading-summary">
        <div className="review-reading-summary-header">
          <div>
            <div className="editorial-kicker">正文高亮</div>
            <div className="review-reading-summary-title">先点高亮，再读侧栏</div>
            <div className="review-reading-summary-copy">
              高亮只负责把可能有连续性价值的句子提到眼前。悬停能先预览与侧栏的对应关系，点击后再进入真正治理动作。
            </div>
          </div>
        </div>
        <div className="review-reading-summary-grid lg:grid-cols-4">
          <div className="review-reading-summary-card is-emphasis">
            <div className="review-reading-summary-label">当前选中</div>
            <div className="review-reading-summary-value">
              {activeAnnotation ? labelForAnnotationType(activeAnnotation.type) : "尚未选中高亮"}
            </div>
            <div className="review-reading-summary-copy-small">
              {activeAnnotation
                ? compactPreview(activeAnnotation.title || activeAnnotation.content, 96)
                : "点击正文中的高亮片段或右侧命中项后，这里会同步显示当前焦点。"}
            </div>
          </div>
          <div className="review-reading-summary-card">
            <div className="review-reading-summary-label">高亮数量</div>
            <div className="review-reading-summary-value">{focusedAnnotations.length}</div>
            <div className="review-reading-summary-copy-small">
              {props.annotationLens === "all" ? "这些高亮是当前连续性核对里最值得先看的位置。" : `当前正在看「${lensLabel}」专题。`}
            </div>
          </div>
          <div className="review-reading-summary-card">
            <div className="review-reading-summary-label">重叠片段</div>
            <div className="review-reading-summary-value">{overlapSegmentCount}</div>
            <div className="review-reading-summary-copy-small">
              同一段正文同时命中多条记忆时，会优先用更明显的反馈提示你。
            </div>
          </div>
          <div className="review-reading-summary-card">
            <div className="review-reading-summary-label">桥接片段</div>
            <div className="review-reading-summary-value">{bridgeSegmentCount}</div>
            <div className="review-reading-summary-copy-small">
              桥接片段说明两条命中彼此很近，阅读时适合连着看，而不是拆开判断。
            </div>
          </div>
        </div>
        <div className="review-side-chip-row">
          <button
            type="button"
            className={clsx("manuscript-chip", props.annotationLens === "all" && "is-active")}
            onClick={() => props.onAnnotationLensChange?.("all")}
            aria-pressed={props.annotationLens === "all"}
          >
            全部 {props.annotations.length}
          </button>
          {countsByType.map(([type, count]) => (
            <button
              key={type}
              type="button"
              className={clsx("manuscript-chip", props.annotationLens === type && "is-active")}
              onClick={() => props.onAnnotationLensChange?.(type)}
              aria-pressed={props.annotationLens === type}
            >
              {labelForAnnotationType(type)} {count}
            </button>
          ))}
        </div>
        <div className="review-lens-summary">
          <div className="review-lens-title">专题扫描</div>
          <div className="review-lens-copy">
            当前专题：{lensLabel}。正文里非当前专题的高亮会被弱化，但不会消失，方便你保持上下文连续阅读。
          </div>
        </div>
        <div className="review-focus-grid">
          {focusItems.map((item) => (
            <div
              key={item.key}
              className={clsx(
                "review-focus-card",
                item.tone === "warning" && "is-warning",
                item.tone === "info" && "is-info",
                item.tone === "accent" && "is-accent",
              )}
            >
              <div className="review-focus-label">{item.label}</div>
              <div className="review-focus-value">{item.count > 0 ? `${item.count} 处` : "当前较少"}</div>
              <div className="review-focus-copy">{item.copy}</div>
            </div>
          ))}
        </div>
        <div className="review-timeline-grid">
          {timelineZones.map((zone) => {
            const hasLead = Boolean(zone.leadAnnotation);
            const isHovered = hoveredIds.length > 0 && zone.annotationIds.some((id) => hoveredIds.includes(id));
            const leadType = zone.leadAnnotation ? labelForAnnotationType(zone.leadAnnotation.type) : "暂无命中";
            const leadCopy = zone.leadAnnotation
              ? compactPreview(zone.leadAnnotation.title || zone.leadAnnotation.content, 48)
              : "这一段当前没有命中。";

            return (
              <button
                key={zone.key}
                type="button"
                className={clsx(
                  "review-timeline-card",
                  zone.count === 0 && "is-muted",
                  zone.importantCount > 0 && "is-important",
                  isHovered && "is-hovered",
                )}
                disabled={!hasLead}
                onClick={() => {
                  if (!zone.leadAnnotation) return;
                  props.onAnnotationClick?.(zone.leadAnnotation, { scroll: true });
                }}
                onMouseEnter={() => {
                  if (!zone.annotationIds.length) return;
                  props.onHoverAnnotationIdsChange?.(zone.annotationIds);
                }}
                onMouseLeave={() => props.onHoverAnnotationIdsChange?.([])}
                onFocus={() => {
                  if (!zone.annotationIds.length) return;
                  props.onHoverAnnotationIdsChange?.(zone.annotationIds);
                }}
                onBlur={() => props.onHoverAnnotationIdsChange?.([])}
                aria-label={`timeline_zone:${zone.label}`}
              >
                <div className="review-timeline-label">{zone.label}</div>
                <div className="review-timeline-value">{zone.count > 0 ? `${zone.count} 条命中` : "当前空白"}</div>
                <div className="review-timeline-copy">
                  {zone.count > 0
                    ? `高重要度 ${zone.importantCount} 条 · 均值 ${(zone.averageImportance * 10).toFixed(1)}`
                    : "可先跳过这一段，回头再扫。"}
                </div>
                <div className="review-timeline-chip-row">
                  <span className="manuscript-chip">{leadType}</span>
                  {zone.count > 0 ? <span className="manuscript-chip">{typeSummaryForAnnotations(props.annotations.filter((annotation) => zone.annotationIds.includes(annotation.id))) || "混合命中"}</span> : null}
                </div>
                <div className="review-timeline-lead">{leadCopy}</div>
              </button>
            );
          })}
        </div>
        <div className="review-minimap-panel">
          <div className="review-minimap-header">
            <div>
              <div className="review-minimap-title">章节扫描带</div>
              <div className="review-minimap-copy">越靠右越接近章末。悬停可预览联动，点击刻度会直接跳到正文对应命中。</div>
            </div>
            <div className="review-minimap-meta">
              {miniMap.markers.length} 个落点 · {miniMap.laneCount} 层扫描
            </div>
          </div>
          <div
            className="review-minimap-track"
            style={{ ["--review-minimap-lanes" as string]: String(miniMap.laneCount) }}
            aria-label="章节命中小地图"
          >
            <div className="review-minimap-rail" aria-hidden="true" />
            {miniMap.markers.map((marker) => {
              const activeId = props.activeAnnotationId ?? null;
              const isActive = activeId === marker.annotation.id;
              const isHovered = hoveredIds.includes(marker.annotation.id);
              return (
                <button
                  key={marker.annotation.id}
                  type="button"
                  className={clsx(
                    "review-minimap-marker",
                    `is-${marker.annotation.type}`,
                    isActive && "is-active",
                    isHovered && "is-hovered",
                  )}
                  style={{
                    left: `${marker.leftPct}%`,
                    width: `${marker.widthPct}%`,
                    top: `calc(${marker.lane} * (var(--review-minimap-row-height) + 0.3rem))`,
                  }}
                  title={`${labelForAnnotationType(marker.annotation.type)} · ${compactPreview(
                    marker.annotation.title || marker.annotation.content,
                    48,
                  )}`}
                  onClick={() => props.onAnnotationClick?.(marker.annotation, { scroll: true })}
                  onMouseEnter={() => props.onHoverAnnotationIdsChange?.([marker.annotation.id])}
                  onMouseLeave={() => props.onHoverAnnotationIdsChange?.([])}
                  onFocus={() => props.onHoverAnnotationIdsChange?.([marker.annotation.id])}
                  onBlur={() => props.onHoverAnnotationIdsChange?.([])}
                  aria-label={`jump_to_annotation:${marker.annotation.id}`}
                />
              );
            })}
          </div>
          <div className="review-minimap-scale" aria-hidden="true">
            <span>章首</span>
            <span>中段</span>
            <span>章末</span>
          </div>
        </div>
        <div className="review-legend-grid" aria-label="正文高亮图例">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.key} className="review-legend-item">
              <span
                className={clsx(
                  "review-legend-swatch",
                  item.tone === "overlap" && "is-overlap",
                  item.tone === "bridge" && "is-bridge",
                )}
                aria-hidden="true"
              >
                示例
                {item.badge ? <span className="review-legend-badge">{item.badge}</span> : null}
              </span>
              <div className="min-w-0">
                <div className="review-legend-label">{item.label}</div>
                <div className="review-legend-copy">{item.copy}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className={clsx("min-w-0 max-w-full whitespace-pre-wrap break-words font-content text-sm leading-relaxed text-ink")}
      >
        {segments.map((segment, idx) => {
          if (segment.kind === "text") {
            return <span key={`t-${idx}`}>{segment.text}</span>;
          }

          const activeId = props.activeAnnotationId ?? null;
          const isActive = activeId ? segment.activeAnnotations.some((a) => a.id === activeId) : false;
          const isHovered = hoveredIds.length > 0 && segment.activeAnnotations.some((annotation) => hoveredIds.includes(annotation.id));
          const matchesLens = segmentMatchesLens(segment, props.annotationLens);
          const colors = colorClassForType(segment.primary.type);
          const metaText = buildSegmentMetaText({
            isOverlap: segment.isOverlap,
            isBridge: segment.isBridge,
            overlapCount: segment.overlapCount,
            activeCount: segment.activeCount,
          });
          const detailsText = buildTooltipText(segment.groupAnnotations);
          const title = metaText ? `${metaText}\n\n${detailsText}` : detailsText;

          return (
            <button
              type="button"
              key={`a-${idx}-${segment.primary.id}-${segment.start}`}
              ref={(el) => {
                if (!el) return;
                for (const ann of segment.activeAnnotations) {
                  const existing = refsByIdRef.current.get(ann.id);
                  if (!existing || !existing.el.isConnected || segment.start < existing.pos) {
                    refsByIdRef.current.set(ann.id, { pos: segment.start, el });
                  }
                }
              }}
              className={clsx(
                "ui-focus-ring ui-transition-fast cursor-pointer break-words rounded-sm border-b-2 px-0.5 py-0.5",
                colors.border,
                colors.hoverBg,
                segment.isOverlap && "bg-canvas/35",
                segment.isBridge && "bg-canvas/25 text-ink/90",
                isHovered && !isActive && "bg-accent/10 ring-1 ring-accent/20 shadow-sm",
                props.annotationLens !== "all" && !matchesLens && !isActive && !isHovered && "opacity-45 saturate-50",
                isActive ? `${colors.activeBg} ring-1 ring-accent/25 font-medium shadow-sm` : "bg-transparent",
              )}
              style={{
                borderBottomStyle: segment.isBridge ? "dotted" : segment.isOverlap ? "dashed" : "solid",
              }}
              title={title}
              onClick={() => props.onAnnotationClick?.(segment.primary)}
              onMouseEnter={() => props.onHoverAnnotationIdsChange?.(segment.activeAnnotations.map((annotation) => annotation.id))}
              onMouseLeave={() => props.onHoverAnnotationIdsChange?.([])}
              onFocus={() => props.onHoverAnnotationIdsChange?.(segment.activeAnnotations.map((annotation) => annotation.id))}
              onBlur={() => props.onHoverAnnotationIdsChange?.([])}
              data-annotation-id={segment.primary.id}
              aria-pressed={isActive}
            >
              {segment.text}
              {segment.isOverlap ? (
                <span className="ml-1 align-super text-[10px] font-semibold text-subtext" aria-hidden="true">
                  ×{segment.activeCount}
                </span>
              ) : null}
              {segment.isBridge ? (
                <span className="ml-1 align-super text-[10px] tracking-[0.08em] text-subtext" aria-hidden="true">
                  桥
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
