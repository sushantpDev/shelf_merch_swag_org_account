import mongoose from 'mongoose';
import { Wallet } from './wallet.model.js';
import { WalletTransaction } from './walletTransaction.model.js';
import { BudgetAllocationNotice } from './budgetAllocationNotice.model.js';
import { Entity } from '../entities/entity.model.js';
import * as entitiesService from '../entities/entities.service.js';
import * as ledger from '../../services/ledger.service.js';
import { uploadFile } from '../../services/storage.service.js';
import { transitionState, transitionThrough, validNextStatuses } from '../../services/stateMachine.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { scheduleSlackBusinessNotification, evaluateEntityLowBudgetAlert } from '../integrations/slack/slackNotify.service.js';
import { SLACK_EVENT_TYPES } from '../integrations/slack/slack.events.js';
import { User } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { sendBudgetAllocatedEmail } from '../../services/email.service.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

function withMeta(wallet) {
  const obj = wallet.toObject ? wallet.toObject() : wallet;
  return {
    ...obj,
    unallocatedAmount: obj.balance - obj.allocatedAmount,
    validNextStatuses: validNextStatuses('wallet', obj.status),
  };
}

export async function listWallets({ tenantId }) {
  const wallets = await Wallet.find({ tenantId }).sort({ createdAt: -1 });
  const repaired = await Promise.all(
    wallets.map((w) => ledger.repairWalletCaches({ tenantId, walletId: w._id })),
  );
  return repaired.filter(Boolean).map(withMeta);
}

function isEntityManager(user) {
  return user?.role === 'entity_manager' || user?.scopeType === 'entity';
}

function withoutOrganizationCash(wallet) {
  const obj = { ...(wallet.toObject ? wallet.toObject() : wallet) };
  delete obj.balance;
  delete obj.totalAmount;
  delete obj.allocatedAmount;
  delete obj.unallocatedAmount;
  if (obj.fundingDocument && typeof obj.fundingDocument === 'object') {
    obj.fundingDocument = { ...obj.fundingDocument };
    delete obj.fundingDocument.requestedAmount;
  }
  return obj;
}

async function departmentWalletIdsForManager(tenantId, user) {
  const dbUser = user?.userId
    ? await User.findOne({ _id: user.userId, tenantId }).select('email').lean()
    : null;
  const email = dbUser?.email?.toLowerCase();
  const or = [{ managerUserId: user.userId }];
  if (email) or.push({ managerEmail: email });
  const managed = user?.userId
    ? await Entity.find({ tenantId, $or: or }).select('_id').lean()
    : [];
  const ids = [...new Set([
    ...(user?.assignedEntityIds ?? []).map(String),
    ...managed.map((entity) => String(entity._id)),
  ])].filter(Boolean);
  if (!ids.length) return new Set();
  const entities = await Entity.find({ tenantId, _id: { $in: ids } }).select('walletId').lean();
  return new Set(entities.map((entity) => String(entity.walletId)).filter(Boolean));
}

function presentWallet(wallet) {
  const obj = wallet.toObject ? wallet.toObject() : wallet;
  return {
    ...obj,
    unallocatedAmount: obj.balance - obj.allocatedAmount,
    validNextStatuses: validNextStatuses('wallet', obj.status),
  };
}

/** Read model for HTTP callers. Entity managers do not receive organization cash. */
export async function listWalletsForCaller({ tenantId, user }) {
  const rows = await listWallets({ tenantId });
  if (!isEntityManager(user)) return rows;
  const allowed = await departmentWalletIdsForManager(tenantId, user);
  return rows.filter((row) => allowed.has(String(row._id))).map(withoutOrganizationCash);
}

export async function getWalletForCaller({ tenantId, walletId, user }) {
  const wallet = await getWallet({ tenantId, walletId });
  if (!isEntityManager(user)) return presentWallet(wallet);
  const allowed = await departmentWalletIdsForManager(tenantId, user);
  if (!allowed.has(String(wallet._id))) throw new NotFoundError('Wallet not found');
  return withoutOrganizationCash({
    ...wallet.toObject(),
    validNextStatuses: validNextStatuses('wallet', wallet.status),
  });
}

