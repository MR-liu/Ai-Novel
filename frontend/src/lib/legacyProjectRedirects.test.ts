import { describe, expect, it } from "vitest";

import { LEGACY_PROJECT_REDIRECTS } from "./legacyProjectRedirects";

describe("legacyProjectRedirects", () => {
  it("keeps every legacy project route mapped to a canonical destination", () => {
    const projectId = "demo";
    const resolved = Object.fromEntries(
      LEGACY_PROJECT_REDIRECTS.map((item) => [item.path, item.resolveTo(projectId)]),
    );

    expect(resolved).toEqual({
      wizard: "/projects/demo/home/setup",
      settings: "/projects/demo/home/settings",
      characters: "/projects/demo/story-bible/characters",
      worldbook: "/projects/demo/story-bible/world",
      glossary: "/projects/demo/story-bible/glossary",
      "numeric-tables": "/projects/demo/story-bible/tables",
      writing: "/projects/demo/write",
      preview: "/projects/demo/review/preview",
      reader: "/projects/demo/review/reader",
      "chapter-analysis": "/projects/demo/review/analysis",
      foreshadows: "/projects/demo/review/foreshadows",
      export: "/projects/demo/publish",
      prompts: "/projects/demo/studio/ai/models",
      "prompt-studio": "/projects/demo/studio/ai/prompt-studio",
      "prompt-templates": "/projects/demo/studio/ai/templates",
      styles: "/projects/demo/studio/ai/styles",
      rag: "/projects/demo/studio/research/knowledge-base",
      search: "/projects/demo/studio/research/search",
      graph: "/projects/demo/studio/research/graph",
      import: "/projects/demo/studio/research/import-docs",
      tasks: "/projects/demo/studio/system/tasks",
      "structured-memory": "/projects/demo/studio/system/structured-memory",
      fractal: "/projects/demo/studio/system/fractal",
    });
  });
});
