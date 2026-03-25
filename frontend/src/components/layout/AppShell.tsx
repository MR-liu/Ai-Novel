import clsx from "clsx";
import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleHelp, LayoutDashboard, PanelLeftClose, PanelLeftOpen, UserCog } from "lucide-react";
import { NavLink, useLocation, useNavigate, useOutlet, useParams } from "react-router-dom";

import { useAppMode } from "../../contexts/AppModeContext";
import { useAuth } from "../../contexts/auth";
import { PersistentOutletProvider } from "../../hooks/PersistentOutletProvider";
import { importWithChunkRetry } from "../../lib/lazyImportRetry";
import type { RouteLayout } from "../../lib/routes";
import { resolveRouteMeta } from "../../lib/routes";
import { UI_COPY } from "../../lib/uiCopy";
import { getCurrentUserId } from "../../services/currentUser";
import { sidebarCollapsedStorageKey } from "../../services/uiState";
import { ThemeToggle } from "../atelier/ThemeToggle";
import {
  APP_SHELL_PROJECT_NAV_SECTION_TITLES,
  getAppShellProjectNavItems,
  getAppShellProjectNavSections,
  type AppShellProjectNavSection,
} from "./appShellNavConfig";

const LazyAppShellHelpDrawer = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./AppShellHelpDrawer"));
  return { default: mod.AppShellHelpDrawer };
});

const LazyProjectSwitcher = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("../atelier/ProjectSwitcher"));
  return { default: mod.ProjectSwitcher };
});

const LazyModeSelectionPanel = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./AuthorPageScaffold"));
  return { default: mod.ModeSelectionPanel };
});

function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const storageKey = sidebarCollapsedStorageKey(getCurrentUserId());
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(storageKey) === "1");
  return [
    collapsed,
    (v) => {
      setCollapsed(v);
      localStorage.setItem(storageKey, v ? "1" : "0");
    },
  ];
}

function SidebarLink(props: {
  to: string;
  icon: React.ReactNode;
  label: string;
  ariaLabel?: string;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      className={({ isActive }) =>
        clsx(
          "ui-focus-ring ui-transition-fast group relative flex w-full items-center overflow-hidden rounded-atelier py-2 text-sm no-underline hover:no-underline",
          props.collapsed ? "justify-center px-0" : "justify-start gap-3 px-3",
          isActive
            ? "border border-accent/20 bg-canvas/92 text-ink shadow-sm"
            : "text-subtext hover:bg-canvas/80 hover:text-ink",
        )
      }
      to={props.to}
      aria-label={props.ariaLabel ?? props.label}
      title={props.collapsed ? props.label : undefined}
      onClick={props.onClick}
    >
      <span className="relative z-10 shrink-0">{props.icon}</span>
      {props.collapsed ? null : <span className="relative z-10 min-w-0 truncate">{props.label}</span>}
    </NavLink>
  );
}

function SidebarButton(props: {
  icon: React.ReactNode;
  label: string;
  ariaLabel?: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        "ui-focus-ring ui-transition-fast group relative flex w-full items-center overflow-hidden rounded-atelier py-2 text-sm hover:bg-canvas/80",
        props.collapsed ? "justify-center px-0" : "justify-start gap-3 px-3",
      )}
      aria-label={props.ariaLabel ?? props.label}
      title={props.collapsed ? props.label : undefined}
      onClick={props.onClick}
      type="button"
    >
      <span className="relative z-10 shrink-0">{props.icon}</span>
      {props.collapsed ? null : <span className="relative z-10 min-w-0 truncate">{props.label}</span>}
    </button>
  );
}

function ProjectNavGroupTitle(props: { label: string; collapsed: boolean; className?: string }) {
  if (props.collapsed) return null;
  return (
    <div className={clsx("px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-subtext", props.className)}>
      {props.label}
    </div>
  );
}

