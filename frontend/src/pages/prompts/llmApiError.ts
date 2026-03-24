import { ApiError } from "../../services/apiClient";

function extractErrorDetails(err: ApiError) {
  const details =
    err.details && typeof err.details === "object" && err.details !== null
      ? (err.details as Record<string, unknown>)
      : null;
  const upstreamStatusCode = details && "status_code" in details ? details.status_code : undefined;
  const upstreamErrorRaw = details && "upstream_error" in details ? details.upstream_error : undefined;
  const upstreamError = (() => {
    if (!upstreamErrorRaw) return null;
    if (typeof upstreamErrorRaw === "string") {
      const s = upstreamErrorRaw.trim();
      if (!s) return null;
      try {
        const parsed = JSON.parse(s) as unknown;
        if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail.trim();
          if (obj.error && typeof obj.error === "object") {
            const errObj = obj.error as Record<string, unknown>;
            if (typeof errObj.message === "string" && errObj.message.trim()) return errObj.message.trim();
          }
        }
      } catch {
        // ignore nested parse errors
      }
      return s.length > 160 ? `${s.slice(0, 160)}…` : s;
    }
    return String(upstreamErrorRaw);
  })();
  const compatAdjustments =
    details && "compat_adjustments" in details && Array.isArray(details.compat_adjustments)
      ? (details.compat_adjustments as unknown[])
          .filter((x) => typeof x === "string" && x)
          .slice(0, 6)
          .join("、")
      : null;

  return {
    compatAdjustments,
    details,
    upstreamError,
    upstreamStatusCode,
  };
}

export function formatLlmTestApiError(err: ApiError): string {
  const { compatAdjustments, upstreamError, upstreamStatusCode } = extractErrorDetails(err);
  return err.code === "LLM_KEY_MISSING"
    ? "这份连接档案还没有保存访问密钥，先保存后再做连接检查"
    : err.code === "LLM_AUTH_ERROR"
      ? "这份访问密钥没有通过验证，请检查是否填写了正确且仍有效的密钥"
      : err.code === "LLM_TIMEOUT"
        ? "模型服务暂时没有回应，请检查网络或服务地址后再试"
        : err.code === "LLM_BAD_REQUEST"
          ? `这次连接检查没有发出去，通常是模型名、参数或兼容设置还不合适${
              upstreamError ? `（服务返回：${upstreamError}）` : ""
            }${
              compatAdjustments ? `（已自动调整：${compatAdjustments}）` : ""
            }`
          : err.code === "LLM_UPSTREAM_ERROR"
            ? `模型服务暂时不可用，稍后再试即可（${
                typeof upstreamStatusCode === "number" ? upstreamStatusCode : err.status
              }）`
            : `连接检查未完成：${err.message}`;
}

export function formatLlmModelListError(err: ApiError): string {
  const { upstreamStatusCode } = extractErrorDetails(err);

  return err.code === "LLM_KEY_MISSING"
    ? "当前连接档案还没有保存访问密钥，暂时无法刷新候选模型"
    : err.code === "LLM_AUTH_ERROR"
      ? "当前访问密钥没有通过验证，暂时无法刷新候选模型"
      : err.code === "LLM_TIMEOUT"
        ? "模型服务响应较慢，暂时没拿到候选模型"
        : err.code === "LLM_UPSTREAM_ERROR"
          ? `模型服务暂时不可用，暂时没拿到候选模型（${
              typeof upstreamStatusCode === "number" ? upstreamStatusCode : err.status
            }）`
          : `暂时没拿到候选模型：${err.message}`;
}
