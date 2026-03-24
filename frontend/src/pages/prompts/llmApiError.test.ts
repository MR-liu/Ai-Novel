import { describe, expect, it } from "vitest";

import { ApiError } from "../../services/apiClient";
import { formatLlmModelListError, formatLlmTestApiError } from "./llmApiError";

describe("prompts/llmApiError", () => {
  it("explains missing key errors with the saved-key contract", () => {
    const err = new ApiError({
      code: "LLM_KEY_MISSING",
      message: "missing",
      requestId: "req-1",
      status: 400,
    });
    expect(formatLlmTestApiError(err)).toBe("这份连接档案还没有保存访问密钥，先保存后再做连接检查");
  });

  it("extracts upstream bad-request detail and compat adjustments", () => {
    const err = new ApiError({
      code: "LLM_BAD_REQUEST",
      message: "bad request",
      requestId: "req-2",
      status: 400,
      details: {
        upstream_error: JSON.stringify({
          error: {
            message: "unsupported response_format",
          },
        }),
        compat_adjustments: ["lowered max_tokens", "removed top_p"],
      },
    });
    expect(formatLlmTestApiError(err)).toBe(
      "这次连接检查没有发出去，通常是模型名、参数或兼容设置还不合适（服务返回：unsupported response_format）（已自动调整：lowered max_tokens、removed top_p）",
    );
  });

  it("surfaces upstream status codes for transient service failures", () => {
    const err = new ApiError({
      code: "LLM_UPSTREAM_ERROR",
      message: "upstream error",
      requestId: "req-3",
      status: 502,
      details: {
        status_code: 503,
      },
    });
    expect(formatLlmTestApiError(err)).toBe("模型服务暂时不可用，稍后再试即可（503）");
  });

  it("formats model list refresh failures with author-facing language", () => {
    const err = new ApiError({
      code: "LLM_TIMEOUT",
      message: "timeout",
      requestId: "req-4",
      status: 504,
    });
    expect(formatLlmModelListError(err)).toBe("模型服务响应较慢，暂时没拿到候选模型");
  });
});