export async function getWallet({ tenantId, walletId }) {
  const wallet = await Wallet.findOne({ _id: walletId, tenantId });
  if (!wallet) throw new NotFoundError('Wallet not found');
  await ledger.repairWalletCaches({ tenantId, walletId });
  return Wallet.findOne({ _id: walletId, tenantId });
}

function walletContactPayload(data) {
  const payload = {};
  if (data.address != null) payload.address = String(data.address).trim();
  if (data.pinCode != null) payload.pinCode = String(data.pinCode).trim();
  if (data.mobileNumber != null) payload.mobileNumber = String(data.mobileNumber).trim();
  if (data.gstin != null) payload.gstin = String(data.gstin).trim().toUpperCase();
  return payload;
}

function remoteDocumentHosts() {
  const hosts = new Set();
  const add = (raw) => {
    if (!raw) return;
    try {
      hosts.add(new URL(raw).hostname.toLowerCase());
    } catch {
      // ignore malformed config
    }
  };
  add(env.S3_PUBLIC_BASE_URL);
  add(env.R2_ENDPOINT);
  if (env.S3_BUCKET_NAME && env.AWS_REGION) {
    add(`https://s3.${env.AWS_REGION}.amazonaws.com`);
    add(`https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com`);
  }
  return hosts;
}

/**
 * Tenant-scoped document URL from local uploads or configured S3/R2 hosts.
 * Used by MCP when the PO was already uploaded via the secure handoff (no multipart).
 */
export function assertTenantDocumentUrl(tenantId, url) {
  const value = String(url || '').trim();
  if (!value) {
    throw new ApiError(400, 'Document reference is required', 'INVALID_DOCUMENT_URL');
  }
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) {
    throw new ApiError(400, 'Document reference is not valid for this workspace', 'INVALID_DOCUMENT_URL');
  }
  const tid = String(tenantId);
  const marker = `/${tid}/document/`;
  const localPrefix = `/uploads${marker}`;
  if (value.startsWith(localPrefix) && value.length > localPrefix.length && !value.includes('?')) {
    return value;
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const parsed = new URL(value);
      const idx = parsed.pathname.indexOf(marker);
      const hostOk = remoteDocumentHosts().has(parsed.hostname.toLowerCase());
      if (hostOk && idx >= 0 && parsed.pathname.length > idx + marker.length) {
        return value;
      }
    } catch {
      // fall through
    }
  }
  throw new ApiError(400, 'Document reference is not valid for this workspace', 'INVALID_DOCUMENT_URL');
}

async function attachFundingDocument({ tenantId, wallet, file, documentUrl }) {
  if (file) {
    const { url } = await uploadFile({ tenantId, kind: 'document', file });
    wallet.fundingDocument.fileUrl = url;
    await wallet.save();
    return;
  }
  if (documentUrl) {
    wallet.fundingDocument.fileUrl = assertTenantDocumentUrl(tenantId, documentUrl);
    await wallet.save();
  }
}

export async function createWallet({ tenantId, userId, data }) {
  const wallet = await Wallet.create({
    tenantId,
    ownerUserId: userId,
    name: data.name,
    currency: data.currency,
    validFrom: data.validFrom,
    validTo: data.validTo,
    fundingMethod: data.fundingMethod,
    fundingDocument: data.fundingDocument ?? {},
    ...walletContactPayload(data),
  });
  return withMeta(wallet);
}

async function removeOrphanDraft({ tenantId, name }) {
  const orphan = await Wallet.findOne({
    tenantId,
    name: name.trim(),
    status: 'draft',
    balance: 0,
    allocatedAmount: 0,
    $or: [
      { 'fundingDocument.approvalStatus': '' },
      { 'fundingDocument.approvalStatus': { $exists: false } },
    ],
  });
  if (!orphan) return;
  const txnCount = await WalletTransaction.countDocuments({ tenantId, walletId: orphan._id });
  if (txnCount > 0) return;
  await orphan.softDelete();
}

