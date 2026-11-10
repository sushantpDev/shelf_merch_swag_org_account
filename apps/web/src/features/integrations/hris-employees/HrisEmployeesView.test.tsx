/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { MergeConnectionPublic, MergeHrisEmployeePublic } from "@/services/merge-api";
import { HrisEmployeesView } from "./HrisEmployeesView";
import {
  countConnectedDirectoryProviders,
  type HrisEmployeesVm,
} from "./useHrisEmployeesController";

afterEach(cleanup);

function connection(status: string): MergeConnectionPublic {
  return {
    id: "connection-1",
    provider: "gusto",
    category: "hris",
    status,
    integrationName: "Gusto",
    endUserOrganizationName: "Example Company",
    mergeLinkedAccountId: "linked-account-1",
    connectedAt: "2026-10-01T12:00:00.000Z",
    lastSyncAt: null,
    lastSyncStatus: "idle",
    lastError: null,
    connectedByUserId: "user-1",
    updatedAt: "2026-10-01T12:00:00.000Z",
  };
}

function employee(): MergeHrisEmployeePublic {
  return {
    id: "employee-1",
    connectionId: "connection-1",
    connectionStatus: "connected",
    provider: "gusto",
    mergeEmployeeId: "merge-employee-1",
    displayName: "Priya Sharma",
    firstName: "Priya",
    lastName: "Sharma",
    workEmail: "priya@example.com",
    employmentStatus: "ACTIVE",
    effectiveEmploymentStatus: "ACTIVE",
    jobTitle: "Product Designer",
    departmentMergeIds: [],
    locationMergeId: null,
    startDate: null,
    terminationDate: null,
    lastSyncedAt: "2026-10-01T14:00:00.000Z",
    source: "merge",
  };
}

function viewModel(overrides: Partial<HrisEmployeesVm> = {}): HrisEmployeesVm {
  return {
    employees: [],
    totalCount: 0,
    activeCount: 0,
    connectedProviderCount: 0,
    connections: [],
    directory: { state: "empty", lastSuccessfulSyncAt: null, retainSnapshot: false },
    loading: false,
    error: null,
    search: "",
    onSearch: vi.fn(),
    providerFilter: "all",
    onProviderFilter: vi.fn(),
    providerOptions: [],
    ...overrides,
  };
}

function renderView(vm: HrisEmployeesVm) {
  return render(
    <MemoryRouter>
      <HrisEmployeesView {...vm} />
    </MemoryRouter>,
  );
}

describe("HrisEmployeesView", () => {
  it("renders the empty state for a connected provider with zero employees", () => {
    renderView(
      viewModel({
        connections: [connection("connected")],
        connectedProviderCount: 1,
        directory: { state: "connected", lastSuccessfulSyncAt: null, retainSnapshot: false },
      }),
    );

    expect(screen.getByText("No people to show")).toBeTruthy();
    expect(screen.getByText("Try a different search or filter.")).toBeTruthy();
  });

  it("prompts the user to connect a provider when none is configured", () => {
    renderView(viewModel());

    expect(screen.getByText("No people to show")).toBeTruthy();
    expect(screen.getByText("Connect an HRIS provider to import employees.")).toBeTruthy();
  });

  it("renders employees from a connected provider", () => {
    const person = employee();
    renderView(
      viewModel({
        employees: [person],
        totalCount: 1,
        activeCount: 1,
        connectedProviderCount: 1,
        connections: [connection("connected")],
        directory: {
          state: "connected",
          lastSuccessfulSyncAt: person.lastSyncedAt,
          retainSnapshot: false,
        },
      }),
    );

    expect(screen.getByText("Priya Sharma")).toBeTruthy();
    expect(screen.getByText("priya@example.com")).toBeTruthy();
    expect(screen.queryByText("No people to show")).toBeNull();
  });

  it("treats a provider needing attention as configured", () => {
    renderView(
      viewModel({
        connections: [connection("needs_attention")],
        connectedProviderCount: 1,
        directory: { state: "error", lastSuccessfulSyncAt: null, retainSnapshot: false },
      }),
    );

    expect(screen.getByText("Try a different search or filter.")).toBeTruthy();
    expect(screen.queryByText("Connect an HRIS provider to import employees.")).toBeNull();
  });

  it("renders the connected empty state when search or filtering removes every employee", () => {
    renderView(
      viewModel({
        totalCount: 1,
        activeCount: 1,
        connectedProviderCount: 1,
        connections: [connection("connected")],
        directory: {
          state: "connected",
          lastSuccessfulSyncAt: "2026-10-01T14:00:00.000Z",
          retainSnapshot: false,
        },
        search: "missing person",
        providerFilter: "gusto",
        providerOptions: ["gusto"],
      }),
    );

    expect(screen.getByText("Total 0 items")).toBeTruthy();
    expect(screen.getByText("Try a different search or filter.")).toBeTruthy();
  });

  it("lists a Zoho People employee when no Merge connection is loaded", () => {
    const person = employee();
    person.provider = "zoho-people";
    person.mergeEmployeeId = "";
    person.displayName = "Asha Rao";
    person.firstName = "Asha";
    person.lastName = "Rao";
    person.workEmail = "asha@example.com";
    person.source = "zoho-people";
    renderView(
      viewModel({
        employees: [person],
        totalCount: 1,
        activeCount: 1,
        connectedProviderCount: 1,
        connections: [],
        directory: {
          state: "connected",
          lastSuccessfulSyncAt: person.lastSyncedAt,
          retainSnapshot: false,
        },
      }),
    );

    expect(screen.getByText("Asha Rao")).toBeTruthy();
    expect(screen.getByText("Zoho People")).toBeTruthy();
    expect(screen.queryByText(/No active directory connection/)).toBeNull();
  });
});

describe("countConnectedDirectoryProviders", () => {
  it("counts Zoho People from synced employees and Merge from connections once each", () => {
    expect(
      countConnectedDirectoryProviders(
        [{ status: "connected", provider: "gusto" }],
        [
          { connectionStatus: "connected", provider: "gusto" },
          { connectionStatus: "connected", provider: "zoho-people" },
          { connectionStatus: "disconnected", provider: "workday" },
        ],
      ),
    ).toBe(2);
  });
});
