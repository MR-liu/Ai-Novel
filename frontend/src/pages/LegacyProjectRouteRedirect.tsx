import { Navigate, useLocation, useParams } from "react-router-dom";

type LegacyProjectRouteRedirectProps = {
  resolveTo: (projectId: string) => string;
};

export function LegacyProjectRouteRedirect(props: LegacyProjectRouteRedirectProps) {
  const { projectId } = useParams();
  const location = useLocation();

  if (!projectId) return <Navigate replace to="/" />;

  return <Navigate replace to={`${props.resolveTo(projectId)}${location.search}${location.hash}`} />;
}
