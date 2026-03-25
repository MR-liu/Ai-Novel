import { Suspense, lazy } from "react";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { AuthGuard } from "./components/layout/AuthGuard";
import { ProjectProviderGuard } from "./components/layout/ProjectProviderGuard";
import { AppShell } from "./components/layout/AppShell";
import { ConfirmProvider } from "./components/ui/ConfirmProvider";
import { ToastProvider } from "./components/ui/ToastProvider";
import { AppModeProvider } from "./contexts/AppModeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { CurrentProjectProvider } from "./contexts/CurrentProjectContext";
import { importWithChunkRetry } from "./lib/lazyImportRetry";
import { LEGACY_PROJECT_REDIRECTS } from "./lib/legacyProjectRedirects";
import { buildProjectHomePath } from "./lib/projectRoutes";
import { LegacyProjectRouteRedirect } from "./pages/LegacyProjectRouteRedirect";
import { RouteErrorPage } from "./pages/RouteErrorPage";

const LoginPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/LoginPage"));
  return { default: mod.LoginPage };
});

const RegisterPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/RegisterPage"));
  return { default: mod.RegisterPage };
});

const DashboardRoute = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/DashboardRoute"));
  return { default: mod.DashboardRoute };
});

const AdminUsersPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/AdminUsersPage"));
  return { default: mod.AdminUsersPage };
});

const GlobalProjectImportPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/GlobalProjectImportPage"));
  return { default: mod.GlobalProjectImportPage };
});

const ProjectHomePage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/ProjectHomePage"));
  return { default: mod.ProjectHomePage };
});

const StoryBiblePage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/StoryBiblePage"));
  return { default: mod.StoryBiblePage };
});

const OutlinePage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/OutlinePage"));
  return { default: mod.OutlinePage };
});

const WritingPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/WritingPage"));
  return { default: mod.WritingPage };
});

const ReviewPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/ReviewPage"));
  return { default: mod.ReviewPage };
});

const ExportPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/ExportPage"));
  return { default: mod.ExportPage };
});

const StudioAiPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/StudioAiPage"));
  return { default: mod.StudioAiPage };
});

const StudioResearchPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/StudioResearchPage"));
  return { default: mod.StudioResearchPage };
});

const StudioSystemPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/StudioSystemPage"));
  return { default: mod.StudioSystemPage };
});

const NotFoundPage = lazy(async () => {
  const mod = await importWithChunkRetry(() => import("./pages/NotFoundPage"));
  return { default: mod.NotFoundPage };
});

const legacyProjectRouteChildren = LEGACY_PROJECT_REDIRECTS.map((item) => ({
  path: item.path,
  element: <LegacyProjectRouteRedirect resolveTo={item.resolveTo} />,
}));

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: "/register",
    element: <RegisterPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    element: <AuthGuard />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: "/",
        element: (
          <AppModeProvider>
            <CurrentProjectProvider>
              <AppShell />
            </CurrentProjectProvider>
          </AppModeProvider>
        ),
        errorElement: <RouteErrorPage />,
        children: [
          {
            index: true,
            element: <DashboardRoute />,
          },
          {
            path: "admin/users",
            element: <AdminUsersPage />,
          },
          {
            path: "projects/import",
            element: <GlobalProjectImportPage />,
          },
          {
            path: "projects/:projectId",
            element: <ProjectProviderGuard />,
            children: [
              {
                index: true,
                element: <LegacyProjectRouteRedirect resolveTo={(projectId) => buildProjectHomePath(projectId)} />,
              },
              {
                path: "home",
                element: <Navigate replace to="overview" />,
              },
              {
                path: "home/:tab",
                element: <ProjectHomePage />,
              },
              {
                path: "story-bible",
                element: <Navigate replace to="overview" />,
              },
              {
                path: "story-bible/:tab",
                element: <StoryBiblePage />,
              },
              {
                path: "outline",
                element: <OutlinePage />,
              },
              {
                path: "write",
                element: <WritingPage />,
              },
              {
                path: "review",
                element: <Navigate replace to="preview" />,
              },
              {
                path: "review/:tab",
                element: <ReviewPage />,
              },
              {
                path: "publish",
                element: <ExportPage />,
              },
              {
                path: "studio/ai",
                element: <Navigate replace to="models" />,
              },
              {
                path: "studio/ai/:tab",
                element: <StudioAiPage />,
              },
              {
                path: "studio/research",
                element: <Navigate replace to="import-docs" />,
              },
              {
                path: "studio/research/:tab",
                element: <StudioResearchPage />,
              },
              {
                path: "studio/system",
                element: <Navigate replace to="tasks" />,
              },
              {
                path: "studio/system/:tab",
                element: <StudioSystemPage />,
              },
              ...legacyProjectRouteChildren,
            ],
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <Suspense fallback={<div className="p-4 text-sm text-subtext">加载中…</div>}>
            <RouterProvider router={router} />
          </Suspense>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
