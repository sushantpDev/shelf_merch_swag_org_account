// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { CONSENT_STORAGE_KEY } from "@/lib/consentChoice";
import { ConsentBanner } from "./ConsentBanner";
import { MeasurementConsentChoice } from "./MeasurementConsentChoice";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("consent banner", () => {
  it("contains keyboard focus and restores the page when dismissed without saving", async () => {
    const user = userEvent.setup();
    const previousOverflow = document.body.style.overflow;
    const { container } = render(<ConsentBanner />);
    const dialog = screen.getByRole("dialog", { name: "Your privacy choices" });
    expect(document.activeElement).toBe(dialog);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(container.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    screen.getByRole("link", { name: "Privacy policy" }).focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close cookie preferences" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(container.inert).not.toBe(true);
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it("keeps optional measurement off until accept, reject, or a saved preference", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    expect(screen.getByRole("dialog", { name: "Your privacy choices" })).toBeTruthy();
    expect(screen.getByText(/hashes recognizable form details/)).toBeTruthy();
    expect(screen.getByText(/does not provide a supported way to turn that hashing off/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reject optional" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toMatchObject({
      analytics: false,
      advertising: false,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves an analytics-only preference from manage preferences", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);
    await user.click(screen.getByRole("button", { name: "Manage preferences" }));
    expect(screen.getByRole("checkbox", { name: /hashes recognizable form details/ })).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /Analytics/ }));
    await user.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toEqual({
      v: 1,
      analytics: true,
      advertising: false,
    });
  });

  it("reopens saved preferences without clearing them", async () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ v: 1, analytics: true, advertising: false }),
    );
    render(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      window.dispatchEvent(new Event("shelfmerch:open-consent"));
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Analytics/ })).toBeTruthy();
  });
});

describe("privacy consent choice", () => {
  it("records accept all and a later rejection", async () => {
    const user = userEvent.setup();
    render(<MeasurementConsentChoice />);
    expect(screen.getByText(/Optional measurement stays off/)).toBeTruthy();
    expect(screen.getByText(/does not provide a supported way to turn that hashing off/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Accept all" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toMatchObject({
      analytics: true,
      advertising: true,
    });
    await user.click(screen.getByRole("button", { name: "Reject optional" }));
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "")).toMatchObject({
      analytics: false,
      advertising: false,
    });
  });
});
