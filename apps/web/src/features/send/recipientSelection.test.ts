import { describe, it, expect } from "vitest";
import {
  addRecipientRowsUpToLimit,
  addRecipientsUpToLimit,
  hasCompleteRecipientAddress,
  isManualRecipientId,
  isValidRecipientEmail,
  manualRecipientId,
  parseCsvEmails,
  parseCsvRecipientRows,
  parseEmailInput,
  resolveRecipientId,
  selectAllRecipientIds,
} from "@/features/send/recipientSelection";
import type { UiContact } from "@/services/mappers";

const contacts: UiContact[] = [
  {
    id: "c1",
    email: "alice@rubix.net",
    name: "Alice",
    role: "",
    address: "",
    loc: "N/A",
  },
  {
    id: "c2",
    email: "bob@rubix.net",
    name: "Bob",
    role: "",
    address: "",
    loc: "N/A",
  },
];

describe("recipientSelection", () => {
  it("validates and normalizes emails", () => {
    expect(isValidRecipientEmail("a@b.com")).toBe(true);
    expect(isValidRecipientEmail("not-an-email")).toBe(false);
    expect(manualRecipientId("  Ada@Rubix.net ")).toBe("email:ada@rubix.net");
    expect(isManualRecipientId("email:ada@rubix.net")).toBe(true);
  });

  it("parses pasted and CSV email lists", () => {
    expect(parseEmailInput("a@x.com, b@y.com; c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
    expect(parseCsvEmails("name,email\nAda,ada@rubix.net\nBob,bob@rubix.net")).toEqual([
      "ada@rubix.net",
      "bob@rubix.net",
    ]);
    expect(parseCsvEmails("solo@rubix.net\nother@rubix.net")).toEqual([
      "solo@rubix.net",
      "other@rubix.net",
    ]);
  });

  it("parses full contact columns from the contacts template", () => {
    const csv =
      "First Name,Last Name,Email,Phone,Role,Department,Employee Code,Address,City,State,PIN Code,Country\n" +
      "Rahul,Sharma,rahul@example.com,+91 9876543210,Member,Engineering,EMP001,12 MG Road,Bengaluru,Karnataka,560001,India\n";
    const rows = parseCsvRecipientRows(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("rahul@example.com");
    expect(rows[0].name).toBe("Rahul Sharma");
    expect(rows[0].phone).toBe("+91 9876543210");
    expect(rows[0].role).toBe("Member");
    expect(rows[0].department).toBe("Engineering");
    expect(rows[0].employeeCode).toBe("EMP001");
    expect(rows[0].address).toEqual({
      line1: "12 MG Road",
      line2: "",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
      country: "IN",
    });
    expect(
      hasCompleteRecipientAddress({
        address: rows[0].address?.line1 || "",
        city: rows[0].address?.city,
        state: rows[0].address?.state,
        pincode: rows[0].address?.pincode,
      }),
    ).toBe(true);
  });

  it("still builds overlays when CSV rows are already selected (duplicates)", () => {
    const { ids, result, overlays } = addRecipientRowsUpToLimit(
      [
        {
          email: "alice@rubix.net",
          name: "Alice Updated",
          department: "Ops",
          address: {
            line1: "9 Park Ave",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            country: "IN",
          },
        },
      ],
      ["c1"],
      contacts,
      10,
    );
    expect(ids).toEqual(["c1"]);
    expect(result.duplicates).toEqual(["alice@rubix.net"]);
    expect(overlays["alice@rubix.net"]?.address).toBe("9 Park Ave");
    expect(overlays["alice@rubix.net"]?.department).toBe("Ops");
    expect(overlays["alice@rubix.net"]?.city).toBe("Mumbai");
  });

  it("keeps shared profile overlays when adding pasted emails", () => {
    const { ids, overlays } = addRecipientsUpToLimit(
      ["new@rubix.net"],
      [],
      contacts,
      10,
      {
        name: "New User",
        phone: "9876543210",
        role: "Sender",
        department: "HR",
        employeeCode: "E9",
        address: {
          line1: "1 Main St",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560001",
          country: "IN",
        },
      },
    );
    expect(ids).toEqual(["email:new@rubix.net"]);
    expect(overlays["new@rubix.net"]?.name).toBe("New User");
    expect(overlays["new@rubix.net"]?.department).toBe("HR");
    expect(overlays["new@rubix.net"]?.role).toBe("Sender");
    expect(overlays["new@rubix.net"]?.employeeCode).toBe("E9");
    expect(overlays["new@rubix.net"]?.address).toBe("1 Main St");
    expect(overlays["new@rubix.net"]?.city).toBe("Bengaluru");
  });

  it("resolves to existing contact ids or manual ids", () => {
    expect(resolveRecipientId("alice@rubix.net", contacts)).toBe("c1");
    expect(resolveRecipientId("new@rubix.net", contacts)).toBe("email:new@rubix.net");
    expect(resolveRecipientId("bad", contacts)).toBeNull();
  });

  it("adds recipients with dedupe, invalid, and truncation", () => {
    const { ids, result } = addRecipientsUpToLimit(
      ["alice@rubix.net", "alice@rubix.net", "bad", "new@rubix.net", "extra@rubix.net"],
      [],
      contacts,
      2,
    );
    expect(ids).toEqual(["c1", "email:new@rubix.net"]);
    expect(result.added).toEqual(["alice@rubix.net", "new@rubix.net"]);
    expect(result.invalid).toEqual(["bad"]);
    expect(result.duplicates).toEqual(["alice@rubix.net"]);
    expect(result.truncated).toBe(1);
  });

  it("selects all contacts up to the limit", () => {
    expect(selectAllRecipientIds(contacts, [], 1)).toEqual(["c1"]);
    expect(selectAllRecipientIds(contacts, ["c1"], 10)).toEqual(["c1", "c2"]);
  });
});
