import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { integrationOverviewSteps } from "../integrationOverviewCopy";

export function IntegrationOverview({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName: string;
}) {
  const steps = integrationOverviewSteps(providerId, providerName);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".integ-overview__steps")) return;
      setOpen(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  return (
    <section
      className={`integ-overview${open !== null ? " is-open" : ""}`}
      aria-label={`${providerName} integration overview`}
    >
      {open !== null ? (
        <button
          type="button"
          className="menu-dismiss-scrim"
          aria-label="Close details"
          onClick={() => setOpen(null)}
        />
      ) : null}
      <div className={`integ-overview__auto${providerId === "zoho-people" ? " integ-overview__auto--wrap" : ""}`}>
        <p>
          {providerId === "zoho-people"
            ? "Zoho People employee sync is manual. Click Sync now to import or update employees from Zoho People. Employees are not synced automatically."
            : "ShelfMerch handles syncing in the background. You do not need to click Sync now."}
        </p>
      </div>
      <div className="integ-overview__steps">
        {steps.map((step, index) => {
          const expanded = open === index;
          return (
            <div key={step.title} className={`integ-overview__item${expanded ? " is-open" : ""}`}>
              <button
                type="button"
                className="integ-overview__trigger"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : index)}
              >
                <span>{step.title}</span>
                <ChevronDown size={18} aria-hidden="true" />
              </button>
              {expanded ? <p className="integ-overview__body">{step.body}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
