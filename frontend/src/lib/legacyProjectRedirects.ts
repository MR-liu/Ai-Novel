import {
  buildProjectHomePath,
  buildProjectPublishPath,
  buildProjectReviewPath,
  buildProjectWritePath,
  buildStoryBiblePath,
  buildStudioAiPath,
  buildStudioResearchPath,
  buildStudioSystemPath,
} from "./projectRoutes";

export type LegacyProjectRedirect = {
  path: string;
  resolveTo: (projectId: string) => string;
};

export const LEGACY_PROJECT_REDIRECTS: ReadonlyArray<LegacyProjectRedirect> = [
  { path: "wizard", resolveTo: (projectId) => buildProjectHomePath(projectId, "setup") },
  { path: "settings", resolveTo: (projectId) => buildProjectHomePath(projectId, "settings") },
  { path: "characters", resolveTo: (projectId) => buildStoryBiblePath(projectId, "characters") },
  { path: "worldbook", resolveTo: (projectId) => buildStoryBiblePath(projectId, "world") },
  { path: "glossary", resolveTo: (projectId) => buildStoryBiblePath(projectId, "glossary") },
  { path: "numeric-tables", resolveTo: (projectId) => buildStoryBiblePath(projectId, "tables") },
  { path: "writing", resolveTo: (projectId) => buildProjectWritePath(projectId) },
  { path: "preview", resolveTo: (projectId) => buildProjectReviewPath(projectId, "preview") },
  { path: "reader", resolveTo: (projectId) => buildProjectReviewPath(projectId, "reader") },
  { path: "chapter-analysis", resolveTo: (projectId) => buildProjectReviewPath(projectId, "analysis") },
  { path: "foreshadows", resolveTo: (projectId) => buildProjectReviewPath(projectId, "foreshadows") },
  { path: "export", resolveTo: (projectId) => buildProjectPublishPath(projectId) },
  { path: "prompts", resolveTo: (projectId) => buildStudioAiPath(projectId, "models") },
  { path: "prompt-studio", resolveTo: (projectId) => buildStudioAiPath(projectId, "prompt-studio") },
  { path: "prompt-templates", resolveTo: (projectId) => buildStudioAiPath(projectId, "templates") },
  { path: "styles", resolveTo: (projectId) => buildStudioAiPath(projectId, "styles") },
  { path: "rag", resolveTo: (projectId) => buildStudioResearchPath(projectId, "knowledge-base") },
  { path: "search", resolveTo: (projectId) => buildStudioResearchPath(projectId, "search") },
  { path: "graph", resolveTo: (projectId) => buildStudioResearchPath(projectId, "graph") },
  { path: "import", resolveTo: (projectId) => buildStudioResearchPath(projectId, "import-docs") },
  { path: "tasks", resolveTo: (projectId) => buildStudioSystemPath(projectId, "tasks") },
  { path: "structured-memory", resolveTo: (projectId) => buildStudioSystemPath(projectId, "structured-memory") },
  { path: "fractal", resolveTo: (projectId) => buildStudioSystemPath(projectId, "fractal") },
];
