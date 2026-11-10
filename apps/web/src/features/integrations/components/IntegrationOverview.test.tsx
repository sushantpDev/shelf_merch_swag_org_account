/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IntegrationOverview } from "./IntegrationOverview";

afterEach(() => cleanup());

const MANUAL =
  "Zoho People employee sync is manual. Click Sync now to import or update employees from Zoho People. Employees are not synced automatically.";
const AUTOMATIC = "ShelfMerch handles syncing in the background. You do not need to click Sync now.";

describe("integration overview banner", () => {
  it("describes Zoho People sync as manual", () => {
    render(<IntegrationOverview providerId="zoho-people" providerName="Zoho People" />);
    expect(screen.getByText(MANUAL)).toBeTruthy();
    expect(screen.queryByText(AUTOMATIC)).toBeNull();
    expect(document.querySelector(".integ-overview__auto--wrap")).toBeTruthy();
  });

  it("keeps background sync copy for other HRIS providers", () => {
    for (const [providerId, providerName] of [
      ["workday", "Workday"],
      ["bamboohr", "BambooHR"],
      ["deel", "Deel"],
      ["keka", "Keka"],
      ["gusto", "Gusto"],
      ["hibob", "HiBob"],
      ["ukg-pro", "UKG Pro"],
    ] as const) {
      cleanup();
      render(<IntegrationOverview providerId={providerId} providerName={providerName} />);
      expect(screen.getByText(AUTOMATIC)).toBeTruthy();
      expect(screen.queryByText(MANUAL)).toBeNull();
      expect(document.querySelector(".integ-overview__auto--wrap")).toBeNull();
    }
  });
});
