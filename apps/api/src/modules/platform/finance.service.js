import { Wallet } from '../wallets/wallet.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { Entity } from '../entities/entity.model.js';
import { User } from '../users/user.model.js';
import { Order } from '../orders/order.model.js';
import { Payment } from '../payments/payment.model.js';
import { Invoice } from '../invoices/invoice.model.js';
import { CreditNote } from '../invoices/creditNote.model.js';
import * as ledger from '../../services/ledger.service.js';
import * as walletsService from '../wallets/wallets.service.js';
import { createInvoiceForPayment } from '../invoices/invoices.service.js';
import { notify } from '../notifications/notifications.service.js';
import { sendWalletApprovedEmail } from '../../services/email.service.js';
import { resolveWorkspaceOwner } from '../tenants/tenants.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { scheduleSlackBusinessNotification, evaluateEntityLowBudgetAlert } from '../integrations/slack/slackNotify.service.js';
import { SLACK_EVENT_TYPES } from '../integrations/slack/slack.events.js';
import { logger } from '../../config/logger.js';

// ---------------------------------------------------------------------------
// Funding approvals (§3.8) — PO/bank-transfer wallets awaiting finance sign-off
// ---------------------------------------------------------------------------

export async function listFundingApprovals() {
  const wallets = await Wallet.find({ 'fundingDocument.approvalStatus': 'pending' })
    .setOptions({ skipTenantGuard: true })
    .sort({ updatedAt: -1 })
    .lean();

  const tenantIds = [...new Set(wallets.map((w) => String(w.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean();
  const tenantById = Object.fromEntries(tenants.map((t) => [String(t._id), t]));

  return wallets.map((w) => ({
    walletId: w._id,
    tenantId: w.tenantId,
    tenantName: tenantById[String(w.tenantId)]?.name ?? '',
    walletName: w.name,
    balance: w.balance,
    requestedAmount: w.fundingDocument?.requestedAmount ?? 0,
    fundingMethod: w.fundingMethod,
    fundingDocument: w.fundingDocument,
    requestedAt: w.updatedAt,
  }));
}

async function getWalletAnyTenant(walletId) {
  const wallet = await Wallet.findById(walletId).setOptions({ skipTenantGuard: true });
  if (!wallet) throw new NotFoundError('Wallet not found');
  return wallet;
}

/** Approve → fund_in via ledger.service — the ONLY way PO money enters (§3.8). */
export async function approveFunding({ walletId, amount, performedBy }) {
  const wallet = await getWalletAnyTenant(walletId);
  if (wallet.fundingDocument.approvalStatus !== 'pending') {
    throw new ApiError(422, 'This wallet has no pending funding request', 'NOT_PENDING');
  }

  const creditAmount = amount > 0 ? amount : wallet.fundingDocument.requestedAmount;
  if (!creditAmount || creditAmount <= 0) {
    throw new ApiError(422, 'Enter an amount greater than zero', 'INVALID_AMOUNT');
  }

  const isOnline = wallet.fundingMethod === 'online';
  const docLabel = isOnline
    ? `Online Payment ${wallet.fundingDocument.docNumber || ''}`.trim()
    : `Funding approved (${wallet.fundingDocument.docType || 'PO'} ${wallet.fundingDocument.docNumber || ''})`.trim();

  const transaction = await ledger.createTransaction({
    tenantId: wallet.tenantId,
    walletId: wallet._id,
    type: 'fund_in',
    amount: creditAmount,
    description: docLabel,
    performedBy,
  });

  if (isOnline) {
    const payment = await Payment.findOne({
      tenantId: wallet.tenantId,
      relatedType: 'wallet_funding',
      relatedId: wallet._id,
      provider: 'razorpay',
      status: 'succeeded',
      amount: creditAmount,
    })
      .sort({ createdAt: -1 })
      .setOptions({ skipTenantGuard: true });
    if (payment) {
      await createInvoiceForPayment({ tenantId: wallet.tenantId, payment });
    }
  }

  const planned = wallet.fundingDocument.plannedAllocations ?? [];
  if (planned.length > 0) {
    await ledger.allocateToEntities({
      tenantId: wallet.tenantId,
      walletId: wallet._id,
      allocations: planned.map((row) => ({
        entityId: row.entityId,
        amount: row.amount,
      })),
      performedBy,
    });
  }

  await Wallet.updateOne(
    { _id: wallet._id },
    {
      $set: {
        'fundingDocument.approvalStatus': 'approved',
        'fundingDocument.plannedAllocations': [],
      },
    },
  ).setOptions({ skipTenantGuard: true });

  const refreshed = await getWalletAnyTenant(walletId);
  try {
    await walletsService.activate({
      tenantId: refreshed.tenantId,
      walletId: refreshed._id,
      userId: performedBy,
    });
  } catch {
    // Setup may still be incomplete — funds are credited regardless.
  }

  const walletAfter = await getWalletAnyTenant(walletId);
  const tenant = await Tenant.findById(walletAfter.tenantId).select('name').lean();
  const walletLink = `/app/wallets?wallet=${walletAfter._id}`;

  const walletOwner = walletAfter.ownerUserId
    ? await User.findOne({ _id: walletAfter.ownerUserId, tenantId: walletAfter.tenantId })
        .select('name email')
        .lean()
    : null;
  const notificationRecipient = walletOwner
    ? { id: String(walletOwner._id), name: walletOwner.name, email: walletOwner.email }
    : await resolveWorkspaceOwner(walletAfter.tenantId);

  if (notificationRecipient) {
    await notify({
      type: 'wallet_funded',
      tenantId: walletAfter.tenantId,
      userId: notificationRecipient.id,
      title: 'Budget funded',
      body: `₹${creditAmount.toLocaleString('en-IN')} has been added to ${walletAfter.name}.`,
      link: walletLink,
    });

    // Match Budget UI: lifetime funded total (totalAmount), not spendable cash (balance).
    const fundedTotal = Number(walletAfter.totalAmount) || 0;
    if (notificationRecipient.email) {
      sendWalletApprovedEmail({
        to: notificationRecipient.email,
        recipientName: notificationRecipient.name || '',
        amount: creditAmount,
        newBalance: fundedTotal,
        walletName: walletAfter.name || '',
        organizationName: tenant?.name || 'your organization',
        link: walletLink,
      }).catch((err) => {
        logger.warn({ err, walletId, to: notificationRecipient.email }, 'Wallet approved email failed');
      });
    }
  }

  scheduleSlackBusinessNotification({
    tenantId: walletAfter.tenantId,
    type: SLACK_EVENT_TYPES.WALLET_APPROVED,
    eventKey: `WALLET_APPROVED:${transaction._id}`,
    resourceType: 'WalletTransaction',
    resourceId: transaction._id,
    payload: {
      amount: creditAmount,
      newBalance: Number(walletAfter.totalAmount) || 0,
      companyName: tenant?.name || walletAfter.name || 'company',
      poNumber: walletAfter.fundingDocument?.docNumber || '',
    },
  });

  // Planned allocations: budget-assigned Slack + low-budget reset/evaluate.
  for (const row of planned) {
    if (!row?.entityId || !(Number(row.amount) > 0)) continue;
    const entity = await Entity.findOne({ _id: row.entityId, tenantId: walletAfter.tenantId })
      .setOptions({ skipTenantGuard: true })
      .lean();
    if (entity) {
      scheduleSlackBusinessNotification({
        tenantId: walletAfter.tenantId,
        type: SLACK_EVENT_TYPES.BUDGET_ASSIGNED,
        eventKey: `BUDGET_ASSIGNED:funding:${transaction._id}:${entity._id}`,
        resourceType: 'Entity',
        resourceId: entity._id,
        actorUserId: performedBy,
        payload: {
          amount: row.amount,
          entityName: entity.name,
          availableBudget: Math.max(0, (entity.allocatedAmount || 0) - (entity.spentAmount || 0)),
        },
      });
    }
    evaluateEntityLowBudgetAlert({
      tenantId: walletAfter.tenantId,
      entityId: row.entityId,
    }).catch(() => {});
  }

  return { transaction, wallet: walletAfter };
}

export async function rejectFunding({ walletId, reason }) {
  const wallet = await getWalletAnyTenant(walletId);
  if (wallet.fundingDocument.approvalStatus !== 'pending') {
    throw new ApiError(422, 'This wallet has no pending funding request', 'NOT_PENDING');
  }
  wallet.fundingDocument.approvalStatus = 'rejected';
  await wallet.save();
  return { wallet, reason };
}

/** §3.8 wallet adjustment — ledger only, signed amount, reason mandatory. */
export async function walletAdjustment({ walletId, amount, reason, performedBy }) {
  const wallet = await getWalletAnyTenant(walletId);
  const transaction = await ledger.createTransaction({
    tenantId: wallet.tenantId,
    walletId: wallet._id,
    type: 'adjustment',
    amount,
    description: `Platform adjustment: ${reason}`,
    performedBy,
  });
  return { transaction, wallet: await getWalletAnyTenant(walletId) };
}

// ---------------------------------------------------------------------------
// Invoices & credit notes (§3.8)
// ---------------------------------------------------------------------------

async function nextNumber(model, prefix) {
  const year = new Date().getFullYear();
  const count = await model.countDocuments({}).setOptions({ skipTenantGuard: true });
  return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
}

function computeTotals(lineItems) {
  let taxable = 0;
  let gst = 0;
  for (const line of lineItems) {
    const amount = line.unitPrice * line.quantity;
    taxable += amount;
    gst += (amount * (line.gstRate ?? 0)) / 100;
  }
  return {
    taxable: Math.round(taxable * 100) / 100,
    gstAmount: Math.round(gst * 100) / 100,
    totalAmount: Math.round((taxable + gst) * 100) / 100,
  };
}

export async function listPlatformInvoices({ query }) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Invoice.find(filter).setOptions({ skipTenantGuard: true }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter).setOptions({ skipTenantGuard: true }),
  ]);

  const tenantIds = [...new Set(items.map((i) => String(i.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name').lean();
  const tenantBy = Object.fromEntries(tenants.map((t) => [String(t._id), t.name]));

  return paginatedResponse(
    items.map((inv) => ({ ...inv, tenantName: tenantBy[String(inv.tenantId)] ?? '' })),
    total,
    { page, limit },
  );
}

export async function listCreditNotes({ query }) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.invoiceId) filter.invoiceId = query.invoiceId;

  const [items, total] = await Promise.all([
    CreditNote.find(filter)
      .setOptions({ skipTenantGuard: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CreditNote.countDocuments(filter).setOptions({ skipTenantGuard: true }),
  ]);

  const invoiceIds = [...new Set(items.map((c) => String(c.invoiceId)))];
  const tenantIds = [...new Set(items.map((c) => String(c.tenantId)))];
  const [invoices, tenants] = await Promise.all([
    Invoice.find({ _id: { $in: invoiceIds } })
      .setOptions({ skipTenantGuard: true })
      .select('invoiceNumber')
      .lean(),
    Tenant.find({ _id: { $in: tenantIds } }).select('name').lean(),
  ]);
  const invoiceBy = Object.fromEntries(invoices.map((i) => [String(i._id), i.invoiceNumber]));
  const tenantBy = Object.fromEntries(tenants.map((t) => [String(t._id), t.name]));

  return paginatedResponse(
    items.map((cn) => ({
      ...cn,
      invoiceNumber: invoiceBy[String(cn.invoiceId)] ?? '',
      tenantName: tenantBy[String(cn.tenantId)] ?? '',
    })),
    total,
    { page, limit },
  );
}

export async function createProformaInvoice({ tenantId, lineItems, dueAt = null, relatedOrderId = null }) {
  const tenant = await Tenant.findOne({ _id: tenantId });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const lines = lineItems.map((line) => ({
    ...line,
    amount: Math.round(line.unitPrice * line.quantity * 100) / 100,
  }));
  const { gstAmount, totalAmount } = computeTotals(lineItems);

  return Invoice.create({
    tenantId,
    invoiceNumber: await nextNumber(Invoice, 'PF'),
    type: 'proforma',
    paymentId: null,
    relatedOrderId,
    lineItems: lines,
    totalAmount,
    gstAmount,
    receiverGstin: tenant.gstin ?? '',
    status: 'issued',
    dueAt,
  });
}

export async function createCreditNote({ invoiceId, amount, reason, issuedByUserId }) {
  const invoice = await Invoice.findById(invoiceId).setOptions({ skipTenantGuard: true });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.type !== 'tax') {
    throw new ApiError(422, 'Credit notes can only be issued against tax invoices', 'NOT_TAX_INVOICE');
  }
  if (amount <= 0 || amount > invoice.totalAmount) {
    throw new ApiError(422, 'Credit note amount must be positive and within the invoice total', 'INVALID_AMOUNT');
  }

  const gstShare = invoice.totalAmount > 0 ? invoice.gstAmount / invoice.totalAmount : 0;
  return CreditNote.create({
    tenantId: invoice.tenantId,
    creditNoteNumber: await nextNumber(CreditNote, 'CN'),
    invoiceId: invoice._id,
    amount,
    gstAmount: Math.round(amount * gstShare * 100) / 100,
    reason,
    issuedByUserId,
  });
}

/** §3.8 — manual payments (bank transfer/PO) marked received by finance. */
export async function markPaymentReceived({ paymentId }) {
  const payment = await Payment.findById(paymentId).setOptions({ skipTenantGuard: true });
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.status === 'succeeded') return payment;
  if (payment.provider === 'razorpay') {
    throw new ApiError(
      422,
      'Razorpay payments are reconciled via webhook only — never manually (§3.8)',
      'WEBHOOK_ONLY',
    );
  }
  payment.status = 'succeeded';
  await payment.save();
  return payment;
}

// ---------------------------------------------------------------------------
// Outstanding & reports (§3.8)
// ---------------------------------------------------------------------------

export async function getOutstanding() {
  const [invoiceAgg, walletAgg, tenants] = await Promise.all([
    Invoice.aggregate([
      { $match: { status: 'issued' } },
      { $group: { _id: '$tenantId', outstanding: { $sum: '$totalAmount' }, invoices: { $sum: 1 } } },
    ]),
    Wallet.aggregate([{ $group: { _id: '$tenantId', balance: { $sum: '$balance' } } }]),
    Tenant.find({}).select('name status').lean(),
  ]);

  const invoiceBy = Object.fromEntries(invoiceAgg.map((r) => [String(r._id), r]));
  const walletBy = Object.fromEntries(walletAgg.map((r) => [String(r._id), r]));

  return tenants
    .map((t) => ({
      tenantId: t._id,
      tenantName: t.name,
      tenantStatus: t.status,
      walletBalanceInr: walletBy[String(t._id)]?.balance ?? 0,
      outstandingInr: invoiceBy[String(t._id)]?.outstanding ?? 0,
      unpaidInvoices: invoiceBy[String(t._id)]?.invoices ?? 0,
    }))
    .filter((row) => row.outstandingInr > 0 || row.unpaidInvoices > 0);
}

function dateMatch(query) {
  const match = {};
  if (query.from || query.to) {
    match.createdAt = {};
    if (query.from) match.createdAt.$gte = new Date(query.from);
    if (query.to) match.createdAt.$lte = new Date(query.to);
  }
  return match;
}

export async function gmvReport({ query }) {
  const rows = await Order.aggregate([
    { $match: { status: { $nin: ['cancelled'] }, ...dateMatch(query) } },
    {
      $group: {
        _id: {
          tenantId: '$tenantId',
          month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        },
        gmvInr: { $sum: '$amountBreakdown.total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { '_id.month': 1 } },
  ]);

  const tenantIds = [...new Set(rows.map((r) => String(r._id.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name').lean();
  const tenantName = Object.fromEntries(tenants.map((t) => [String(t._id), t.name]));

  return {
    totalGmvInr: rows.reduce((sum, r) => sum + r.gmvInr, 0),
    rows: rows.map((r) => ({
      tenantId: r._id.tenantId,
      tenantName: tenantName[String(r._id.tenantId)] ?? '',
      month: r._id.month,
      gmvInr: r.gmvInr,
      orders: r.orders,
    })),
  };
}

/** Margin = sell − cost from the order-item snapshot (§3.8). */
export async function marginReport({ query }) {
  const rows = await Order.aggregate([
    { $match: { status: { $nin: ['cancelled'] }, ...dateMatch(query) } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$tenantId',
        revenueInr: { $sum: { $multiply: ['$items.unitPriceInr', '$items.qty'] } },
        costInr: { $sum: { $multiply: [{ $ifNull: ['$items.costPriceInr', 0] }, '$items.qty'] } },
      },
    },
  ]);

  const tenantIds = rows.map((r) => String(r._id));
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name').lean();
  const tenantName = Object.fromEntries(tenants.map((t) => [String(t._id), t.name]));

  const enriched = rows.map((r) => ({
    tenantId: r._id,
    tenantName: tenantName[String(r._id)] ?? '',
    revenueInr: r.revenueInr,
    costInr: r.costInr,
    marginInr: r.revenueInr - r.costInr,
    marginPct: r.revenueInr > 0 ? Math.round(((r.revenueInr - r.costInr) / r.revenueInr) * 10000) / 100 : 0,
  }));

  return {
    totalRevenueInr: enriched.reduce((s, r) => s + r.revenueInr, 0),
    totalCostInr: enriched.reduce((s, r) => s + r.costInr, 0),
    totalMarginInr: enriched.reduce((s, r) => s + r.marginInr, 0),
    rows: enriched,
  };
}

/** Flat GST line export across tax invoices, ready for filing. */
export async function gstExport({ query }) {
  const invoices = await Invoice.find({ type: 'tax', ...dateMatch(query) })
    .setOptions({ skipTenantGuard: true })
    .sort({ createdAt: 1 })
    .lean();

  const tenantIds = [...new Set(invoices.map((i) => String(i.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name gstin').lean();
  const tenantBy = Object.fromEntries(tenants.map((t) => [String(t._id), t]));

  const lines = [];
  for (const invoice of invoices) {
    for (const line of invoice.lineItems) {
      lines.push({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt,
        tenantName: tenantBy[String(invoice.tenantId)]?.name ?? '',
        receiverGstin: invoice.receiverGstin || tenantBy[String(invoice.tenantId)]?.gstin || '',
        description: line.description,
        hsnCode: line.hsnCode,
        quantity: line.quantity,
        taxableAmount: line.amount,
        gstRate: line.gstRate,
        gstAmount: Math.round(line.amount * (line.gstRate ?? 0)) / 100,
        totalAmount: invoice.totalAmount,
      });
    }
  }
  return { count: lines.length, lines };
}
