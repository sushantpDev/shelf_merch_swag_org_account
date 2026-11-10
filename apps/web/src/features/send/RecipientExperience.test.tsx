// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { RecipientExperience } from "./RecipientExperience";

afterEach(cleanup);

const baseProps = {
  mode: "surprise" as const,
  itemCount: 1,
  from: "",
  message: "",
  onFrom: vi.fn(),
  onMessage: vi.fn(),
  when: "now" as const,
  onWhen: vi.fn(),
  schedule: { date: "2026-10-23", time: "10:00", tz: "Asia/Kolkata (IST)" },
  onSchedule: vi.fn(),
  onPreview: vi.fn(),
};

describe("RecipientExperience blank optional message", () => {
  it("keeps inputs empty and renders clean tracking and email previews", () => {
    const view = render(<RecipientExperience {...baseProps} preview="landing" />);

    const fields = view.getAllByRole("textbox") as HTMLInputElement[];
    expect(fields.map((field) => field.value)).toEqual(["", ""]);

    const trackingPreview = view.container.querySelector(".phone");
    expect(trackingPreview).not.toBeNull();
    expect(
      within(trackingPreview as HTMLElement).getByText("Your gift is on its way!"),
    ).toBeTruthy();
    expect(within(trackingPreview as HTMLElement).getByText("Estimated delivery")).toBeTruthy();
    expect(within(trackingPreview as HTMLElement).getByText("In transit")).toBeTruthy();
    expect(within(trackingPreview as HTMLElement).getByText("Tracking number")).toBeTruthy();
    expect(within(trackingPreview as HTMLElement).queryByText(/Your gift from/)).toBeNull();

    view.rerender(<RecipientExperience {...baseProps} preview="email" />);
    const emailPreview = view.container.querySelector(".email-frame");
    expect(emailPreview).not.toBeNull();
    expect(within(emailPreview as HTMLElement).getByText("Shipping update")).toBeTruthy();
    expect(within(emailPreview as HTMLElement).getByText("Your order has shipped")).toBeTruthy();
    expect(within(emailPreview as HTMLElement).queryByText(/inbox/)).toBeNull();
    expect(within(emailPreview as HTMLElement).queryByText(/^FROM\s/)).toBeNull();
  });

  it("does not render a landing or invitation preview for item redemption", () => {
    const view = render(<RecipientExperience {...baseProps} mode="redeem" preview="landing" />);

    expect(view.queryByRole("button", { name: "Landing page" })).toBeNull();
    expect(view.queryByRole("button", { name: "Invitation email" })).toBeNull();
    expect(view.container.querySelector(".recipient-exp__preview")).toBeNull();
    expect(view.container.querySelector(".recipient-exp__grid--single")).not.toBeNull();
  });
});
