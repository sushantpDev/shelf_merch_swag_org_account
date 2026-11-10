import { Navigate, useParams } from "react-router";
import { ResourcesHrPage } from "./ResourcesHrPage";
import { ResourcesSalesPage } from "./ResourcesSalesPage";
import { ResourcesEventsPage } from "./ResourcesEventsPage";

export function ResourcesTeamPage() {
  const { team } = useParams();
  if (team === "human-resources") return <ResourcesHrPage />;
  if (team === "sales") return <ResourcesSalesPage />;
  if (team === "events") return <ResourcesEventsPage />;
  return <Navigate to="/resources" replace />;
}