/**
 * Atomic wallet wizard setup — create, upload PO, and submit funding in one
 * request. Rolls back the draft wallet if any step fails.
 */
export async function setupWallet({ tenantId, userId, data, file }) {
  const trimmedName = data.name.trim();

  // Idempotent retry — double-clicks or a failed client response must not spawn duplicates.
  const pending = await Wallet.findOne({
    tenantId,
    name: trimmedName,
    'fundingDocument.approvalStatus': 'pending',
    status: { $in: ['draft', 'wallet_created'] },
  });
  if (pending) {
    return withMeta(await getWallet({ tenantId, walletId: pending._id }));
  }

  const fundingMethod = data.fundingMethod ?? 'po_upload';

  // Draft exists but funding was never submitted to finance (e.g. client retry).
  const orphanDraft = await Wallet.findOne({
    tenantId,
    name: trimmedName,
    status: { $in: ['draft', 'wallet_created'] },
    balance: 0,
    $or: [
      { 'fundingDocument.approvalStatus': '' },
      { 'fundingDocument.approvalStatus': { $exists: false } },
    ],
  });
  if (orphanDraft && fundingMethod === 'po_upload' && data.amount > 0) {
    await attachFundingDocument({
      tenantId,
      wallet: orphanDraft,
      file,
      documentUrl: data.documentUrl,
    });
    await fundWallet({
      tenantId,
      walletId: orphanDraft._id,
      userId,
      amount: data.amount,
      description: 'Organization wallet setup funding',
      docType: data.docType,
      docNumber: data.docNumber,
    });
    return withMeta(await getWallet({ tenantId, walletId: orphanDraft._id }));
  }

  await removeOrphanDraft({ tenantId, name: trimmedName });

  let wallet = null;
  try {
    wallet = await Wallet.create({
      tenantId,
      ownerUserId: userId,
      name: trimmedName,
      currency: data.currency ?? 'INR',
      validFrom: data.validFrom,
      validTo: data.validTo,
      fundingMethod: data.fundingMethod ?? 'po_upload',
      fundingDocument: {
        docType: data.docType ?? '',
        docNumber: data.docNumber ?? '',
      },
      ...walletContactPayload(data),
    });

    const walletId = wallet._id;
    const setupFundingMethod = data.fundingMethod ?? 'po_upload';

    if (setupFundingMethod === 'po_upload') {
      await attachFundingDocument({
        tenantId,
        wallet,
        file,
        documentUrl: data.documentUrl,
      });
    }

    if (data.amount > 0 && setupFundingMethod === 'po_upload') {
      await fundWallet({
        tenantId,
        walletId,
        userId,
        amount: data.amount,
        description: 'Organization wallet setup funding',
        docType: data.docType,
        docNumber: data.docNumber,
      });
    }

    return withMeta(await getWallet({ tenantId, walletId }));
  } catch (err) {
    if (wallet?._id) {
      try {
        await deleteIncompleteWallet({ tenantId, walletId: wallet._id });
      } catch {
        // Best-effort cleanup; surface the original failure to the caller.
      }
    }
    throw err;
  }
}

export async function updateWallet({ tenantId, walletId, patch }) {
  const wallet = await getWallet({ tenantId, walletId });
  const before = wallet.toObject();
  // Status is never patchable — state machine only (§3.4).
  const { status: _ignored, fundingDocument, ...rest } = patch;
  if (fundingDocument && typeof fundingDocument === 'object') {
    if (Array.isArray(fundingDocument.plannedAllocations)) {
      wallet.fundingDocument.plannedAllocations = fundingDocument.plannedAllocations;
    }
    const { plannedAllocations: _pa, ...docRest } = fundingDocument;
    Object.assign(wallet.fundingDocument, docRest);
  }
  Object.assign(wallet, rest);
  await wallet.save();
  return { before, wallet: withMeta(wallet) };
}

/**
 * §7.4 /fund — PO uploads submit a finance approval request (no ledger credit until
 * platform finance approves). Online payments follow the same approval gate after Razorpay capture.
 */
