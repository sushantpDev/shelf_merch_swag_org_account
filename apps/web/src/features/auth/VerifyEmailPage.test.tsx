// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { AuthUser } from "@/services/auth-store";
import { ApiError } from "./model";
import { VerifyEmailPage } from "./VerifyEmailPage";

const verifySignupOtp = vi.fn();
const trackOpenAiRegistrationCompleted = vi.fn();
const assign = vi.fn();

vi.mock("./model", async () => {
  const actual = await vi.importActual<typeof import("./model")>("./model");
  return { ...actual, verifySignupOtp: (...args: unknown[]) => verifySignupOtp(...args) };
});

vi.mock("@/lib/openaiPixel", () => ({
  trackOpenAiRegistrationCompleted: (...args: unknown[]) => trackOpenAiRegistrationCompleted(...args),
}));

const user: AuthUser = {
  id: "user-1",
  tenantId: "tenant-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "admin",
  scopeType: "tenant",
  assignedEntityIds: [],
};

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/signup/verify",
          state: {
            pendingId: "pending-1",
            email: "ada@example.com",
            emailMasked: "a***@example.com",
            otpExpiresInSec: 120,
            resendAvailableInSec: 30,
          },
        },
      ]}
    >
      <VerifyEmailPage />
    </MemoryRouter>,
  );
}

async function enterCode() {
  const userEvents = userEvent.setup();
  await userEvents.click(document.querySelector("#otp-0") as HTMLInputElement);
  await userEvents.paste("123456");
}

afterEach(() => {
  cleanup();
  verifySignupOtp.mockReset();
  trackOpenAiRegistrationCompleted.mockReset();
  assign.mockReset();
});

describe("VerifyEmailPage OpenAI registration measurement", () => {
  it("tracks registration_completed only after the account is created", async () => {
    vi.spyOn(window.location, "assign").mockImplementation(assign);
    verifySignupOtp.mockResolvedValue(user);
    renderPage();
    await enterCode();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("/dashboard");
    });
    expect(verifySignupOtp).toHaveBeenCalledTimes(1);
    expect(trackOpenAiRegistrationCompleted).toHaveBeenCalledTimes(1);
    expect(trackOpenAiRegistrationCompleted).toHaveBeenCalledWith("user-1");
    expect(JSON.stringify(trackOpenAiRegistrationCompleted.mock.calls)).not.toContain("ada@example.com");
    expect(JSON.stringify(trackOpenAiRegistrationCompleted.mock.calls)).not.toContain("123456");
  });

  it("does not track registration when verification fails", async () => {
    vi.spyOn(window.location, "assign").mockImplementation(assign);
    verifySignupOtp.mockRejectedValue(new ApiError(400, "Incorrect verification code.", "OTP_INVALID"));
    renderPage();
    await enterCode();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => {
      expect(document.querySelector("[role='alert']")?.textContent).toContain(
        "Incorrect verification code",
      );
    });
    expect(trackOpenAiRegistrationCompleted).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("creates the account once when verify is submitted twice", async () => {
    vi.spyOn(window.location, "assign").mockImplementation(assign);
    let resolveVerify: (value: AuthUser) => void = () => undefined;
    verifySignupOtp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerify = resolve;
        }),
    );
    renderPage();
    await enterCode();
    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(verifySignupOtp).toHaveBeenCalledTimes(1);

    resolveVerify(user);
    await waitFor(() => {
      expect(trackOpenAiRegistrationCompleted).toHaveBeenCalledTimes(1);
    });
    expect(trackOpenAiRegistrationCompleted).toHaveBeenCalledWith("user-1");
  });

  it("still enters the app when measurement throws", async () => {
    vi.spyOn(window.location, "assign").mockImplementation(assign);
    verifySignupOtp.mockResolvedValue(user);
    trackOpenAiRegistrationCompleted.mockImplementation(() => {
      throw new Error("pixel unavailable");
    });
    renderPage();
    await enterCode();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("/dashboard");
    });
  });
});
