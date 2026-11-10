import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { ORDER_STATUSES } from '../orders/order.model.js';
import { getOrderRead, searchOrdersRead } from '../orders/orders.service.js';

export const ORDERS_SEARCH_DESCRIPTION = [
  'Search ShelfMerch orders for the signed-in workspace.',
  'unitPriceInr is the GST-inclusive selling price in rupees stored on the order.',
  'Company admins see the workspace. Entity managers see orders for campaigns in their assigned entities.',
  'Cost, vendor, internal notes, recipient email, phone, and shipping address are not returned.',
].join(' ');

export const ORDERS_GET_DESCRIPTION = [
  'Look up one ShelfMerch order by id.',
  'Uses the same workspace and entity rules as orders_search, and adds the recipient name.',
  'unitPriceInr is the GST-inclusive selling price in rupees stored on the order.',
  'Cost, vendor, internal notes, recipient email, phone, and shipping address are not returned.',
].join(' ');

const amountBreakdownSchema = z.object({
  subtotal: z.number().int(),
  packaging: z.number().int(),
  shipping: z.number().int(),
  serviceFee: z.number().int(),
  gst: z.number().int(),
  total: z.number().int(),
});

const orderItemSchema = z.object({
  name: z.string(),
  sku: z.string(),
  variant: z.object({
    size: z.string(),
    color: z.string(),
  }),
  quantity: z.number(),
  unitPriceInr: z.number().int(),
});

const orderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  campaignName: z.string(),
  items: z.array(orderItemSchema),
  amountBreakdown: amountBreakdownSchema,
  trackingNumber: z.string(),
  invoiceNumber: z.string(),
});

export const ordersSearchInputSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional().describe('Order status. Omitted statuses are not filtered.'),
  page: z.number().int().min(1).max(10_000).optional().describe('1-based page number. Default 1.'),
  limit: z.number().int().min(1).max(25).optional().describe('Page size. Default 10, maximum 25.'),
});

export const ordersSearchOutputSchema = z.object({
  items: z.array(orderSummarySchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const ordersGetInputSchema = z.object({
  orderId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, 'orderId must be an order id')
    .describe('Order id from orders_search.'),
});

export const ordersGetOutputSchema = orderSummarySchema.extend({
  recipientName: z.string(),
});

export function orderReaderFromContext(ctx) {
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

export async function searchOrdersForCaller(ctx, args) {
  const reader = orderReaderFromContext(ctx);
  if (!reader.tenantId) {
    const error = new ForbiddenError('Orders are not available for this account');
    throw error;
  }
  return searchOrdersRead({ tenantId: reader.tenantId, user: reader.user, query: args ?? {} });
}

export async function getOrderForCaller(ctx, orderId) {
  const reader = orderReaderFromContext(ctx);
  if (!reader.tenantId) throw new ForbiddenError('Orders are not available for this account');
  return getOrderRead({ tenantId: reader.tenantId, user: reader.user, orderId });
}

function itemLine(item) {
  const variant = [item.variant.size, item.variant.color].filter(Boolean).join('/');
  const variantNote = variant ? ` ${variant}` : '';
  return `${item.name} [${item.sku}]${variantNote} x${item.quantity} ₹${item.unitPriceInr} incl. GST`;
}

export function ordersSearchText(output) {
  const { items, pagination } = output;
  const header = `Orders. Prices are GST-inclusive rupees. Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total).`;
  if (!items.length) return `${header}\nNo matching orders.`;
  const lines = items.map((order) => {
    const products = order.items.map(itemLine).join('; ');
    return `${order.orderNumber} ${order.status} ${order.campaignName} ${products} invoice ${order.invoiceNumber}`;
  });
  return [header, ...lines].join('\n');
}

export function orderDetailText(order) {
  const products = order.items.map(itemLine).join('; ');
  return [
    'Order. Prices are GST-inclusive rupees.',
    `${order.orderNumber} ${order.status} ${order.campaignName} recipient ${order.recipientName}`,
    products,
    `invoice ${order.invoiceNumber}`,
  ].join('\n');
}

export function orderToolError(err, fallback) {
  if (err instanceof NotFoundError) return 'Order not found.';
  if (err instanceof ForbiddenError) return err.message;
  return fallback;
}
