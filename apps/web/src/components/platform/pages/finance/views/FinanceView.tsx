import { type ReactNode } from "react";
import {
  DataTable,
  inr,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { FinanceVm } from "../controllers/useFinanceController";
import type { FundingRow, PlatformInvoice } from "../model";
import { CreditNoteModal } from "./CreditNoteModal";
import { FundingActionModal } from "./FundingActionModal";

function formatDate(value: unknown) {
  if (!value) return "N/A";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("en-IN");
}

/** Outstanding balances, funding approvals, tax invoices, and credit notes. */
export function FinanceView({
  outstanding,
  funding,
  invoices,
  creditNotes,
  canWrite,
  acting,
  issuingAgainst,
  onApprove,
  onReject,
  onCloseAction,
  onFundingChanged,
  onIssueCreditNote,
  onCloseCreditNote,
  onCreditNoteIssued,
}: FinanceVm) {
  const fundingColumns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "tenantName", label: "Tenant" },
    { key: "walletName", label: "Wallet" },
    {
      key: "document",
      label: "Document",
      render: (r) => {
        const doc = r.fundingDocument as FundingRow["fundingDocument"];
        const label = [doc?.docType, doc?.docNumber].filter(Boolean).join(" · ") || "N/A";
        return doc?.fileUrl ? (
          <a className="lnk" href={String(doc.fileUrl)} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        );
      },
    },
    {
      key: "requestedAmount",
      label: "Requested",
      render: (r) => inr(Number(r.requestedAmount ?? 0)),
    },
    {
      key: "fundingDocument",
      label: "Status",
      render: (r) => {
        const doc = r.fundingDocument as { approvalStatus?: string } | undefined;
        return <StatusTag status={String(doc?.approvalStatus ?? "pending")} />;
      },
    },
  ];

  if (canWrite) {
    fundingColumns.push({
      key: "act",
      label: "",
      render: (r) => (
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-brand btn-sm"
            onClick={() => onApprove(r as unknown as FundingRow)}
          >
            Approve
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onReject(r as unknown as FundingRow)}
          >
            Reject
          </button>
        </div>
      ),
    });
  }

  const invoiceColumns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "invoiceNumber", label: "Invoice" },
    { key: "tenantName", label: "Tenant" },
    {
      key: "totalAmount",
      label: "Total",
      render: (r) => inr(Number(r.totalAmount ?? 0)),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusTag status={String(r.status ?? "")} />,
    },
    {
      key: "createdAt",
      label: "Date",
      render: (r) => formatDate(r.createdAt),
    },
  ];

  if (canWrite) {
    invoiceColumns.push({
      key: "act",
      label: "",
      render: (r) => (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onIssueCreditNote(r as unknown as PlatformInvoice)}
        >
          Credit note
        </button>
      ),
    });
  }

  const loading =
    outstanding.loading || funding.loading || invoices.loading || creditNotes.loading;

  return (
    <>
      <PlatformPageHeader
        title="Finance"
        subtitle="Outstanding balances, funding approvals, tax invoices, and credit notes."
      />
      {loading && <PlatformLoading />}
      {outstanding.error && <PlatformError message={outstanding.error} />}
      {funding.error && <PlatformError message={funding.error} />}
      {invoices.error && <PlatformError message={invoices.error} />}
      {creditNotes.error && <PlatformError message={creditNotes.error} />}
      {outstanding.data && (
        <>
          <h3 style={{ marginBottom: 12 }}>Outstanding by tenant</h3>
          <DataTable
            empty="No outstanding invoices."
            rows={outstanding.data as unknown as Record<string, unknown>[]}
            columns={[
              { key: "tenantName", label: "Tenant" },
              {
                key: "outstandingInr",
                label: "Outstanding",
                render: (r) => inr(Number(r.outstandingInr)),
              },
            ]}
          />
        </>
      )}
      {funding.data && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Funding approvals</h3>
          <DataTable
            empty="No pending funding requests."
            rows={(Array.isArray(funding.data) ? funding.data : []) as Record<string, unknown>[]}
            columns={fundingColumns}
          />
        </div>
      )}
      {invoices.data && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Tax invoices</h3>
          <DataTable
            empty="No tax invoices yet."
            rows={invoices.data as unknown as Record<string, unknown>[]}
            columns={invoiceColumns}
          />
        </div>
      )}
      {creditNotes.data && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Credit notes</h3>
          <DataTable
            empty="No credit notes issued yet."
            rows={creditNotes.data as unknown as Record<string, unknown>[]}
            columns={[
              { key: "creditNoteNumber", label: "Credit note" },
              { key: "invoiceNumber", label: "Against invoice" },
              { key: "tenantName", label: "Tenant" },
              {
                key: "amount",
                label: "Amount",
                render: (r) => inr(Number(r.amount ?? 0)),
              },
              { key: "reason", label: "Reason" },
              {
                key: "createdAt",
                label: "Date",
                render: (r) => formatDate(r.createdAt),
              },
            ]}
          />
        </div>
      )}
      {acting && (
        <FundingActionModal
          row={acting.row}
          mode={acting.mode}
          onClose={onCloseAction}
          onDone={onFundingChanged}
        />
      )}
      {issuingAgainst && (
        <CreditNoteModal
          invoice={issuingAgainst}
          onClose={onCloseCreditNote}
          onDone={onCreditNoteIssued}
        />
      )}
    </>
  );
}
