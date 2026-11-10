import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import type { ContactImportStatus } from "../model";
import type { ImportContactsVm } from "../controllers/useImportContactsController";

const ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const STAGE_LABEL: Record<ContactImportStatus["status"], string> = {
  queued: "Queued for processing…",
  processing: "Validating and importing contacts…",
  done: "Import complete",
  failed: "Import failed",
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportContactsPanelView(vm: ImportContactsVm) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function takeFile(file: File | null | undefined) {
    if (!file) return;
    vm.onPickFile(file);
  }

  return (
    <div className="ac-import">
      <div className="ac-import-body">
        <div className="ac-import-template">
          <span className="ac-import-template-icon" aria-hidden="true">
            <FileSpreadsheet size={20} />
          </span>
          <div className="ac-import-template-copy">
            <strong>Use our contact template</strong>
            <p>Fill it in, then upload your file.</p>
          </div>
          <button
            type="button"
            className="ac-import-template-download"
            aria-label="Download template"
            onClick={vm.onDownloadTemplate}
          >
            <Download size={18} aria-hidden="true" />
            <span>Download template</span>
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose contacts file"
          tabIndex={-1}
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {!vm.file ? (
          <div
            className={`ac-import-zone${dragging ? " is-dragging" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
              takeFile(e.dataTransfer.files?.[0]);
            }}
            role="button"
            aria-label="Upload contacts file"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <span className="ac-import-icon" aria-hidden="true">
              <Upload size={18} />
            </span>
            <div className="ac-import-zone-title">Drop your file here</div>
            <div className="ac-import-zone-sub">CSV, XLSX or XLS · Up to 5 MB</div>
            <span className="ac-import-browse">Browse files</span>
          </div>
        ) : (
          <div className="ac-import-file-card">
            <div className="ac-import-file-meta">
              <span className="ac-import-file-icon" aria-hidden="true">
                <FileSpreadsheet size={18} />
              </span>
              <div className="ac-import-file-text">
                <div className="ac-import-file-name" title={vm.file.name}>
                  {vm.file.name}
                </div>
                <div className="ac-import-file-size">{fmtSize(vm.file.size)}</div>
              </div>
            </div>
            {!vm.busy && (
              <button
                type="button"
                className="xbtn"
                aria-label="Remove file"
                onClick={vm.onClearFile}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {vm.status && (
          <div
            className={`ac-import-status${vm.busy ? " is-busy" : ""}`}
            role="status"
            aria-live="polite"
          >
            <div className="ac-import-status-title">
              {vm.busy ? <span className="ac-import-spin" aria-hidden="true" /> : null}
              {STAGE_LABEL[vm.status.status]}
            </div>
            {vm.status.status === "done" && (
              <div className="ac-import-status-meta">
                {vm.status.validCount} of {vm.status.totalRows} rows imported
                {vm.status.errorCount > 0 ? ` · ${vm.status.errorCount} skipped` : ""}
              </div>
            )}
            {vm.status.errors.length > 0 && (
              <div className="ac-import-errors">
                {vm.status.errors.slice(0, 5).map((e, i) => (
                  <div key={i}>
                    Row {e.row}: {e.message}
                  </div>
                ))}
                {vm.status.errors.length > 5 && <div>…and {vm.status.errors.length - 5} more</div>}
              </div>
            )}
          </div>
        )}
      </div>
      <div
        className={`contact-form-footer ac-import-footer${vm.finished ? " ac-import-footer--finished" : ""}`}
      >
        <button type="button" className="btn btn-ghost" onClick={vm.onDone} disabled={vm.busy}>
          {vm.finished ? "Close" : "Cancel"}
        </button>
        {!vm.finished && (
          <button
            type="button"
            className="btn btn-brand"
            onClick={vm.onRunImport}
            disabled={!vm.file || vm.busy}
          >
            {vm.busy ? "Importing…" : "Import contacts"}
          </button>
        )}
      </div>
    </div>
  );
}
