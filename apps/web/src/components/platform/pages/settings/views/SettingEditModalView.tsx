import { PlatformError, PlatformModal } from "../../../platform-ui";
import type { SettingEditVm } from "../controllers/useSettingEditController";

/** Setting value edit modal (JSON). */
export function SettingEditModalView({
  settingKey,
  text,
  busy,
  err,
  onClose,
  onText,
  onSubmit,
}: SettingEditVm) {
  return (
    <PlatformModal title="Edit setting" subtitle={settingKey} onClose={onClose}>
      {err && <PlatformError message={err} />}
      <div className="field">
        <label className="lbl">Value (JSON)</label>
        <textarea
          className="inp"
          rows={6}
          value={text}
          onChange={(e) => onText(e.target.value)}
          style={{ fontFamily: "var(--font-family-code)", fontSize: 13 }}
        />
      </div>
      <button type="button" className="btn btn-brand btn-block" disabled={busy} onClick={onSubmit}>
        {busy ? "Saving…" : "Save setting"}
      </button>
    </PlatformModal>
  );
}
