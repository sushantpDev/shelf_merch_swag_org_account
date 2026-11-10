import { CopilotIcon } from "./CopilotIcon";
import { useLocation, useNavigate } from "react-router";
import { tenantPath } from "@/lib/workspaceSlug";
import { useCopilotStatus } from "./useCopilotStatus";
import "./copilot.css";

export function CopilotLauncher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useCopilotStatus();

  if (!data?.enabled || /\/copilot\/?$/.test(location.pathname)) return null;

  return (
    <button
      type="button"
      className="sm-copilot-launcher"
      aria-label="Open ShelfMerch AI Copilot"
      onClick={() =>
        navigate(tenantPath("/copilot"), {
          state: { copilotReturnTo: `${location.pathname}${location.search}${location.hash}` },
        })
      }
    >
      <CopilotIcon size={48} />
      <span className="sm-copilot-launcher__tooltip" aria-hidden="true">
        Ask ShelfMerch Copilot
      </span>
    </button>
  );
}
