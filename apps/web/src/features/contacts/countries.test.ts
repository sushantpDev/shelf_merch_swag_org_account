import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { COUNTRY_OPTIONS } from "@/data/countries";
import { contactSchema, contactToForm, EMPTY_CONTACT } from "./types";
import type { UiContact } from "@/services/mappers";

it("accepts all 249 ISO country/territory codes and provides a bundled flag for each", () => {
  expect(COUNTRY_OPTIONS).toHaveLength(249);
  expect(new Set(COUNTRY_OPTIONS.map((country) => country.value)).size).toBe(249);
  for (const country of COUNTRY_OPTIONS) {
    const result = contactSchema.safeParse({
      ...EMPTY_CONTACT,
      firstName: "Alex",
      email: "alex@company.com",
      country: country.value,
    });
    expect(result.success, country.value).toBe(true);
    const flag = readFileSync(
      new URL(`../../../public/flags/${country.value.toLowerCase()}.svg`, import.meta.url),
      "utf8",
    );
    expect(flag, country.value).toContain("<svg");
  }
});

it("retains a saved country outside the former three options when editing", () => {
  const contact = { name: "Alex Morgan", role: "Member", country: "JP" } as UiContact;
  expect(contactToForm(contact).country).toBe("JP");
  expect(
    contactSchema.safeParse({
      ...EMPTY_CONTACT,
      firstName: "Alex",
      email: "alex@company.com",
      country: "ZZ",
    }).success,
  ).toBe(false);
});
