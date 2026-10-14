import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UiContact } from "@/services/mappers";

const api = vi.hoisted(() => ({
  addContactFlow: vi.fn(),
  listContactsApi: vi.fn(),
}));

vi.mock("@/services/api-bridge", () => ({
  ...api,
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code = "API_ERROR",
    ) {
      super(message);
    }
  },
}));

import { ApiError } from "@/services/api-bridge";
import { persistNewRecipientContacts } from "./persistNewRecipientContacts";

function contact(id: string, email: string): UiContact {
  return { id, email, name: email.split("@")[0], role: "Member", address: "", loc: "" };
}

describe("persistNewRecipientContacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves added CSV recipients with their contact details", async () => {
    api.addContactFlow.mockResolvedValue(contact("saved-1", "ada@example.com"));

    const result = await persistNewRecipientContacts(
      [{ email: "ADA@example.com", name: "Ada Lovelace", role: "Admin", department: "Engineering", phone: "123" }],
      [],
    );

    expect(api.addContactFlow).toHaveBeenCalledWith({
      email: "ada@example.com",
      name: "Ada Lovelace",
      role: "Member",
      department: "Engineering",
      phone: "123",
      employeeCode: undefined,
      address: undefined,
    });
    expect(result).toEqual({
      saved: [{ fromId: "email:ada@example.com", contact: contact("saved-1", "ada@example.com") }],
      failed: [],
    });
  });

  it("reuses an existing contact after a concurrent create", async () => {
    api.addContactFlow.mockRejectedValue(
      new ApiError(409, "A contact with this email already exists"),
    );
    api.listContactsApi.mockResolvedValue([contact("existing-1", "ada@example.com")]);

    const result = await persistNewRecipientContacts([{ email: "ada@example.com" }], []);

    expect(result.saved[0]).toEqual({
      fromId: "email:ada@example.com",
      contact: contact("existing-1", "ada@example.com"),
    });
    expect(result.failed).toEqual([]);
  });

  it("continues after a failed save and skips contacts already in the directory", async () => {
    api.addContactFlow
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(contact("saved-2", "new@example.com"));

    const result = await persistNewRecipientContacts(
      [
        { email: "existing@example.com" },
        { email: "failed@example.com" },
        { email: "new@example.com" },
      ],
      [contact("existing-1", "existing@example.com")],
    );

    expect(api.addContactFlow).toHaveBeenCalledTimes(2);
    expect(result.failed).toEqual(["failed@example.com"]);
    expect(result.saved.map((entry) => entry.contact.id)).toEqual(["saved-2"]);
  });
});
