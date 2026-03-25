import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "../types";
import { invalidateProjectListCache, loadProjectList, readProjectListCache, upsertProjectListCache } from "./projectListCache";

const apiJsonMock = vi.hoisted(() => vi.fn());

vi.mock("./apiClient", () => ({
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
}));

function createProject(id: string, name = id): Project {
  return {
    id,
    owner_user_id: "u1",
    name,
    genre: null,
    logline: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    active_outline_id: null,
    llm_profile_id: null,
  };
}

describe("projectListCache", () => {
  beforeEach(() => {
    invalidateProjectListCache();
    apiJsonMock.mockReset();
  });

  it("caches loaded projects and reuses the cached list", async () => {
    apiJsonMock.mockResolvedValueOnce({
      ok: true,
      data: { projects: [createProject("p1", "项目一")] },
      request_id: "req-1",
    });

    const first = await loadProjectList();
    const second = await loadProjectList();

    expect(first).toHaveLength(1);
    expect(second[0]?.name).toBe("项目一");
    expect(apiJsonMock).toHaveBeenCalledTimes(1);
    expect(readProjectListCache()?.[0]?.id).toBe("p1");
  });

  it("updates an existing cached project in place", async () => {
    apiJsonMock.mockResolvedValueOnce({
      ok: true,
      data: { projects: [createProject("p1", "旧名字")] },
      request_id: "req-1",
    });

    await loadProjectList();
    upsertProjectListCache(createProject("p1", "新名字"));

    expect(readProjectListCache()?.[0]?.name).toBe("新名字");
  });
});
