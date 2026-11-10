import copilotIcon from "./assets/shelfmerch-copilot.svg";

/** Shared ShelfMerch Copilot mark; its containing button supplies the accessible name. */
export function CopilotIcon({ size = 32 }: { size?: number }) {
  return (
    <span
      className="sm-copilot-icon"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <img src={copilotIcon} alt="" draggable={false} />
    </span>
  );
}