export async function fundWallet({
  tenantId,
  walletId,
  userId,
  amount,
  description,
  fundingMethod,
  docType,
  docNumber,
}) {
  const wallet = await getWallet({ tenantId, walletId });

  if (fundingMethod === 'online') {
    throw new ApiError(
      422,
      'Online wallet funding must use Razorpay checkout',
      'USE_RAZORPAY',
    );
  }

  const method = fundingMethod ?? wallet.fundingMethod;

  if (method === 'po_upload') {
    if (wallet.fundingDocument.approvalStatus === 'pending') {
      throw new ApiError(
        422,
        'A funding request is already pending finance approval',
        'FUNDING_PENDING',
      );
    }
    wallet.fundingDocument.approvalStatus = 'pending';
    wallet.fundingDocument.requestedAmount = amount;
    if (docType) wallet.fundingDocument.docType = docType;
    if (docNumber) wallet.fundingDocument.docNumber = docNumber;
    if (wallet.status === 'draft') {
      transitionState('wallet', wallet, 'wallet_created', { userId });
    }
    await wallet.save();
    return {
      pending: true,
      transaction: null,
      wallet: withMeta(await getWallet({ tenantId, walletId })),
    };
  }

  const txn = await ledger.createTransaction({
    tenantId,
    walletId,
    type: 'fund_in',
    amount,
    description: description || `Wallet funded (${wallet.fundingMethod})`,
    performedBy: userId,
  });

  if (wallet.status === 'draft') {
    transitionState('wallet', wallet, 'wallet_created', { userId });
  }
  await wallet.save();

  return { transaction: txn, wallet: withMeta(await getWallet({ tenantId, walletId })) };
}

export async function uploadFundingDocument({ tenantId, walletId, file }) {
  if (!file) throw new ApiError(400, 'No document uploaded', 'MISSING_FILE');
  const wallet = await getWallet({ tenantId, walletId });
  const { url } = await uploadFile({ tenantId, kind: 'document', file });
  wallet.fundingDocument.fileUrl = url;
  await wallet.save();
  return { url, wallet: withMeta(wallet) };
}

let budgetNoticesReady;

async function claimBudgetNotice(tenantId, transactionId) {
  budgetNoticesReady ??= BudgetAllocationNotice.syncIndexes();
  await budgetNoticesReady;
  try {
    await BudgetAllocationNotice.create({ tenantId, transactionId });
    return true;
  } catch (err) {
    if (err?.code === 11000 || err?.cause?.code === 11000 || err?.errorResponse?.code === 11000) return false;
    throw err;
  }
}

export function allocationLedgerKey(walletId, entityId, requestKey) {
  const key = String(requestKey || "").trim();
  if (!key) return null;
  return "allocation:" + String(walletId) + ":" + String(entityId) + ":" + key;
}

