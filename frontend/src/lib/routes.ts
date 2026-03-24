import { UI_COPY } from "./uiCopy";

export type RouteLayout = "landing" | "author" | "manuscript" | "studio";

type RouteMetaRule = {
  match: (pathname: string) => boolean;
  title: string;
  layout: RouteLayout;
};

const ROUTE_META_RULES: RouteMetaRule[] = [
  { match: (pathname) => pathname === "/admin/users", title: UI_COPY.nav.adminUsers, layout: "studio" },
  { match: (pathname) => pathname === "/projects/import", title: UI_COPY.nav.projectImport, layout: "author" },
  {
    match: (pathname) => /^\/projects\/[^/]+\/home(?:\/(?:overview|setup|settings))?$/.test(pathname),
    title: UI_COPY.nav.projectHome,
    layout: "author",
  },
  {
    match: (pathname) =>
      /^\/projects\/[^/]+\/story-bible(?:\/(?:overview|characters|world|glossary|continuity|tables))?$/.test(pathname),
    title: UI_COPY.nav.storyBible,
    layout: "author",
  },
  { match: (pathname) => /^\/projects\/[^/]+\/outline$/.test(pathname), title: UI_COPY.nav.outline, layout: "author" },
  { match: (pathname) => /^\/projects\/[^/]+\/write$/.test(pathname), title: UI_COPY.nav.write, layout: "manuscript" },
  {
    match: (pathname) => /^\/projects\/[^/]+\/review(?:\/(?:preview|reader|analysis|foreshadows))?$/.test(pathname),
    title: UI_COPY.nav.review,
    layout: "author",
  },
  { match: (pathname) => /^\/projects\/[^/]+\/publish$/.test(pathname), title: UI_COPY.nav.publish, layout: "author" },
  {
    match: (pathname) => /^\/projects\/[^/]+\/studio\/ai(?:\/(?:models|prompts|prompt-studio|templates|styles))?$/.test(pathname),
    title: UI_COPY.nav.aiStudio,
    layout: "studio",
  },
  {
    match: (pathname) =>
      /^\/projects\/[^/]+\/studio\/research(?:\/(?:import-docs|knowledge-base|search|graph))?$/.test(pathname),
    title: UI_COPY.nav.researchDesk,
    layout: "studio",
  },
  {
    match: (pathname) => /^\/projects\/[^/]+\/studio\/system(?:\/(?:tasks|structured-memory|fractal))?$/.test(pathname),
    title: UI_COPY.nav.systemHub,
    layout: "studio",
  },
  { match: (pathname) => pathname.endsWith("/wizard"), title: UI_COPY.nav.wizard, layout: "author" },
  { match: (pathname) => pathname.endsWith("/settings"), title: UI_COPY.nav.projectSettings, layout: "author" },
  { match: (pathname) => pathname.endsWith("/characters"), title: UI_COPY.nav.characters, layout: "author" },
  { match: (pathname) => pathname.endsWith("/writing"), title: UI_COPY.nav.writing, layout: "manuscript" },
  { match: (pathname) => pathname.endsWith("/tasks"), title: UI_COPY.nav.tasks, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/structured-memory"), title: UI_COPY.nav.structuredMemory, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/numeric-tables"), title: UI_COPY.nav.numericTables, layout: "author" },
  { match: (pathname) => pathname.endsWith("/foreshadows"), title: UI_COPY.nav.foreshadows, layout: "author" },
  { match: (pathname) => pathname.endsWith("/chapter-analysis"), title: UI_COPY.nav.chapterAnalysis, layout: "author" },
  { match: (pathname) => pathname.endsWith("/preview"), title: UI_COPY.nav.preview, layout: "author" },
  { match: (pathname) => pathname.endsWith("/reader"), title: UI_COPY.nav.reader, layout: "author" },
  { match: (pathname) => pathname.endsWith("/export"), title: UI_COPY.nav.export, layout: "author" },
  { match: (pathname) => pathname.endsWith("/worldbook"), title: UI_COPY.nav.worldBook, layout: "author" },
  { match: (pathname) => pathname.endsWith("/rag"), title: UI_COPY.nav.rag, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/search"), title: UI_COPY.nav.search, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/graph"), title: UI_COPY.nav.graph, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/fractal"), title: UI_COPY.nav.fractal, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/styles"), title: UI_COPY.nav.styles, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/prompts"), title: UI_COPY.nav.prompts, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/prompt-studio"), title: UI_COPY.nav.promptStudio, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/prompt-templates"), title: UI_COPY.nav.promptTemplates, layout: "studio" },
  { match: (pathname) => pathname.endsWith("/import"), title: UI_COPY.nav.dataImport, layout: "studio" },
];

export function resolveRouteMeta(pathname: string): { title: string; layout: RouteLayout } {
  if (pathname === "/") return { title: UI_COPY.nav.home, layout: "landing" };
  const match = ROUTE_META_RULES.find((it) => it.match(pathname));
  return match ? { title: match.title, layout: match.layout } : { title: UI_COPY.brand.appName, layout: "studio" };
}
