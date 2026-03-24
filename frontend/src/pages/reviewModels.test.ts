import { describe, expect, it } from "vitest";

import { getReviewTrackSummary, REVIEW_TAB_COPY, REVIEW_TABS } from "./reviewModels";

describe("reviewModels", () => {
  it("keeps the review tab order stable", () => {
    expect(REVIEW_TABS).toEqual(["preview", "reader", "analysis", "foreshadows"]);
  });

  it("defines title and description for every review tab", () => {
    for (const tab of REVIEW_TABS) {
      expect(REVIEW_TAB_COPY[tab].title.length).toBeGreaterThan(0);
      expect(REVIEW_TAB_COPY[tab].text.length).toBeGreaterThan(0);
    }
  });

  it("returns task-oriented summaries for each review phase", () => {
    expect(getReviewTrackSummary("preview").focusValue).toBe("整体阅读感");
    expect(getReviewTrackSummary("reader").nextValue).toBe("写作或连续性");
    expect(getReviewTrackSummary("analysis").riskValue).toBe("不处理阅读节奏");
    expect(getReviewTrackSummary("foreshadows").focusValue).toBe("未闭环线索");
  });
});
