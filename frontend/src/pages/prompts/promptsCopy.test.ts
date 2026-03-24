import { describe, expect, it } from "vitest";

import {
  buildClearTaskApiKeyConfirm,
  buildDeleteTaskModuleConfirm,
  buildMainConnectionSuccessToast,
  PROMPTS_COPY,
} from "./promptsCopy";

describe("promptsCopy", () => {
  it("keeps the prompts vector test-save hint stable", () => {
    expect(PROMPTS_COPY.vectorRag.saveBeforeTestHint).toContain("保存资料策略");
  });

  it("builds the delete-task confirmation with the task label", () => {
    expect(buildDeleteTaskModuleConfirm("章节生成").description).toContain("章节生成");
  });

  it("builds the shared-profile clear confirmation with the profile name", () => {
    expect(buildClearTaskApiKeyConfirm("shared-profile").description).toContain("shared-profile");
  });

  it("uses author-facing wording for task exceptions and default connection checks", () => {
    expect(buildDeleteTaskModuleConfirm("章节生成").title).toContain("任务例外");
    expect(buildMainConnectionSuccessToast(120, "")).toContain("默认连接检查通过");
  });
});