export async function allocate({ tenantId, walletId, userId, allocations }) {
  const wallet = await getWallet({ tenantId, walletId });

  // Apply deallocations before increases so freed budget is available in the same batch.
  const ordered = [...allocations].sort((a, b) => a.amount - b.amount);
  const pending = [];
  const replayed = [];
  for (const line of ordered) {
    if (line.idempotencyKey) {
      const found = await WalletTransaction.findOne({ tenantId, idempotencyKey: line.idempotencyKey });
      if (found) {
        replayed.push(found);
        continue;
      }
    }
    pending.push(line);
  }
  const netIncrease = pending.reduce((sum, a) => sum + Math.max(0, a.amount), 0);
  const unallocated = wallet.balance - wallet.allocatedAmount;
  if (netIncrease > unallocated) {
    throw new ApiError(
      422,
      `Allocations exceed unallocated balance`,
      'ALLOCATION_EXCEEDS_BALANCE',
    );
  }

  const created = pending.length
    ? await ledger.allocateToEntities({
      tenantId,
      walletId,
      allocations: pending,
      performedBy: userId,
    })
    : [];
  const txns = [...replayed, ...created];

  const fresh = await getWallet({ tenantId, walletId });
  if (fresh.status === 'entities_added') {
    transitionState('wallet', fresh, 'budget_allocated', { userId });
    await fresh.save();
  }

  for (const txn of txns || []) {
    if (txn.type !== 'allocation_to_entity' || !(Number(txn.amount) > 0) || !txn.relatedEntityId) {
      continue;
    }
    const entity = await Entity.findOne({ _id: txn.relatedEntityId, tenantId }).setOptions({
      skipTenantGuard: true,
    });
    if (!entity) continue;
    scheduleSlackBusinessNotification({
      tenantId,
      type: SLACK_EVENT_TYPES.BUDGET_ASSIGNED,
      eventKey: `BUDGET_ASSIGNED:${txn._id}`,
      resourceType: 'WalletTransaction',
      resourceId: txn._id,
      actorUserId: userId,
      payload: {
        amount: txn.amount,
        entityName: entity.name,
        availableBudget: Math.max(0, (entity.allocatedAmount || 0) - (entity.spentAmount || 0)),
      },
    });
    evaluateEntityLowBudgetAlert({ tenantId, entityId: entity._id }).catch(() => {});

    // Notify active Entity Managers of additional budget (never an invitation).
    notifyActiveManagerBudgetAllocated({
      tenantId,
      entity,
      amount: txn.amount,
      transactionId: txn._id,
    }).catch((err) => {
      logger.warn({ err, entityId: entity._id }, 'Budget allocated email failed');
    });
  }

  return { transactions: txns, wallet: withMeta(fresh) };
}

async function notifyActiveManagerBudgetAllocated({ tenantId, entity, amount, transactionId }) {
  if (!entity?.managerUserId || !(Number(amount) > 0)) return;
  if (transactionId && !(await claimBudgetNotice(tenantId, transactionId))) return;
  if (entity.managerInvitePending) return;

  const manager = await User.findOne({ _id: entity.managerUserId, tenantId })
    .select('name email status')
    .lean();
  if (!manager || manager.status !== 'active' || !manager.email) return;

  const tenant = await Tenant.findById(tenantId).select('name').lean();
  const available = Math.max(0, (entity.allocatedAmount || 0) - (entity.spentAmount || 0));

  await sendBudgetAllocatedEmail({
    to: manager.email,
    recipientName: manager.name || entity.managerName || '',
    amount,
    newBalance: available,
    departmentName: entity.name || '',
    organizationName: tenant?.name || 'your organization',
    link: '/app/wallets',
  });
}

export async function transfer({ tenantId, walletId, toWalletId, amount, userId }) {
  await getWallet({ tenantId, walletId });
  await getWallet({ tenantId, walletId: toWalletId }); // both must belong to this tenant
  const result = await ledger.transferBetweenWallets({
    tenantId,
    fromWalletId: walletId,
    toWalletId,
    amount,
    performedBy: userId,
  });
  return { ...result, wallet: withMeta(await getWallet({ tenantId, walletId })) };
}

const WALLET_READ_PAGE = { defaultLimit: 10, maxLimit: 25 };

function walletBalanceItem(wallet) {
  const balance = Number(wallet.balance) || 0;
  const allocatedAmount = Number(wallet.allocatedAmount) || 0;
  const fundingApproval = String(wallet.fundingDocument?.approvalStatus || '');
  return {
    id: String(wallet._id),
    name: String(wallet.name ?? ''),
    currency: String(wallet.currency ?? 'INR'),
    status: String(wallet.status ?? ''),
    balance,
    allocatedAmount,
    unallocatedAmount: balance - allocatedAmount,
    fundingPending: fundingApproval === 'pending',
  };
}

/** Tenant wallets without repairing cached balances. */
export async function listWalletBalancesRead({ tenantId }) {
  const rows = await Wallet.find({ tenantId })
    .select('name currency status balance allocatedAmount fundingDocument.approvalStatus')
    .sort({ createdAt: -1 })
    .lean();
  return { items: rows.map(walletBalanceItem) };
}

