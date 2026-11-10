// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { PlatformKitTemplate } from "../model";
import { PreDesignedKitsView } from "./PreDesignedKits";

afterEach(cleanup);

function kit(id: string, name: string): PlatformKitTemplate {
  return {
    _id: id,
    name,
    items: [],
    imageUrls: [],
    approxValueInr: 500,
  } as PlatformKitTemplate;
}

describe("PreDesignedKitsView pending actions", () => {
  it("disables only the kit currently being opened for sending", () => {
    const view = render(
      <PreDesignedKitsView
        isLoading={false}
        kits={[kit("kit-a", "Welcome Kit"), kit("kit-b", "New Hire Kit")]}
        canSendKits
        kitPreview={null}
        onPreviewOpenChange={vi.fn()}
        onPreview={vi.fn()}
        onSend={vi.fn()}
        onRequestSample={vi.fn()}
        sendPendingId="kit-a"
        samplePendingId={null}
      />,
    );

    expect((view.getByRole("button", { name: "Opening…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((view.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
    const sampleButtons = view.getAllByRole("button", { name: "Request a Sample" });
    expect(sampleButtons).toHaveLength(2);
    expect(sampleButtons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  });
});
