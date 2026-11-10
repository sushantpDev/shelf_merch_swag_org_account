import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMergeConnections,
  fetchMergeEmployees,
  type HrisDirectoryStatus,
  type MergeConnectionPublic,
  type MergeHrisEmployeePublic,
} from "@/services/merge-api";
import { resolveHrisDirectoryBanner } from "./hrisDirectoryBanner";

const ACTIVE_DIRECTORY_STATUSES = new Set(["connected", "needs_attention"]);

/** Merge connections plus direct providers such as Zoho People, counted once each. */
export function countConnectedDirectoryProviders(
  connections: Array<{ status?: string | null; provider?: string | null }>,
  employees: Array<{ connectionStatus?: string | null; provider?: string | null }>,
) {
  const providers = new Set<string>();
  for (const connection of connections) {
    if (ACTIVE_DIRECTORY_STATUSES.has(String(connection.status || "").toLowerCase()) && connection.provider) {
      providers.add(connection.provider);
    }
  }
  for (const employee of employees) {
    if (
      ACTIVE_DIRECTORY_STATUSES.has(String(employee.connectionStatus || "").toLowerCase()) &&
      employee.provider
    ) {
      providers.add(employee.provider);
    }
  }
  return providers.size;
}

export const MERGE_EMPLOYEES_QUERY_KEY = ["integrations", "merge", "employees"] as const;
export const MERGE_CONNECTIONS_QUERY_KEY = ["integrations", "merge", "connections"] as const;

export type HrisEmployeesVm = {
  employees: MergeHrisEmployeePublic[];
  totalCount: number;
  activeCount: number;
  connectedProviderCount: number;
  connections: MergeConnectionPublic[];
  directory: HrisDirectoryStatus;
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
  providerFilter: string;
  onProviderFilter: (value: string) => void;
  providerOptions: string[];
};

export function useHrisEmployeesController(): HrisEmployeesVm {
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const providerFilter = searchParams.get("provider") || "all";

  const onProviderFilter = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete("provider");
    else next.set("provider", value);
    setSearchParams(next, { replace: true });
  };

  const connectionsQuery = useQuery({
    queryKey: MERGE_CONNECTIONS_QUERY_KEY,
    queryFn: fetchMergeConnections,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const employeesQuery = useQuery({
    queryKey: MERGE_EMPLOYEES_QUERY_KEY,
    queryFn: () => fetchMergeEmployees(),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const allEmployees = employeesQuery.data?.employees ?? [];
  const directory = resolveHrisDirectoryBanner({
    connections: connectionsQuery.data ?? [],
    connectionsLoaded: connectionsQuery.isSuccess,
    employeeDirectory: employeesQuery.data?.directory,
  });

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEmployees) {
      if (e.provider) set.add(e.provider);
    }
    return Array.from(set).sort();
  }, [allEmployees]);

  const activeCount = useMemo(
    () =>
      allEmployees.filter(
        (e) =>
          String(e.effectiveEmploymentStatus || e.employmentStatus || "").toUpperCase() ===
          "ACTIVE",
      ).length,
    [allEmployees],
  );

  const connectedProviderCount = useMemo(
    () => countConnectedDirectoryProviders(connectionsQuery.data ?? [], allEmployees),
    [connectionsQuery.data, allEmployees],
  );

  const employees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEmployees.filter((e) => {
      if (providerFilter !== "all" && e.provider !== providerFilter) return false;
      if (!q) return true;
      const hay = [
        e.displayName,
        e.firstName,
        e.lastName,
        e.workEmail,
        e.jobTitle,
        e.employmentStatus,
        e.effectiveEmploymentStatus,
        e.employmentType,
        e.address,
        e.locationName,
        e.country,
        e.provider,
        e.connectionStatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allEmployees, search, providerFilter]);

  return {
    employees,
    totalCount: allEmployees.length,
    activeCount,
    connectedProviderCount,
    connections: connectionsQuery.data ?? [],
    directory,
    loading: employeesQuery.isLoading || connectionsQuery.isLoading,
    error:
      employeesQuery.error instanceof Error
        ? employeesQuery.error.message
        : employeesQuery.isError
          ? "Could not load HRIS employees"
          : null,
    search,
    onSearch: setSearch,
    providerFilter,
    onProviderFilter,
    providerOptions,
  };
}
