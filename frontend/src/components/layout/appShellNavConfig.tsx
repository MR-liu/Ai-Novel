import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  Bot,
  FileOutput,
  Files,
  Home,
  PenLine,
  ScanSearch,
  ScrollText,
  Settings2,
} from "lucide-react";

import type { AppMode } from "../../contexts/AppModeContext";
import { UI_COPY } from "../../lib/uiCopy";
import {
  buildProjectHomePath,
  buildProjectOutlinePath,
  buildProjectPublishPath,
  buildProjectReviewPath,
  buildProjectWritePath,
  buildStoryBiblePath,
  buildStudioAiPath,
  buildStudioResearchPath,
  buildStudioSystemPath,
} from "../../lib/projectRoutes";

export type AppShellProjectNavSection = "core" | "studio";

export type AppShellProjectNavItem = {
  id: string;
  section: AppShellProjectNavSection;
  icon: LucideIcon;
  label: string;
  ariaLabel: string;
  to: (projectId: string) => string;
};

export const APP_SHELL_PROJECT_NAV_SECTION_TITLES: Record<AppShellProjectNavSection, string> = {
  core: UI_COPY.nav.groupCoreFlow,
  studio: UI_COPY.nav.groupStudio,
};

export const APP_SHELL_FOCUS_NAV_SECTIONS: AppShellProjectNavSection[] = ["core"];
export const APP_SHELL_STUDIO_NAV_SECTIONS: AppShellProjectNavSection[] = ["core", "studio"];

export const APP_SHELL_PROJECT_NAV_ITEMS: ReadonlyArray<AppShellProjectNavItem> = [
  {
    id: "projectHome",
    section: "core",
    icon: Home,
    label: UI_COPY.nav.projectHome,
    ariaLabel: "项目主页 (nav_project_home)",
    to: (projectId) => buildProjectHomePath(projectId),
  },
  {
    id: "storyBible",
    section: "core",
    icon: BookMarked,
    label: UI_COPY.nav.storyBible,
    ariaLabel: "故事资料 (nav_story_bible)",
    to: (projectId) => buildStoryBiblePath(projectId),
  },
  {
    id: "outline",
    section: "core",
    icon: ScrollText,
    label: UI_COPY.nav.outline,
    ariaLabel: "大纲 (nav_outline)",
    to: (projectId) => buildProjectOutlinePath(projectId),
  },
  {
    id: "write",
    section: "core",
    icon: PenLine,
    label: UI_COPY.nav.write,
    ariaLabel: "写作 (nav_write)",
    to: (projectId) => buildProjectWritePath(projectId),
  },
  {
    id: "review",
    section: "core",
    icon: Files,
    label: UI_COPY.nav.review,
    ariaLabel: "校对 (nav_review)",
    to: (projectId) => buildProjectReviewPath(projectId),
  },
  {
    id: "publish",
    section: "core",
    icon: FileOutput,
    label: UI_COPY.nav.publish,
    ariaLabel: "发布 (nav_publish)",
    to: (projectId) => buildProjectPublishPath(projectId),
  },
  {
    id: "aiStudio",
    section: "studio",
    icon: Bot,
    label: UI_COPY.nav.aiStudio,
    ariaLabel: "AI 工作室 (nav_ai_studio)",
    to: (projectId) => buildStudioAiPath(projectId),
  },
  {
    id: "researchDesk",
    section: "studio",
    icon: ScanSearch,
    label: UI_COPY.nav.researchDesk,
    ariaLabel: "资料检索 (nav_research_desk)",
    to: (projectId) => buildStudioResearchPath(projectId),
  },
  {
    id: "systemHub",
    section: "studio",
    icon: Settings2,
    label: UI_COPY.nav.systemHub,
    ariaLabel: "系统与任务 (nav_system_hub)",
    to: (projectId) => buildStudioSystemPath(projectId),
  },
];

export function getAppShellProjectNavSections(mode: AppMode): AppShellProjectNavSection[] {
  return mode === "studio" ? [...APP_SHELL_STUDIO_NAV_SECTIONS] : [...APP_SHELL_FOCUS_NAV_SECTIONS];
}

export function getAppShellProjectNavItems(section: AppShellProjectNavSection): AppShellProjectNavItem[] {
  return APP_SHELL_PROJECT_NAV_ITEMS.filter((item) => item.section === section);
}