async function queryWalletTransactions({ tenantId, walletId, query, pageOptions }) {
  const { page, limit, skip } = getPagination(query, pageOptions);
  const scope = {
    tenantId: new mongoose.Types.ObjectId(String(tenantId)),
    walletId: new mongoose.Types.ObjectId(String(walletId)),
  };
  const filter = { ...scope, ...(query.type ? { type: query.type } : {}) };
  const [items, total] = await Promise.all([
    WalletTransaction.aggregate([
      { $match: scope },
      // Include the entire ledger before filtering/pagination. Cash snapshots alone
      // do not account for earmarks, and a page may omit the opening funding.
      {
        $setWindowFields: {
          sortBy: { createdAt: 1, _id: 1 },
          output: {
            outstandingAllocation: {
              $sum: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$type', 'allocation_to_entity'] }, then: '$amount' },
                    {
                      case: {
                        $and: [
                          { $in: ['$type', ['campaign_spend', 'order_payment']] },
                          { $ne: ['$relatedEntityId', null] },
                          { $lt: ['$amount', 0] },
                        ],
                      },
                      then: '$amount',
                    },
                  ],
                  default: 0,
                },
              },
              window: { documents: ['unbounded', 'current'] },
            },
          },
        },
      },
      { $set: { availableAfter: { $subtract: ['$balanceAfter', '$outstandingAllocation'] } } },
      { $unset: 'outstandingAllocation' },
      ...(query.type ? [{ $match: { type: query.type } }] : []),
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]),
    WalletTransaction.countDocuments(filter),
  ]);
  return paginatedResponse(items, total, { page, limit });
}

export async function listTransactions({ tenantId, walletId, query }) {
  const wallet = await getWallet({ tenantId, walletId });
  return queryWalletTransactions({
    tenantId: wallet.tenantId,
    walletId: wallet._id,
    query,
  });
}

const DEPARTMENT_TXN_TYPES = ['allocation_to_entity', 'campaign_spend', 'order_payment', 'refund'];

function departmentRemainingById(rows) {
  const chronological = [...rows].sort((a, b) => {
    const time = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
    if (time) return time;
    return String(a._id).localeCompare(String(b._id));
  });
  let allocated = 0;
  let spent = 0;
  const remaining = new Map();
  for (const row of chronological) {
    if (row.type === 'allocation_to_entity') allocated += Number(row.amount) || 0;
    else if (row.type === 'campaign_spend' || row.type === 'order_payment') spent += Math.abs(Number(row.amount) || 0);
    remaining.set(String(row._id), allocated - spent);
  }
  return remaining;
}

async function listDepartmentWalletTransactions({ tenantId, user, walletId, query }) {
  const allowed = await departmentWalletIdsForManager(tenantId, user);
  const wallet = await Wallet.findOne({ _id: walletId, tenantId }).select('_id').lean();
  if (!wallet || !allowed.has(String(wallet._id))) throw new NotFoundError('Wallet not found');
  const departments = await Entity.find({ tenantId, walletId: wallet._id }).select('_id').lean();
  const visibleIds = [];
  const managerIds = await (async () => {
    const dbUser = user?.userId
      ? await User.findOne({ _id: user.userId, tenantId }).select('email').lean()
      : null;
    const email = dbUser?.email?.toLowerCase();
    const or = [{ managerUserId: user.userId }];
    if (email) or.push({ managerEmail: email });
    const managed = user?.userId
      ? await Entity.find({ tenantId, walletId: wallet._id, $or: or }).select('_id').lean()
      : [];
    return new Set([
      ...(user?.assignedEntityIds ?? []).map(String),
      ...managed.map((entity) => String(entity._id)),
    ]);
  })();
  for (const department of departments) {
    if (managerIds.has(String(department._id))) visibleIds.push(department._id);
  }
  const rows = visibleIds.length
    ? await WalletTransaction.find({
      tenantId,
      walletId: wallet._id,
      relatedEntityId: { $in: visibleIds },
      type: { $in: DEPARTMENT_TXN_TYPES },
    }).select('type amount description createdAt').lean()
    : [];
  const remaining = departmentRemainingById(rows);
  const filtered = query?.type ? rows.filter((row) => row.type === query.type) : rows;
  filtered.sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
  const { page, limit, skip } = getPagination(query ?? {});
  const pageRows = filtered.slice(skip, skip + limit).map((row) => ({
    _id: row._id,
    type: row.type,
    amount: row.amount,
    description: row.description || '',
    createdAt: row.createdAt,
    availableAfter: remaining.get(String(row._id)) ?? 0,
  }));
  return paginatedResponse(pageRows, filtered.length, { page, limit });
}

