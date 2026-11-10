/** @vitest-environment happy-dom */
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrgWizard } from "./OrgWizard";
import { seedNewWizard, wizardReducer } from "../reducer";
import type { WizardState } from "../types";

vi.mock("../model", () => ({
  useCreateWallet: () => ({}),
  useCreateRazorpayOrder: () => ({}),
  useVerifyRazorpayPayment: () => ({}),
  useSyncOrgWizard: () => ({ isPending: false }),
}));
afterEach(cleanup);

function Harness({ mobile = "", email = "bad-email" }: { mobile?: string; email?: string }) {
  const initial: WizardState = {
    ...seedNewWizard(), flow: "allocate", step: 4,
    departments: [{ id: 1, name: "Operations", desc: "", users: 1, color: "#123456", allocated: 100, selected: true,
      mgr: { name: "Tom Banton", email, mobile, role: "Operations Manager", invite: true } }],
  };
  const [state, dispatch] = useReducer(wizardReducer, initial);
  return <OrgWizard account="Test" state={state} dispatch={dispatch} onExit={() => {}} onFinished={() => {}} />;
}

describe("manager wizard validation", () => {
  it("keeps empty required fields on the manager step without Needed badges", () => {
    render(<Harness email="" />);
    fireEvent.change(screen.getByLabelText("Manager name"), { target: { value: "" } });
    expect(screen.queryByText("Needed")).toBeNull();
    expect(screen.queryByText("Add an email to continue")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Enter the manager's name.")).toBeTruthy();
    expect(screen.getByText("Enter the manager's work email.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Review allocation" })).toBeNull();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeTruthy();
  });

  it("blocks Continue and review shortcuts until errors are corrected", () => {
    render(<Harness mobile="bad-mobile" />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText(/Enter a valid work email/)).toBeTruthy();
    expect(screen.getByText(/Enter a valid 10-digit/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Review & Finish/ }));
    expect(screen.getByLabelText("Manager name")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "tom@company.com" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Mobile number/ }), { target: { value: "9876543210" } });
    expect(screen.queryByText(/Enter a valid work email/)).toBeNull();
    expect(screen.queryByText(/Enter a valid 10-digit/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: "Review allocation" })).toBeTruthy();
  });

  it("shows blur errors and accepts pasted +91 numbers while rejecting letters and excess digits", () => {
    render(<Harness email="tom@company.com" />);
    const mobile = screen.getByRole("textbox", { name: /Mobile number/ }) as HTMLInputElement;
    fireEvent.change(mobile, { target: { value: "123" } });
    fireEvent.blur(mobile);
    expect(mobile.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(mobile, { target: { value: "+91 98765 43210" } });
    expect(mobile.value).toBe("9876543210");
    expect(mobile.getAttribute("aria-invalid")).toBe("false");
    fireEvent.change(mobile, { target: { value: "ss@@123" } });
    expect(mobile.value).toBe("9876543210");
    fireEvent.change(mobile, { target: { value: "98765432101" } });
    expect(mobile.value).toBe("9876543210");
  });
});
