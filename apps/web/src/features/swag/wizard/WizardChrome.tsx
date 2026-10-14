import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { FullscreenOverlay } from "@/components/tenant/FullscreenOverlay";

/** Full-screen wizard shell: title bar + step indicator + scroll body + footer. */
export function WizardChrome({
  title,
  steps,
  activeIndex,
  onExit,
  exitLabel = "Save and exit",
  showExit = true,
  exitDisabled = false,
  footer,
  children,
}: {
  title: string;
  steps: string[];
  activeIndex: number;
  onExit: () => void;
  exitLabel?: string;
  showExit?: boolean;
  exitDisabled?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <FullscreenOverlay>
      <div className="wzbar">
        <div className="title">{title}</div>
        <div className="wzsteps">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`wzstep ${i < activeIndex ? "done" : ""} ${i === activeIndex ? "on" : ""}`}
            >
              <span className="b">{i < activeIndex ? <Check size={12} /> : i + 1}</span>
              {s}
            </div>
          ))}
        </div>
        {showExit ? (
          <button
            type="button"
            className="btn btn-soft"
            style={{ cursor: exitDisabled ? "wait" : "pointer" }}
            disabled={exitDisabled}
            onClick={onExit}
          >
            {exitLabel}
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="main scroll" style={{ flex: 1 }}>
        <div
          style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 34px 40px", width: "100%" }}
          className="fade-in"
        >
          {children}
        </div>
      </div>
      {footer && (
        <div className="wzfoot">
          <div className="wzfoot-inner">{footer}</div>
        </div>
      )}
    </FullscreenOverlay>
  );
}
