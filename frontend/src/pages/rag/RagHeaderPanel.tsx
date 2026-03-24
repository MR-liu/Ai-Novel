import { Link } from "react-router-dom";

import { buildStudioAiPath } from "../../lib/projectRoutes";
import { UI_COPY } from "../../lib/uiCopy";
import { formatIndexStateLabel, formatRagDisabledReason } from "../../lib/vectorRagCopy";
import { formatIsoToLocal } from "./utils";

export function RagHeaderPanel(props: {
  projectId: string | undefined;
  statusLoading: boolean;
  ingestLoading: boolean;
  rebuildLoading: boolean;
  vectorIndexDirty: boolean | null;
  lastVectorBuildAt: string | null;
  vectorEnabled: boolean | null;
  vectorDisabledReason: string | null;
  runStatus: () => Promise<void>;
  runIngest: () => Promise<void>;
  runRebuild: () => Promise<void>;
}) {
  const {
    ingestLoading,
    lastVectorBuildAt,
    projectId,
    rebuildLoading,
    runIngest,
    runRebuild,
    runStatus,
    statusLoading,
    vectorDisabledReason,
    vectorEnabled,
    vectorIndexDirty,
  } = props;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-content text-2xl text-ink">{UI_COPY.rag.title}</div>
          <div className="mt-1 text-xs text-subtext">{UI_COPY.rag.subtitle}</div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            disabled={statusLoading}
            onClick={() => void runStatus()}
            aria-label="刷新状态 (rag_refresh_status)"
            type="button"
          >
            {statusLoading ? "加载中…" : "刷新状态"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={ingestLoading}
            onClick={() => void runIngest()}
            aria-label={`${UI_COPY.rag.ingest} (rag_ingest)`}
            type="button"
          >
            {ingestLoading ? "执行中…" : UI_COPY.rag.ingest}
          </button>
          <button
            className={vectorIndexDirty ? "btn btn-primary" : "btn btn-secondary"}
            disabled={rebuildLoading}
            onClick={() => void runRebuild()}
            aria-label={`${UI_COPY.rag.rebuild} (rag_rebuild)`}
            type="button"
          >
            {rebuildLoading
              ? "执行中…"
              : vectorIndexDirty && vectorEnabled === false
                ? UI_COPY.rag.rebuildNeedConfig
                : vectorIndexDirty
                  ? UI_COPY.rag.rebuildRecommended
                  : UI_COPY.rag.rebuild}
          </button>
          {projectId ? (
            <Link
              className="btn btn-secondary"
              to={`${buildStudioAiPath(projectId, "models")}#rag-config`}
              aria-label={`${UI_COPY.rag.settings} (rag_settings)`}
            >
              {UI_COPY.rag.settings}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-atelier border border-border bg-canvas p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-subtext">
            索引状态：{formatIndexStateLabel(vectorIndexDirty)} | 上次更新：{lastVectorBuildAt ?? "-"}
            {lastVectorBuildAt ? `（${formatIsoToLocal(lastVectorBuildAt)}）` : ""}
          </div>
          {vectorIndexDirty === null ? (
            <div className="text-subtext">索引状态加载中…</div>
          ) : vectorIndexDirty ? (
            vectorEnabled === false ? (
              <div className="text-ink">
                索引需要更新，但资料召回服务还不可用（原因：{formatRagDisabledReason(vectorDisabledReason)}）。请先打开
                {UI_COPY.rag.settings}，确认召回服务可用后再 {UI_COPY.rag.rebuild}。
              </div>
            ) : (
              <div className="text-ink">索引需要更新：建议点击右上角“{UI_COPY.rag.rebuildRecommended}”同步最新资料。</div>
            )
          ) : (
            <div className="text-subtext">索引已经是最新状态，当前无需重建。</div>
          )}
        </div>
      </div>
    </>
  );
}
