import { describe, expect, it } from "vitest";
import { formatZohoSyncResult } from "./zoho-api";
import { getHrisMarketplaceProfile } from "../features/integrations/hrisMarketplaceCopy";

describe("Zoho sync result copy", () => {
  it("includes backend counts and flags failures", () => {
    expect(
      formatZohoSyncResult({
        totalFetched: 12,
        created: 3,
        updated: 7,
        skipped: 2,
        failed: 0,
      }),
    ).toBe("Employee sync complete: 12 fetched, 3 created, 7 updated, 2 skipped, 0 failed.");
    expect(
      formatZohoSyncResult({
        totalFetched: 4,
        created: 0,
        updated: 1,
        skipped: 1,
        failed: 2,
      }),
    ).toContain("finished with failures");
  });

  it("does not claim automatic sync for Zoho People and keeps it for other HRIS", () => {
    const zoho = getHrisMarketplaceProfile("zoho-people");
    const gusto = getHrisMarketplaceProfile("gusto");
    expect(zoho?.setup).toContain("does not start by itself");
    expect(zoho?.overview.join(" ")).not.toMatch(/Automatic sync/);
    expect(gusto?.overview.join(" ")).toContain("Automatic sync");
  });
});