function renderProjectNavItems(props: {
  section: AppShellProjectNavSection;
  projectId: string;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return getAppShellProjectNavItems(props.section).map((item) => {
    const Icon = item.icon;
    return (
      <SidebarLink
        key={item.id}
        collapsed={props.collapsed}
        icon={<Icon size={18} />}
        label={item.label}
        ariaLabel={item.ariaLabel}
        to={item.to(props.projectId)}
        onClick={props.onClick}
      />
    );
  });
}

const PERSISTENT_OUTLET_CACHE_MAX_ENTRIES = 3;
const PERSISTENT_OUTLET_CACHE_WHITELIST: RegExp[] = [/^\/projects\/[^/]+\/write$/];

function isPersistentOutletCacheable(pathname: string): boolean {
  return PERSISTENT_OUTLET_CACHE_WHITELIST.some((pattern) => pattern.test(pathname));
}

type PersistentOutletCacheState = {
  elementsByKey: Map<string, React.ReactNode>;
  lruKeys: string[];
};

function PersistentOutlet(props: { activeKey: string }) {
  const outlet = useOutlet();
  const activeIsCacheable = isPersistentOutletCacheable(props.activeKey);
  const [cacheState, setCacheState] = useState<PersistentOutletCacheState>(() => ({
    elementsByKey: activeIsCacheable ? new Map([[props.activeKey, outlet]]) : new Map(),
    lruKeys: activeIsCacheable ? [props.activeKey] : [],
  }));

  const cacheStateWithActive = useMemo(() => {
    if (!activeIsCacheable) return cacheState;

    let nextElementsByKey = cacheState.elementsByKey;
    let nextLruKeys = cacheState.lruKeys;

    if (!nextElementsByKey.has(props.activeKey)) {
      nextElementsByKey = new Map(nextElementsByKey);
      nextElementsByKey.set(props.activeKey, outlet);
    }

    if (nextLruKeys[nextLruKeys.length - 1] !== props.activeKey) {
      nextLruKeys = nextLruKeys.filter((key) => key !== props.activeKey);
      nextLruKeys.push(props.activeKey);
    }

    while (nextLruKeys.length > PERSISTENT_OUTLET_CACHE_MAX_ENTRIES) {
      const evictedKey = nextLruKeys[0];
      nextLruKeys = nextLruKeys.slice(1);
      if (nextElementsByKey.has(evictedKey)) {
        nextElementsByKey = new Map(nextElementsByKey);
        nextElementsByKey.delete(evictedKey);
      }
    }

    if (nextElementsByKey === cacheState.elementsByKey && nextLruKeys === cacheState.lruKeys) return cacheState;
    return { elementsByKey: nextElementsByKey, lruKeys: nextLruKeys };
  }, [activeIsCacheable, cacheState, outlet, props.activeKey]);

  useEffect(() => {
    if (cacheStateWithActive === cacheState) return;
    const id = window.setTimeout(() => setCacheState(cacheStateWithActive), 0);
    return () => window.clearTimeout(id);
  }, [cacheState, cacheStateWithActive]);

  return (
    <>
      {activeIsCacheable ? null : (
        <div key={props.activeKey}>
          <PersistentOutletProvider outletKey={props.activeKey} activeKey={props.activeKey}>
            {outlet}
          </PersistentOutletProvider>
        </div>
      )}
      {Array.from(cacheStateWithActive.elementsByKey.entries()).map(([key, element]) => (
        <div key={key} style={{ display: key === props.activeKey ? "block" : "none" }}>
          <PersistentOutletProvider outletKey={key} activeKey={props.activeKey}>
            {element}
          </PersistentOutletProvider>
        </div>
      ))}
    </>
  );
}

type ContentContainerProps = {
  children: ReactNode;
  className?: string;
};

function ProjectSwitcherFallback() {
  return (
    <div className="rounded-atelier border border-border bg-canvas/70 p-3 text-xs text-subtext">
      正在加载项目切换器…
    </div>
  );
}

function ModeSelectionPanelFallback() {
  return (
    <div className="mx-auto max-w-6xl rounded-atelier border border-border bg-canvas/70 p-6 text-sm text-subtext">
      正在加载模式选择面板…
    </div>
  );
}

export function PaperContent(props: ContentContainerProps) {
  return <div className={clsx("mx-auto w-full max-w-[var(--layout-author-max)]", props.className)}>{props.children}</div>;
}

export function ToolContent(props: ContentContainerProps) {
  return <div className={clsx("mx-auto w-full max-w-[var(--layout-studio-max)]", props.className)}>{props.children}</div>;
}

function ModeSwitch(props: { compact?: boolean }) {
  const { mode, selectionState, setMode } = useAppMode();
  if (selectionState === "unset") return null;

  return (
    <div
      className={clsx(
        "items-center gap-1 rounded-full border border-border bg-canvas/90 p-1",
        props.compact ? "flex" : "hidden md:flex",
      )}
    >
      <button
        className={clsx(
          "ui-focus-ring rounded-full px-3 py-1 text-xs",
          mode === "focus" ? "bg-accent/12 text-ink" : "text-subtext hover:text-ink",
        )}
        onClick={() => setMode("focus")}
        type="button"
      >
        {UI_COPY.nav.modeFocus}
      </button>
      <button
        className={clsx(
          "ui-focus-ring rounded-full px-3 py-1 text-xs",
          mode === "studio" ? "bg-accent/12 text-ink" : "text-subtext hover:text-ink",
        )}
        onClick={() => setMode("studio")}
        type="button"
      >
        {UI_COPY.nav.modeStudio}
      </button>
    </div>
  );
}

function getRouteContext(layout: RouteLayout): { label: string; copy: string } {
  switch (layout) {
    case "landing":
      return {
        label: "作者启动台",
        copy: "从最近项目、当前进度和下一步动作重新进入创作。",
      };
    case "manuscript":
      return {
        label: "主稿驾驶舱",
        copy: "主稿区优先，系统入口退后，保持连续写作节奏。",
      };
    case "studio":
      return {
        label: "研究面板",
        copy: "适合处理模型、资料、任务与底层系统能力。",
      };
    default:
      return {
        label: "作者工作台",
        copy: "用作者语言组织资料、审稿与项目状态。",
      };
  }
}

export function AppShell() {
  const auth = useAuth();
  const { mode, selectionState } = useAppMode();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [mobileNavOpenForPath, setMobileNavOpenForPath] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const { projectId } = useParams();
  const location = useLocation();

  const pathname = location.pathname;
  const routeMeta = useMemo(() => resolveRouteMeta(pathname), [pathname]);
  const title = selectionState === "unset" ? "选择创作方式" : routeMeta.title;
  const mainMaxWidth =
    routeMeta.layout === "landing"
      ? "max-w-[1280px]"
      : routeMeta.layout === "manuscript"
        ? "max-w-[var(--layout-manuscript-max)]"
        : routeMeta.layout === "studio"
          ? "max-w-[var(--layout-studio-max)]"
          : "max-w-[var(--layout-author-max)]";
  const sessionExpireAtText = auth.session?.expireAt ? new Date(auth.session.expireAt * 1000).toLocaleString() : null;
  const mobileNavOpen = mobileNavOpenForPath === pathname;
  const navSections = mode ? getAppShellProjectNavSections(mode) : [];
  const shellMode = mode ?? "focus";
  const shellModeTitle = shellMode === "studio" ? "工作室模式" : "专注模式";
  const shellModeSubtitle =
    shellMode === "studio" ? "面向复杂工程、检索与排障的研究台。" : "更像作者书桌，优先照顾主线写作。";
  const routeContext = getRouteContext(routeMeta.layout);
  const showRouteBadge = routeContext.label !== title;
  const accountText =
    auth.status === "authenticated"
      ? `${auth.user?.displayName ?? auth.user?.id ?? "user"} (${auth.user?.id ?? "unknown"})`
      : UI_COPY.auth.devFallbackTag;

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const collapseLabel = collapsed ? "展开侧边栏" : "收起侧边栏";

  const openMobileNav = () => setMobileNavOpenForPath(pathname);
  const closeMobileNav = () => setMobileNavOpenForPath(null);
  const openHelp = () => setHelpOpen(true);
  const closeHelp = () => setHelpOpen(false);

  return (
    <div className="app-shell min-h-screen bg-canvas text-ink" data-app-mode={shellMode} data-route-layout={routeMeta.layout}>
      <div className="flex">
        {mobileNavOpen ? (
          <div
            className="fixed inset-0 z-50 flex bg-black/30 lg:hidden"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeMobileNav();
            }}
            role="dialog"
            aria-modal="true"
            aria-label={UI_COPY.nav.navMenu}
          >
            <aside className="h-full w-[300px] shrink-0 overflow-x-hidden border-r border-border bg-[rgb(var(--color-sidebar-bg)/0.96)] p-4 shadow-2xl backdrop-blur-xl">
              <div className="panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-subtext">{shellModeTitle}</div>
                    <div className="mt-1 font-content text-lg text-ink">{UI_COPY.brand.appName}</div>
                    <div className="mt-1 text-xs leading-5 text-subtext">{shellModeSubtitle}</div>
                  </div>
                  <button
                    className="btn btn-secondary btn-icon"
                    onClick={closeMobileNav}
                    aria-label={UI_COPY.nav.closeNav}
                    title={UI_COPY.nav.closeNav}
                    type="button"
                  >
                    <PanelLeftClose size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-atelier border border-border bg-canvas/70 p-3 text-xs text-subtext">
                <div className="text-[11px] uppercase tracking-[0.16em]">{routeContext.label}</div>
                <div className="mt-2 leading-5">{routeContext.copy}</div>
              </div>

              <div className="mt-4">
                <Suspense fallback={<ProjectSwitcherFallback />}>
                  <LazyProjectSwitcher />
                </Suspense>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 rounded-atelier border border-border bg-canvas/80 p-2">
                <ModeSwitch compact />
                <ThemeToggle />
              </div>

              <nav className="mt-4 flex flex-col gap-1">
                <SidebarLink
                  collapsed={false}
                  icon={<LayoutDashboard size={18} />}
                  label={UI_COPY.nav.home}
                  ariaLabel="首页 (nav_home)"
                  to="/"
                  onClick={closeMobileNav}
                />
                <SidebarButton
                  collapsed={false}
                  icon={<CircleHelp size={18} />}
                  label={UI_COPY.nav.help}
                  ariaLabel="术语/帮助 (nav_help)"
                  onClick={() => {
                    closeMobileNav();
                    openHelp();
                  }}
                />
                <div className="my-2 h-px bg-border" />
                {projectId && selectionState !== "unset" ? (
                  navSections.map((section, index) => (
                    <div key={section}>
                      <ProjectNavGroupTitle
                        collapsed={false}
                        className={index === 0 ? undefined : "mt-2"}
                        label={APP_SHELL_PROJECT_NAV_SECTION_TITLES[section]}
                      />
                      {renderProjectNavItems({
                        section,
                        projectId,
                        collapsed: false,
                        onClick: closeMobileNav,
                      })}
                    </div>
                  ))
                ) : (
                  <div className="rounded-atelier border border-border bg-canvas p-3 text-xs text-subtext">
                    {selectionState === "unset" ? "请先选择模式，再进入项目导航。" : UI_COPY.nav.chooseProjectHint}
                  </div>
                )}
                <div className="my-2 h-px bg-border" />
                <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-subtext">
                  {UI_COPY.nav.groupAdmin}
                </div>
                <SidebarLink
                  collapsed={false}
                  icon={<UserCog size={18} />}
                  label={UI_COPY.nav.adminUsers}
                  ariaLabel="用户管理 (nav_admin_users)"
                  to="/admin/users"
                  onClick={closeMobileNav}
                />
              </nav>
            </aside>
          </div>
        ) : null}

        <aside
          className={clsx(
            "hidden min-h-screen shrink-0 overflow-x-hidden border-r border-border bg-[rgb(var(--color-sidebar-bg)/0.88)] backdrop-blur-xl motion-safe:transition-[width] motion-safe:duration-atelier motion-safe:ease-atelier lg:block",
            collapsed ? "w-[86px] p-3" : "w-[300px] p-5",
          )}
        >
          <div className={clsx("panel", collapsed ? "p-2" : "p-4")}>
            <div className={clsx("flex gap-2", collapsed ? "flex-col items-center" : "items-start justify-between")}>
              <div className={clsx(collapsed && "hidden")}>
                <div className="text-[11px] uppercase tracking-[0.2em] text-subtext">{shellModeTitle}</div>
                <div className="mt-1 font-content text-xl text-ink">{UI_COPY.brand.appName}</div>
                <div className="mt-2 text-xs leading-5 text-subtext">{shellModeSubtitle}</div>
              </div>
              <div className={clsx("flex gap-2", collapsed ? "flex-col items-center" : "items-center")}>
                <ThemeToggle />
                <button
                  className="btn btn-secondary btn-icon"
                  onClick={() => setCollapsed(!collapsed)}
                  aria-label={collapseLabel}
                  title={collapseLabel}
                  type="button"
                >
                  <CollapseIcon size={18} />
                </button>
              </div>
            </div>

            {collapsed ? null : (
              <div className="mt-4 rounded-atelier border border-border bg-canvas/75 p-3 text-xs text-subtext">
                <div className="text-[11px] uppercase tracking-[0.16em]">{routeContext.label}</div>
                <div className="mt-2 leading-5">{routeContext.copy}</div>
              </div>
            )}
          </div>

          <div className={clsx("mt-4", collapsed && "hidden")}>
            <Suspense fallback={<ProjectSwitcherFallback />}>
              <LazyProjectSwitcher />
            </Suspense>
          </div>

          <div className={clsx("mt-4", collapsed && "hidden")}>
            <ModeSwitch />
          </div>

          <nav className="mt-4 flex flex-col gap-1">
            <SidebarLink
              collapsed={collapsed}
              icon={<LayoutDashboard size={18} />}
              label={UI_COPY.nav.home}
              ariaLabel="首页 (nav_home)"
              to="/"
            />
            <SidebarButton
              collapsed={collapsed}
              icon={<CircleHelp size={18} />}
              label={UI_COPY.nav.help}
              ariaLabel="术语/帮助 (nav_help)"
              onClick={openHelp}
            />
            <div className="my-2 h-px bg-border" />
            {projectId && selectionState !== "unset" ? (
              navSections.map((section, index) => (
                <div key={section}>
                  <ProjectNavGroupTitle
                    collapsed={collapsed}
                    className={index === 0 ? undefined : "mt-2"}
                    label={APP_SHELL_PROJECT_NAV_SECTION_TITLES[section]}
                  />
                  {renderProjectNavItems({
                    section,
                    projectId,
                    collapsed,
                  })}
                </div>
              ))
            ) : (
              <div
                className={clsx(
                  "rounded-atelier border border-border bg-canvas p-3 text-xs text-subtext",
                  collapsed && "hidden",
                )}
              >
                {selectionState === "unset" ? "请先选择模式，再进入项目导航。" : UI_COPY.nav.chooseProjectHint}
              </div>
            )}
            <div className="my-2 h-px bg-border" />
            {collapsed ? null : (
              <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-subtext">
                {UI_COPY.nav.groupAdmin}
              </div>
            )}
            <SidebarLink
              collapsed={collapsed}
              icon={<UserCog size={18} />}
              label={UI_COPY.nav.adminUsers}
              ariaLabel="用户管理 (nav_admin_users)"
              to="/admin/users"
            />
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="border-b border-border/80 bg-canvas/70 backdrop-blur-xl">
            <div className={clsx("mx-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8", mainMaxWidth)}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      className="btn btn-secondary btn-icon lg:hidden"
                      onClick={openMobileNav}
                      aria-label={UI_COPY.nav.openNav}
                      title={UI_COPY.nav.openNav}
                      type="button"
                    >
                      <PanelLeftOpen size={18} />
                    </button>
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-subtext">{shellModeTitle}</div>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                        {showRouteBadge ? (
                          <span className="rounded-full border border-border bg-canvas/78 px-2.5 py-1 text-[11px] font-medium text-subtext">
                            {routeContext.label}
                          </span>
                        ) : null}
                        <h1 className="min-w-0 truncate font-content text-2xl text-ink sm:text-3xl">{title}</h1>
                      </div>
                      <div className="mt-2 max-w-2xl text-xs leading-6 text-subtext">{routeContext.copy}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 xl:items-end">
                  <div className="hidden rounded-atelier border border-border bg-canvas/72 px-3 py-2 text-right text-xs text-subtext sm:block">
                    <div className="truncate">{accountText}</div>
                    {auth.status === "authenticated" && sessionExpireAtText ? (
                      <div className="mt-1 truncate">
                        {UI_COPY.auth.sessionExpireAtPrefix}
                        {sessionExpireAtText}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <ModeSwitch />

                    {auth.status === "authenticated" ? (
                      <button
                        className="btn btn-secondary"
                        onClick={async () => {
                          await auth.logout();
                          navigate("/login", { replace: true });
                        }}
                        type="button"
                      >
                        {UI_COPY.auth.logout}
                      </button>
                    ) : (
                      <NavLink className="btn btn-secondary" to="/login">
                        {UI_COPY.auth.login}
                      </NavLink>
                    )}

                    <div className="lg:hidden">
                      <ThemeToggle />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>
          <div className={clsx("mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8", mainMaxWidth)}>
            {selectionState === "unset" ? (
              <Suspense fallback={<ModeSelectionPanelFallback />}>
                <LazyModeSelectionPanel />
              </Suspense>
            ) : (
              <PersistentOutlet activeKey={pathname} />
            )}
          </div>
        </main>
      </div>

      {helpOpen ? (
        <Suspense fallback={null}>
          <LazyAppShellHelpDrawer open={helpOpen} onClose={closeHelp} />
        </Suspense>
      ) : null}
    </div>
  );
}
