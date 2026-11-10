import { Order, sanitizeOrderItems } from './order.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { OrderInvoice } from '../orderInvoices/orderInvoice.model.js';
import { transitionState, validNextStatuses } from '../../services/stateMachine.service.js';
import { amountBreakdownForKitCampaign } from '../../services/pricing.service.js';
import { ApiError, NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { scheduleOrderDispatchedSlackNotification } from '../integrations/slack/slackNotify.service.js';

/**
 * §3.5 — tenants only keep the mockup quality gate. Every other transition is
 * platform-only via /platform/orders/:id/status.
 */
const TENANT_ALLOWED_STATUSES = ['mockup_approved', 'issue_raised'];

async function campaignIdsForUser(tenantId, user) {
  if (user.scopeType !== 'entity') return null;
  const campaigns = await Campaign.find({
    tenantId,
    entityId: { $in: user.assignedEntityIds ?? [] },
  }).select('_id');
  return campaigns.map((c) => c._id);
}

async function assertOrderAccess({ tenantId, user, order }) {
  if (user.scopeType !== 'entity') return;
  const campaign = await Campaign.findOne({ _id: order.campaignId, tenantId }).select('entityId');
  if (!campaign) throw new NotFoundError('Order not found');
  const allowed = (user.assignedEntityIds ?? []).map(String);
  if (!allowed.includes(String(campaign.entityId))) {
    throw new ForbiddenError('You do not have access to this order');
  }
}

/**
 * Ensure kit order totals match the campaign checkout / wallet debit.
 * Repairs legacy orders that stored item+fee+GST only (missing packaging/shipping).
 * When an invoice exists, leave amountBreakdown.total alone — invoice ceil is source of truth.
 */
function alignKitOrderBreakdown(order, campaign, { hasInvoice = false } = {}) {
  if (!campaign || campaign.type !== 'kit') return order.amountBreakdown;
  if (hasInvoice) return order.amountBreakdown;

  const paid = Math.round(Number(campaign.totalBudget) || 0);
  if (paid <= 0) return order.amountBreakdown;

  const recipients = Math.max(1, Number(campaign.recipientCount) || 1);
  const orderKitCount = campaign.fulfillmentMode === 'single' ? recipients : 1;
  const itemsSubtotal = (order.items || []).reduce(
    (sum, i) => sum + Number(i.unitPriceInr || 0) * Number(i.qty || 0),
    0,
  );
  const kitUnitPriceInr = orderKitCount > 0 ? itemsSubtotal / orderKitCount : itemsSubtotal;

  const breakdown = amountBreakdownForKitCampaign(campaign, {
    kitUnitPriceInr,
    packaging: campaign.packaging,
    orderKitCount,
  });

  const current = Math.round(Number(order.amountBreakdown?.total) || 0);
  if (current !== breakdown.total) {
    // Persist repair so DB matches Checkout / Wallet going forward.
    Order.updateOne(
      { _id: order._id, tenantId: order.tenantId },
      { $set: { amountBreakdown: breakdown } },
    ).catch(() => {});
  }
  return breakdown;
}

function withMeta(order, extras = {}) {
  const obj = order.toObject ? order.toObject() : order;
  const { internalNotes, ...safe } = obj; // internal notes are platform-only
  const amountBreakdown = extras.amountBreakdown ?? obj.amountBreakdown;
  return {
    ...safe,
    items: sanitizeOrderItems(obj.items ?? []),
    validNextStatuses: validNextStatuses('order', obj.status),
    ...extras,
    amountBreakdown,
  };
}

export async function listOrders({ tenantId, user, query }) {
  // Heal surprise/single kit campaigns that launched before order creation
  // succeeded (e.g. curated KIT_EMPTY) so Orders pages stay complete.
  try {
    const { repairMissingKitFulfillmentOrders } = await import('../redemptions/redemptions.service.js');
    await repairMissingKitFulfillmentOrders({ tenantId });
  } catch (err) {
    console.error('repairMissingKitFulfillmentOrders failed:', err);
  }

  const { page, limit, skip } = getPagination(query);
  const filter = { tenantId };
  if (query.status) filter.status = query.status;

  const scopedCampaignIds = await campaignIdsForUser(tenantId, user);
  if (scopedCampaignIds) {
    if (!scopedCampaignIds.length) {
      return paginatedResponse([], 0, { page, limit });
    }
    filter.campaignId = { $in: scopedCampaignIds };
  }

  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  const campaignIds = [...new Set(items.map((o) => String(o.campaignId)))];
  const orderIds = items.map((o) => o._id);
  const [campaigns, invoices] = await Promise.all([
    Campaign.find({ _id: { $in: campaignIds }, tenantId }).select(
      'name entityId type totalBudget recipientCount fulfillmentMode packaging shopId',
    ),
    OrderInvoice.find({ orderId: { $in: orderIds }, tenantId })
      .select('orderId pdfUrl invoiceNumber')
      .lean(),
  ]);
  const campaignById = Object.fromEntries(campaigns.map((c) => [String(c._id), c]));
  const invoiceByOrderId = Object.fromEntries(invoices.map((i) => [String(i.orderId), i]));

  const enriched = items.map((o) => {
    const campaign = campaignById[String(o.campaignId)];
    const invoice = invoiceByOrderId[String(o._id)];
    const amountBreakdown = alignKitOrderBreakdown(o, campaign, { hasInvoice: Boolean(invoice) });
    return withMeta(o, {
      campaignName: campaign?.name ?? '',
      amountBreakdown,
      invoicePdfUrl: invoice?.pdfUrl || '',
      invoiceNumber: invoice?.invoiceNumber || o.orderNumber,
    });
  });

  return paginatedResponse(enriched, total, { page, limit });
}

export async function getOrder({ tenantId, user, orderId }) {
  const order = await Order.findOne({ _id: orderId, tenantId });
  if (!order) throw new NotFoundError('Order not found');
  await assertOrderAccess({ tenantId, user, order });

  const [campaign, recipient, invoice] = await Promise.all([
    Campaign.findOne({ _id: order.campaignId, tenantId }).select(
      'name entityId type totalBudget recipientCount fulfillmentMode packaging shopId',
    ),
    Recipient.findOne({ _id: order.recipientId, tenantId }).select('name email'),
    OrderInvoice.findOne({ orderId: order._id, tenantId }).select('pdfUrl invoiceNumber').lean(),
  ]);

  const lean = order.toObject();
  const amountBreakdown = alignKitOrderBreakdown(lean, campaign, {
    hasInvoice: Boolean(invoice),
  });

  return withMeta(order, {
    campaignName: campaign?.name ?? '',
    recipient: recipient ? { name: recipient.name, email: recipient.email } : null,
    amountBreakdown,
    invoicePdfUrl: invoice?.pdfUrl || '',
    invoiceNumber: invoice?.invoiceNumber || order.orderNumber,
  });
}

const ORDER_READ_PAGE = { defaultLimit: 10, maxLimit: 25 };

function publicOrderItem(item) {
  const [safe] = sanitizeOrderItems([item]);
  const variant = safe?.variant ?? {};
  return {
    name: String(safe?.name ?? ''),
    sku: String(safe?.sku ?? ''),
    variant: {
      size: variant.size ? String(variant.size) : '',
      color: variant.color ? String(variant.color) : '',
    },
    quantity: Number(safe?.qty ?? 0),
    unitPriceInr: Math.round(Number(safe?.unitPriceInr) || 0),
  };
}

function publicAmountBreakdown(amount) {
  const value = (field) => Math.round(Number(amount?.[field]) || 0);
  return {
    subtotal: value('subtotal'),
    packaging: value('packaging'),
    shipping: value('shipping'),
    serviceFee: value('serviceFee'),
    gst: value('gst'),
    total: value('total'),
  };
}

function publicOrderSummary(order, { campaignName, invoiceNumber }) {
  return {
    id: String(order._id),
    orderNumber: String(order.orderNumber ?? ''),
    status: String(order.status ?? ''),
    campaignName: campaignName ?? '',
    items: (order.items ?? []).map(publicOrderItem),
    amountBreakdown: publicAmountBreakdown(order.amountBreakdown),
    trackingNumber: String(order.trackingNumber ?? ''),
    invoiceNumber: String(invoiceNumber || order.orderNumber || ''),
  };
}

async function invoiceNumbersByOrder(tenantId, orderIds) {
  const invoices = await OrderInvoice.find({ orderId: { $in: orderIds }, tenantId })
    .select('orderId invoiceNumber')
    .lean();
  return Object.fromEntries(invoices.map((invoice) => [String(invoice.orderId), invoice.invoiceNumber]));
}

/**
 * Read-only order page. Does not repair kit fulfillment and does not rewrite
 * amount breakdowns. Callers must not pass this result through listOrders.
 */
export async function searchOrdersRead({ tenantId, user, query }) {
  const { page, limit, skip } = getPagination(query, ORDER_READ_PAGE);
  const filter = { tenantId };
  if (query.status) filter.status = query.status;

  const scopedCampaignIds = await campaignIdsForUser(tenantId, user);
  if (scopedCampaignIds) {
    if (!scopedCampaignIds.length) return paginatedResponse([], 0, { page, limit });
    filter.campaignId = { $in: scopedCampaignIds };
  }

  const [rows, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  const campaignIds = [...new Set(rows.map((order) => String(order.campaignId)))];
  const [campaigns, invoiceByOrderId] = await Promise.all([
    Campaign.find({ _id: { $in: campaignIds }, tenantId }).select('name').lean(),
    invoiceNumbersByOrder(tenantId, rows.map((order) => order._id)),
  ]);
  const campaignNameById = Object.fromEntries(campaigns.map((campaign) => [String(campaign._id), campaign.name]));
  const items = rows.map((order) =>
    publicOrderSummary(order, {
      campaignName: campaignNameById[String(order.campaignId)] ?? '',
      invoiceNumber: invoiceByOrderId[String(order._id)],
    }),
  );
  return paginatedResponse(items, total, { page, limit });
}

/** Read-only order detail. Uses the same access checks as getOrder and does not write. */
export async function getOrderRead({ tenantId, user, orderId }) {
  const order = await Order.findOne({ _id: orderId, tenantId }).lean();
  if (!order) throw new NotFoundError('Order not found');
  await assertOrderAccess({ tenantId, user, order });

  const [campaign, recipient, invoiceByOrderId] = await Promise.all([
    Campaign.findOne({ _id: order.campaignId, tenantId }).select('name').lean(),
    Recipient.findOne({ _id: order.recipientId, tenantId }).select('name').lean(),
    invoiceNumbersByOrder(tenantId, [order._id]),
  ]);
  return {
    ...publicOrderSummary(order, {
      campaignName: campaign?.name ?? '',
      invoiceNumber: invoiceByOrderId[String(order._id)],
    }),
    recipientName: recipient?.name ?? '',
  };
}

export async function updateOrderStatus({ tenantId, user, orderId, status, note, trackingNumber }) {
  const order = await Order.findOne({ _id: orderId, tenantId });
  if (!order) throw new NotFoundError('Order not found');

  // Platform users (impersonating or not) keep full control; tenant admins
  // only retain the mockup approve/reject gate and raising an issue (§3.5).
  const isPlatform = String(user.role ?? '').startsWith('platform_');
  if (!isPlatform && !TENANT_ALLOWED_STATUSES.includes(status)) {
    throw new ApiError(
      403,
      'Order status changes are managed by ShelfMerch operations. You can only approve/reject mockups or raise an issue.',
      'PLATFORM_ONLY_TRANSITION',
    );
  }

  const priorStatus = order.status;
  transitionState('order', order, status, { userId: user.userId }, note);
  if (trackingNumber) order.trackingNumber = trackingNumber;
  await order.save();
  scheduleOrderDispatchedSlackNotification(
    order,
    priorStatus !== 'shipped' && order.status === 'shipped',
  );

  return getOrder({ tenantId, user, orderId: order._id });
}
