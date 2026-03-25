import { ProjectsProvider } from "../contexts/ProjectsContext";

import { DashboardPage } from "./DashboardPage";

export function DashboardRoute() {
  return (
    <ProjectsProvider>
      <DashboardPage />
    </ProjectsProvider>
  );
}
