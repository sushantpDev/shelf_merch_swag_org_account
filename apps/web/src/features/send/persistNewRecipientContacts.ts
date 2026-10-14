import type { UiContact } from "@/services/mappers";
import { addContactFlow, ApiError, listContactsApi } from "@/services/api-bridge";
import {
  manualRecipientId,
  normalizeRecipientEmail,
  type CsvRecipientRow,
} from "./recipientSelection";

export type SavedRecipientContact = { fromId: string; contact: UiContact };

function isDuplicateContactError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.code === "CONFLICT");
}

/** Persist newly entered recipients as directory contacts at the time they are added. */
export async function persistNewRecipientContacts(
  rows: CsvRecipientRow[],
  knownContacts: UiContact[],
): Promise<{ saved: SavedRecipientContact[]; failed: string[] }> {
  const saved: SavedRecipientContact[] = [];
  const failed: string[] = [];

  for (let index = 0; index < rows.length; index += 8) {
    await Promise.all(
      rows.slice(index, index + 8).map(async (row) => {
        const email = normalizeRecipientEmail(row.email);
        if (knownContacts.some((contact) => normalizeRecipientEmail(contact.email) === email))
          return;

        try {
          let contact: UiContact;
          try {
            contact = await addContactFlow({
              name: row.name || email.split("@")[0] || email,
              email,
              role: "Member",
              phone: row.phone,
              department: row.department,
              employeeCode: row.employeeCode,
              address: row.address,
            });
          } catch (error) {
            if (!isDuplicateContactError(error)) throw error;
            const latest = await listContactsApi();
            const existing = latest.find((entry) => normalizeRecipientEmail(entry.email) === email);
            if (!existing) throw error;
            contact = existing;
          }
          saved.push({ fromId: manualRecipientId(email), contact });
        } catch {
          failed.push(email);
        }
      }),
    );
  }

  return { saved, failed };
}
