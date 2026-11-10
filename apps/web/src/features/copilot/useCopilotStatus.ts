import { useQuery } from "@tanstack/react-query";
import { fetchCopilotStatus } from "./api";

export const COPILOT_STATUS_KEY = ["copilot", "status"] as const;

export function useCopilotStatus() {
  return useQuery({
    queryKey: COPILOT_STATUS_KEY,
    queryFn: fetchCopilotStatus,
    staleTime: 60_000,
    retry: false,
  });
}
