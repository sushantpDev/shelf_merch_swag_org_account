import { useEffect, useState } from "react";
import {
  readConsentChoice,
  setConsentChoice,
  subscribeConsentChoice,
  type ConsentChoice,
} from "@/lib/consentChoice";

const EMPTY: ConsentChoice = { analytics: false, advertising: false };

export function useConsentDraft() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [draft, setDraft] = useState<ConsentChoice>(EMPTY);

  useEffect(() => {
    const current = readConsentChoice();
    setChoice(current);
    setDraft(current ?? EMPTY);
    return subscribeConsentChoice(() => {
      const next = readConsentChoice();
      setChoice(next);
      setDraft(next ?? EMPTY);
    });
  }, []);

  return {
    choice,
    draft,
    setDraft,
    acceptAll: () => setConsentChoice({ analytics: true, advertising: true }),
    rejectOptional: () => setConsentChoice(EMPTY),
    saveDraft: () => setConsentChoice(draft),
  };
}