export async function listTransactionsForCaller({ tenantId, walletId, query, user }) {
  if (!isEntityManager(user)) return listTransactions({ tenantId, walletId, query });
  return listDepartmentWalletTransactions({ tenantId, user, walletId, query });
}

function walletTransactionStamp(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Ledger page for one tenant wallet. Does not repair wallet caches. */
export async function listWalletTransactionsRead({ tenantId, walletId, query }) {
  const wallet = await Wallet.findOne({ _id: walletId, tenantId }).select('_id').lean();
  if (!wallet) throw new NotFoundError('Wallet not found');
  const page = await queryWalletTransactions({
    tenantId,
    walletId: wallet._id,
    query,
    pageOptions: WALLET_READ_PAGE,
  });
  return {
    ...page,
    items: page.items.map((row) => ({
      type: String(row.type ?? ''),
      amount: Number(row.amount),
      balanceAfter: Number(row.balanceAfter),
      availableAfter: Number(row.availableAfter),
      createdAt: walletTransactionStamp(row.createdAt),
    })),
  };
}

/** §7.4 /activate — only allowed once every setup step is complete. */
/** Remove a wallet that was created but never funded (wizard rollback). */
export async function deleteIncompleteWallet({ tenantId, walletId }) {
  const wallet = await getWallet({ tenantId, walletId });
  if (wallet.status !== 'draft') {
    throw new ApiError(422, 'Only incomplete draft wallets can be removed', 'WALLET_NOT_DELETABLE');
  }
  if (wallet.balance !== 0 || wallet.allocatedAmount !== 0) {
    throw new ApiError(422, 'Wallet has funds or allocations', 'WALLET_NOT_DELETABLE');
  }
  const txnCount = await WalletTransaction.countDocuments({ tenantId, walletId });
  if (txnCount > 0) {
    throw new ApiError(422, 'Wallet has ledger activity', 'WALLET_NOT_DELETABLE');
  }
  await wallet.softDelete();
  return wallet;
}

export async function activate({ tenantId, walletId, userId }) {
  const wallet = await getWallet({ tenantId, walletId });
  if (wallet.status === 'active') {
    return withMeta(wallet);
  }

  const walletEntityIds = await Entity.find({ tenantId, walletId }).distinct('_id');
  const ledgerEntityIds = await WalletTransaction.find({
    tenantId,
    walletId,
    relatedEntityId: { $ne: null },
  }).distinct('relatedEntityId');
  const entityIds = [...new Set([...walletEntityIds, ...ledgerEntityIds].map(String))];
  const entities = entityIds.length
    ? await Entity.find({ tenantId, _id: { $in: entityIds } })
    : [];
  const fundedEntities = entities.filter((e) => e.allocatedAmount > 0);
  const hasManager = (e) =>
    Boolean(e.managerUserId || e.managerName?.trim() || e.managerEmail?.trim());

  const problems = [];
  if (wallet.balance <= 0) problems.push('Wallet has no funds');
  if (fundedEntities.length === 0) problems.push('No budget allocated to entities');
  const unmanaged = fundedEntities.filter((e) => !hasManager(e));
  if (unmanaged.length) {
    problems.push(`Departments without a manager: ${unmanaged.map((e) => e.name).join(', ')}`);
  }
  if (problems.length) {
    throw new ApiError(422, 'Wallet setup incomplete', 'WALLET_SETUP_INCOMPLETE', problems);
  }

  transitionThrough('wallet', wallet, 'active', { userId });
  await wallet.save();
  return withMeta(wallet);
}

export async function ensureSpendEntity(params) {
  return entitiesService.ensureSpendEntity(params);
}
