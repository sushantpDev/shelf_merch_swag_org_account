import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { Entity } from '../entities/entity.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { TRANSACTION_TYPES, WalletTransaction } from '../wallets/walletTransaction.model.js';
import { listWalletBalancesRead, listWalletTransactionsRead } from '../wallets/wallets.service.js';
import { visibleDepartmentIds } from './entitiesRead.js';
import { hidesOrganizationWallet } from './walletVisibility.js';

export const WALLET_BALANCES_DESCRIPTION = [
  'List ShelfMerch organization wallet balances for a company admin in the signed-in workspace.',
  'Company admins see every wallet. balance is organization cash. allocatedAmount is the total earmarked to departments. unallocatedAmount is balance minus allocatedAmount. fundingPending is true while a purchase-order funding request awaits finance approval.',
  'Entity managers do not receive organization wallet cash, the organization allocated total, or organization unallocated cash. Department allocated, spent, and remaining amounts come from entities_list.',
  'Funding documents, tax ids, contact details, and owner ids are not returned.',
].join(' ');

export const WALLET_TRANSACTIONS_DESCRIPTION = [
  'List ledger activity the caller is allowed to see for one wallet in the signed-in workspace.',
  'Company admins see the organization wallet ledger. availableAfter is the cash balance after the transaction minus allocations still outstanding.',
  'Entity managers see only allocations and spend for their own departments. balanceAfter and availableAfter are that department remaining budget, not organization cash. Organization funding and other departments are omitted. A wallet that is not one of their departments is not found.',
  'The actor, description, and related entity are not returned.',
].join(' ');

const walletBalanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  status: z.string(),
  balance: z.number(),
  allocatedAmount: z.number(),
  unallocatedAmount: z.number(),
  fundingPending: z.boolean(),
});

export const walletBalancesInputSchema = z.object({});

export const walletBalancesOutputSchema = z.object({
  items: z.array(walletBalanceSchema),
  scope: z.enum(['organization', 'department']).optional(),
});

export const walletTransactionsInputSchema = z.object({
  walletId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'walletId must be a wallet id')
    .describe('Wallet id. Company admins take it from wallet_list_balances. Department managers take it from entities_list. A wallet outside this account is not found.'),
  type: z.enum(TRANSACTION_TYPES).optional().describe('Ledger transaction type. Omitted types are not filtered.'),
  page: z.number().int().min(1).max(10_000).optional().describe('1-based page number. Default 1.'),
  limit: z.number().int().min(1).max(25).optional().describe('Page size. Default 10, maximum 25.'),
});

const walletTransactionSchema = z.object({
  type: z.string(),
  amount: z.number(),
  balanceAfter: z.number(),
  availableAfter: z.number(),
  createdAt: z.string(),
});

export const walletTransactionsOutputSchema = z.object({
  items: z.array(walletTransactionSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

const DEPARTMENT_TXN_TYPES = ['allocation_to_entity', 'campaign_spend', 'order_payment', 'refund'];
const DEPARTMENT_PAGE = { defaultLimit: 10, maxLimit: 25 };

export function walletReaderFromContext(ctx) {
  const authInfo = ctx?.http?.authInfo ?? ctx?.authInfo;
  const extra = authInfo?.extra ?? {};
  return {
    tenantId: extra.tenantId || null,
    user: {
      userId: extra.userId || null,
      role: extra.role,
      scopeType: extra.scopeType ?? null,
      scopeId: extra.scopeId ?? null,
      assignedEntityIds: Array.isArray(extra.assignedEntityIds) ? extra.assignedEntityIds.map(String) : [],
    },
  };
}

function readerOrThrow(ctx) {
  const reader = walletReaderFromContext(ctx);
  if (!reader.tenantId) throw new ForbiddenError('Wallets are not available for this account');
  return reader;
}

export async function listBalancesForCaller(ctx) {
  const reader = readerOrThrow(ctx);
  if (hidesOrganizationWallet(reader.user)) return { items: [], scope: 'department' };
  return listWalletBalancesRead({ tenantId: reader.tenantId });
}

function stamp(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Running department budget, matching the entity-manager budget history column. */
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

async function listDepartmentTransactions({ tenantId, user, walletId, query }) {
  const visible = await visibleDepartmentIds(tenantId, user);
  const wallet = await Wallet.findOne({ _id: walletId, tenantId }).select('_id').lean();
  if (!wallet || !visible?.length) throw new NotFoundError('Wallet not found');
  const departments = await Entity.find({
    tenantId,
    _id: { $in: visible },
    walletId: wallet._id,
  }).select('_id').lean();
  if (!departments.length) throw new NotFoundError('Wallet not found');

  const rows = await WalletTransaction.find({
    tenantId,
    walletId: wallet._id,
    relatedEntityId: { $in: departments.map((department) => department._id) },
    type: { $in: DEPARTMENT_TXN_TYPES },
  }).select('type amount createdAt').lean();
  const remaining = departmentRemainingById(rows);
  const filtered = query?.type ? rows.filter((row) => row.type === query.type) : rows;
  filtered.sort((a, b) => {
    const time = new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    if (time) return time;
    return String(b._id).localeCompare(String(a._id));
  });
  const { page, limit, skip } = getPagination(query ?? {}, DEPARTMENT_PAGE);
  const pageRows = filtered.slice(skip, skip + limit).map((row) => {
    const departmentRemaining = remaining.get(String(row._id)) ?? 0;
    return {
      type: String(row.type ?? ''),
      amount: Number(row.amount),
      balanceAfter: departmentRemaining,
      availableAfter: departmentRemaining,
      createdAt: stamp(row.createdAt),
    };
  });
  return paginatedResponse(pageRows, filtered.length, { page, limit });
}

export async function listTransactionsForCaller(ctx, args) {
  const reader = readerOrThrow(ctx);
  if (hidesOrganizationWallet(reader.user)) {
    return listDepartmentTransactions({
      tenantId: reader.tenantId,
      user: reader.user,
      walletId: args.walletId,
      query: args ?? {},
    });
  }
  return listWalletTransactionsRead({
    tenantId: reader.tenantId,
    walletId: args.walletId,
    query: args ?? {},
  });
}

export function walletBalancesText(output) {
  if (output.scope === 'department') {
    return 'Wallets.\nOrganization wallet balances are not available for this account. Department allocated, spent, and remaining amounts are on entities_list.';
  }
  if (!output.items.length) return 'Wallets.\nNo wallets.';
  const lines = output.items.map(
    (wallet) =>
      `${wallet.name} [${wallet.currency}] ${wallet.status} balance ${wallet.balance} allocated ${wallet.allocatedAmount} unallocated ${wallet.unallocatedAmount}${wallet.fundingPending ? ' funding pending' : ''}`,
  );
  return ['Wallets.', ...lines].join('\n');
}

export function walletTransactionsText(output) {
  const { items, pagination } = output;
  const header = `Wallet transactions. Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total).`;
  if (!items.length) return `${header}\nNo matching transactions.`;
  const lines = items.map(
    (row) => `${row.type} ${row.amount} balance ${row.balanceAfter} available ${row.availableAfter}`,
  );
  return [header, ...lines].join('\n');
}

export function walletToolError(err, fallback) {
  if (err instanceof NotFoundError) return 'Wallet not found.';
  if (err instanceof ForbiddenError) return err.message;
  return fallback;
}
