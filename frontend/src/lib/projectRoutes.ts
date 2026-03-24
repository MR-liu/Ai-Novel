export type ProjectHomeTab = "overview" | "setup" | "settings";
export type StoryBibleTab = "overview" | "characters" | "world" | "glossary" | "continuity" | "tables";
export type ReviewTab = "preview" | "reader" | "analysis" | "foreshadows";
export type StudioAiTab = "models" | "prompts" | "prompt-studio" | "templates" | "styles";
export type StudioResearchTab = "import-docs" | "knowledge-base" | "search" | "graph";
export type StudioSystemTab = "tasks" | "structured-memory" | "fractal";

export const DEFAULT_PROJECT_HOME_TAB: ProjectHomeTab = "overview";
export const DEFAULT_STORY_BIBLE_TAB: StoryBibleTab = "overview";
export const DEFAULT_REVIEW_TAB: ReviewTab = "preview";
export const DEFAULT_STUDIO_AI_TAB: StudioAiTab = "models";
export const DEFAULT_STUDIO_RESEARCH_TAB: StudioResearchTab = "import-docs";
export const DEFAULT_STUDIO_SYSTEM_TAB: StudioSystemTab = "tasks";

export function buildProjectHomePath(projectId: string, tab: ProjectHomeTab = DEFAULT_PROJECT_HOME_TAB): string {
  return `/projects/${projectId}/home/${tab}`;
}

export function buildStoryBiblePath(projectId: string, tab: StoryBibleTab = DEFAULT_STORY_BIBLE_TAB): string {
  return `/projects/${projectId}/story-bible/${tab}`;
}

export function buildProjectOutlinePath(projectId: string): string {
  return `/projects/${projectId}/outline`;
}

export function buildProjectWritePath(projectId: string): string {
  return `/projects/${projectId}/write`;
}

export function buildProjectReviewPath(projectId: string, tab: ReviewTab = DEFAULT_REVIEW_TAB): string {
  return `/projects/${projectId}/review/${tab}`;
}

export function buildProjectPublishPath(projectId: string): string {
  return `/projects/${projectId}/publish`;
}

export function buildStudioAiPath(projectId: string, tab: StudioAiTab = DEFAULT_STUDIO_AI_TAB): string {
  return `/projects/${projectId}/studio/ai/${tab}`;
}

export function buildStudioResearchPath(
  projectId: string,
  tab: StudioResearchTab = DEFAULT_STUDIO_RESEARCH_TAB,
): string {
  return `/projects/${projectId}/studio/research/${tab}`;
}

export function buildStudioSystemPath(projectId: string, tab: StudioSystemTab = DEFAULT_STUDIO_SYSTEM_TAB): string {
  return `/projects/${projectId}/studio/system/${tab}`;
}

export function buildGlobalProjectImportPath(): string {
  return "/projects/import";
}

