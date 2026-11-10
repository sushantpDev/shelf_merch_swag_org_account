import { SupportTicket } from './supportTicket.model.js';
import { Order } from '../orders/order.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Shipment } from '../shipments/shipment.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { User } from '../users/user.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { notify } from '../notifications/notifications.service.js';
import { transitionState, canTransition } from '../../services/stateMachine.service.js';
import { sendNotificationEmail, appUrl } from '../../services/email.service.js';
import { logger } from '../../config/logger.js';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';

/** Roles that staff the help desk (see platformAccess MATRIX support.write + super). */
const SUPPORT_STAFF_ROLES = ['platform_super_admin', 'platform_ops_admin', 'platform_support_agent'];

/** Best-effort delivery: log notification errors without failing the support request. */
function notifyAsync(payload) {
  return notify(payload).catch((err) =>
    logger.warn({ err: err?.message }, 'support notification delivery failed'),
  );
}

async function userName(userId) {
  if (!userId) return '';
  const user = await User.findOne({ _id: userId }).select('name').lean();
  return user?.name ?? '';
}

/** In-app ping to everyone staffing the help desk. */
async function notifySupportStaff({ ticket, title, body }) {
  const staff = await RoleAssignment.find({
    scopeType: 'platform',
    role: { $in: SUPPORT_STAFF_ROLES },
  })
    .select('userId')
    .lean();
  const seen = new Set();
  for (const s of staff) {
    const id = String(s.userId);
    if (seen.has(id)) continue;
    seen.add(id);
    notifyAsync({
      type: 'support_ticket',
      tenantId: ticket.tenantId,
      userId: s.userId,
      title,
      body,
      link: '/platform/support',
    });
  }
}

/** In-app (and optionally email) update to the user who raised the ticket. */
async function notifyRaiser(ticket, { title, body, withEmail = false }) {
  if (!ticket.raisedByUserId) {
    // Employee (recipient) tickets: no User account, no in-app inbox — email only.
    if (ticket.source !== 'recipient' || !ticket.relatedRecipientId) return;
    const recipient = await Recipient.findOne({
      _id: ticket.relatedRecipientId,
      tenantId: ticket.tenantId,
    })
      .setOptions({ skipTenantGuard: true })
      .select('email')
      .lean();
    if (!recipient?.email) return;
    await notifyAsync({
      type: 'support_ticket_update',
      tenantId: ticket.tenantId,
      email: recipient.email,
      title,
      body: body || 'Open your gift link and go to Support to view the update.',
      link: '',
    });
    return;
  }
  let email = null;
  if (withEmail) {
    const user = await User.findOne({ _id: ticket.raisedByUserId }).select('email').lean();
    email = user?.email ?? null;
  }
  await notifyAsync({
    type: 'support_ticket_update',
    tenantId: ticket.tenantId,
    userId: ticket.raisedByUserId,
    email,
    title,
    body,
    link: '/app/support',
  });
}

/** Tenant-safe projection: internal notes are platform-only. */
export function toTenantView(ticket) {
  const obj = ticket.toObject ? ticket.toObject() : ticket;
  return { ...obj, messages: (obj.messages ?? []).filter((m) => !m.internal) };
}

/** Department assignee view: only the internal Support ↔ department thread. */
export function toInternalThreadView(ticket) {
  const obj = ticket.toObject ? ticket.toObject() : ticket;
  return { ...obj, messages: (obj.messages ?? []).filter((m) => m.internal) };
}

function buildFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.type) filter.type = query.type;
  if (query.assignedToUserId) filter.assignedToUserId = query.assignedToUserId;
  else if (query.unassigned) filter.assignedToUserId = null;
  return filter;
}

export async function listSupportTickets({ query, tenantId = null }) {
  const { page, limit, skip } = getPagination(query);
  const filter = buildFilter(query);
  if (tenantId) filter.tenantId = tenantId;

  const opts = tenantId ? {} : { skipTenantGuard: true };
  const [items, total] = await Promise.all([
    SupportTicket.find(filter)
      .setOptions(opts)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(filter).setOptions(opts),
  ]);

  return paginatedResponse(items, total, { page, limit });
}

/** Platform queue with tenant + assignee names resolved for the agent console. */
export async function listSupportTicketsWithTenants({ query }) {
  const result = await listSupportTickets({ query });
  const tenantIds = [...new Set(result.items.map((t) => String(t.tenantId)).filter(Boolean))];
  const assigneeIds = [
    ...new Set(result.items.map((t) => t.assignedToUserId && String(t.assignedToUserId)).filter(Boolean)),
  ];
  const [tenants, assignees] = await Promise.all([
    tenantIds.length ? Tenant.find({ _id: { $in: tenantIds } }).select('name').lean() : [],
    assigneeIds.length ? User.find({ _id: { $in: assigneeIds } }).select('name').lean() : [],
  ]);
  const tenantById = new Map(tenants.map((t) => [String(t._id), t.name]));
  const assigneeById = new Map(assignees.map((u) => [String(u._id), u.name]));
  result.items = result.items.map((t) => ({
    ...t,
    tenantName: tenantById.get(String(t.tenantId)) ?? '',
    assigneeName: t.assignedToUserId ? (assigneeById.get(String(t.assignedToUserId)) ?? '') : '',
  }));
  return result;
}

/** Full ticket for the platform manage modal: tenant + raiser names resolved. */
export async function getSupportTicketDetail(ticketId, { isSupportWriter = true } = {}) {
  const ticket = await getSupportTicket(ticketId);
  const [tenant, raiser, recipient, assignee] = await Promise.all([
    ticket.tenantId ? Tenant.findById(ticket.tenantId).select('name').lean() : null,
    ticket.raisedByUserId
      ? User.findOne({ _id: ticket.raisedByUserId }).select('name email').lean()
      : null,
    // Employee-raised tickets have no raiser User — show the recipient instead.
    !ticket.raisedByUserId && ticket.relatedRecipientId
      ? Recipient.findOne({ _id: ticket.relatedRecipientId, tenantId: ticket.tenantId })
          .setOptions({ skipTenantGuard: true })
          .select('name email')
          .lean()
      : null,
    ticket.assignedToUserId
      ? User.findOne({ _id: ticket.assignedToUserId }).select('name').lean()
      : null,
  ]);
  const base = isSupportWriter ? ticket.toObject() : toInternalThreadView(ticket);
  return {
    ...base,
    tenantName: tenant?.name ?? '',
    raisedByName: raiser?.name ?? recipient?.name ?? '',
    raisedByEmail: raiser?.email ?? recipient?.email ?? '',
    assigneeName: assignee?.name ?? '',
  };
}

/** Tenant help center: list the workspace's own tickets (internal notes stripped). */
export async function listTenantTickets({ tenantId, query }) {
  const result = await listSupportTickets({ query, tenantId });
  result.items = result.items.map(toTenantView);
  return result;
}

/** Tenant help center: one own ticket with the public conversation. */
export async function getTenantTicket({ ticketId, tenantId }) {
  const ticket = await getSupportTicket(ticketId, { tenantId });
  return toTenantView(ticket);
}

/**
 * Tenant reply: never internal, reopens a waiting/resolved ticket, pings the
 * support desk (admin ↔ support is 1:1 — department handlers are not notified).
 */
export async function addTenantMessage({ ticketId, tenantId, userId, body }) {
  const ticket = await getSupportTicket(ticketId, { tenantId });
  if (ticket.status === 'closed') {
    throw new ApiError(422, 'This ticket is closed — please open a new one', 'TICKET_CLOSED');
  }

  ticket.messages.push({
    authorUserId: userId,
    authorName: await userName(userId),
    fromPlatform: false,
    body,
    internal: false,
    at: new Date(),
  });
  if (['waiting_on_customer', 'resolved'].includes(ticket.status)) {
    transitionState('supportTicket', ticket, 'in_progress', { userId }, 'Customer replied');
  }
  await ticket.save();

  await notifyAgentsOfReply(ticket, body);
  return toTenantView(ticket);
}

/**
 * Admin/customer replies always notify the support desk — never the department
 * handler on assignedToUserId. Assignment is support → departments (internal);
 * the customer channel stays admin ↔ support.
 */
async function notifyAgentsOfReply(ticket, body) {
  await notifySupportStaff({
    ticket,
    title: `Customer replied: ${ticket.subject}`,
    body: body.slice(0, 200),
  });
}

/** Employee help center: the recipient's own tickets (internal notes stripped). */
export async function listRecipientTickets({ tenantId, recipientId }) {
  const tickets = await SupportTicket.find({
    tenantId,
    relatedRecipientId: recipientId,
    source: 'recipient',
  })
    .sort({ createdAt: -1 })
    .lean();
  return { items: tickets.map(toTenantView) };
}

/** Employee help center: raise a ticket from the redemption store. */
export async function createRecipientTicket({ recipient, subject, description, type }) {
  const ticket = await createSupportTicket({
    tenantId: recipient.tenantId,
    userId: null,
    subject,
    description,
    type,
    source: 'recipient',
    relatedRecipientId: recipient._id,
  });
  return toTenantView(ticket);
}

/**
 * Employee reply: never internal, reopens a waiting/resolved ticket, pings the
 * support desk (same admin/customer ↔ support channel as tenant replies).
 */
export async function addRecipientMessage({ ticketId, tenantId, recipientId, authorName, body }) {
  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    tenantId,
    relatedRecipientId: recipientId,
    source: 'recipient',
  });
  if (!ticket) throw new NotFoundError('Support ticket not found');
  if (ticket.status === 'closed') {
    throw new ApiError(422, 'This ticket is closed — please open a new one', 'TICKET_CLOSED');
  }

  ticket.messages.push({
    authorUserId: null,
    authorName: authorName || '',
    fromPlatform: false,
    body,
    internal: false,
    at: new Date(),
  });
  if (['waiting_on_customer', 'resolved'].includes(ticket.status)) {
    transitionState('supportTicket', ticket, 'in_progress', { userId: null }, 'Customer replied');
  }
  await ticket.save();

  await notifyAgentsOfReply(ticket, body);
  return toTenantView(ticket);
}

export async function getSupportTicket(ticketId, { tenantId = null } = {}) {
  const filter = { _id: ticketId };
  if (tenantId) filter.tenantId = tenantId;
  const opts = tenantId ? {} : { skipTenantGuard: true };
  const ticket = await SupportTicket.findOne(filter).setOptions(opts);
  if (!ticket) throw new NotFoundError('Support ticket not found');
  return ticket;
}

export async function createSupportTicket({
  tenantId,
  userId,
  subject,
  description,
  type = 'other',
  source = 'tenant',
  relatedOrderId = null,
  relatedRecipientId = null,
  attachments = [],
}) {
  const ticket = await SupportTicket.create({
    tenantId,
    raisedByUserId: userId,
    subject,
    description,
    type,
    source,
    relatedOrderId,
    relatedRecipientId,
    attachments,
  });
  if (source !== 'platform') {
    await notifySupportStaff({
      ticket,
      title: `New support ticket: ${subject}`,
      body: (description || '').slice(0, 200),
    });
  }
  return ticket;
}

export async function addMessage({
  ticketId,
  authorUserId,
  body,
  internal = false,
  tenantId = null,
  isSupportWriter = true,
}) {
  const ticket = await getSupportTicket(ticketId, { tenantId });

  // Department assignees may only post internal notes on tickets assigned to them.
  if (!isSupportWriter) {
    if (String(ticket.assignedToUserId ?? '') !== String(authorUserId)) {
      throw new ForbiddenError('Only support staff or the ticket assignee can update this ticket');
    }
    if (internal === false) {
      throw new ForbiddenError('Assignees can only post internal notes — customer replies stay with Support');
    }
    internal = true;
  }

  const authorName = await userName(authorUserId);
  ticket.messages.push({
    authorUserId,
    authorName,
    fromPlatform: true,
    body,
    internal,
    at: new Date(),
  });
  if (!internal) {
    // A public agent reply puts the ball with the customer — keep the cycle
    // consistent without requiring a manual status change.
    if (ticket.status === 'open' && canTransition('supportTicket', 'open', 'in_progress')) {
      transitionState('supportTicket', ticket, 'in_progress', { userId: authorUserId }, 'Agent replied');
    }
    if (canTransition('supportTicket', ticket.status, 'waiting_on_customer')) {
      transitionState(
        'supportTicket',
        ticket,
        'waiting_on_customer',
        { userId: authorUserId },
        'Agent replied',
      );
    }
  }
  await ticket.save();

  if (internal) {
    // Two-way internal collaboration: support ↔ department assignee.
    const assigneeId = ticket.assignedToUserId ? String(ticket.assignedToUserId) : null;
    const authorId = String(authorUserId);
    if (assigneeId && assigneeId === authorId) {
      await notifySupportStaff({
        ticket,
        title: `Department replied: ${ticket.subject}`,
        body: `${authorName || 'Assignee'}: ${body.slice(0, 200)}`,
      });
    } else if (assigneeId && assigneeId !== authorId) {
      notifyAsync({
        type: 'support_ticket_update',
        tenantId: ticket.tenantId,
        userId: ticket.assignedToUserId,
        title: `Internal note on: ${ticket.subject}`,
        body: `${authorName || 'A teammate'}: ${body.slice(0, 200)}`,
        link: '/platform/support',
      });
    } else {
      await notifySupportStaff({
        ticket,
        title: `Internal note on: ${ticket.subject}`,
        body: `${authorName || 'A teammate'}: ${body.slice(0, 200)}`,
      });
    }
  } else {
    // Public reply = support talking to the admin/customer only.
    await notifyRaiser(ticket, {
      title: `Support replied: ${ticket.subject}`,
      body: body.slice(0, 200),
      withEmail: true,
    });
  }
  return ticket;
}

export async function updateSupportTicketStatus({ ticketId, status, actor, tenantId = null }) {
  const ticket = await getSupportTicket(ticketId, { tenantId });
  // Idempotent: saving the current status is a no-op (UI can race after assign).
  if (ticket.status === status) return ticket;
  transitionState('supportTicket', ticket, status, actor);
  await ticket.save();
  await notifyRaiser(ticket, {
    title: `Support ticket ${status.replace(/_/g, ' ')}: ${ticket.subject}`,
    body: '',
    withEmail: status === 'resolved',
  });
  return ticket;
}

export async function assignTicket({ ticketId, userId, actor }) {
  const ticket = await getSupportTicket(ticketId);
  const unchanged = String(ticket.assignedToUserId ?? '') === String(userId);

  const [assigneeName, actorName] = await Promise.all([
    userName(userId),
    userName(actor?.userId),
  ]);
  ticket.assignedToUserId = userId;
  if (!unchanged) {
    // Leave an internal trail in the thread so reassignments are auditable.
    ticket.messages.push({
      authorUserId: actor?.userId ?? null,
      authorName: actorName,
      fromPlatform: true,
      body: `Assigned to ${assigneeName || 'a team member'}${actorName ? ` by ${actorName}` : ''}.`,
      internal: true,
      at: new Date(),
    });
  }
  if (ticket.status === 'open') {
    transitionState('supportTicket', ticket, 'in_progress', actor, 'Assigned');
  }
  await ticket.save();

  // The whole point of assigning: the assignee must find out.
  if (!unchanged && String(userId) !== String(actor?.userId ?? '')) {
    const assignee = await User.findOne({ _id: userId }).select('email').lean();
    notifyAsync({
      type: 'support_ticket_assigned',
      tenantId: ticket.tenantId,
      userId,
      email: assignee?.email ?? null,
      title: `Ticket assigned to you: ${ticket.subject}`,
      body: (ticket.description || '').slice(0, 200),
      link: '/platform/support',
    });
  }
  return ticket;
}

/**
 * Customer confirms a resolved ticket actually solved their issue — closes the
 * loop. Callers scope the lookup (tenant or recipient) before delegating here.
 */
async function confirmResolution(ticket, { confirmedBy }) {
  if (ticket.status !== 'resolved') {
    throw new ApiError(
      422,
      'Only resolved tickets can be confirmed — reply instead if you still need help',
      'TICKET_NOT_RESOLVED',
    );
  }
  ticket.messages.push({
    authorUserId: null,
    authorName: confirmedBy || '',
    fromPlatform: false,
    body: 'Confirmed: my issue is resolved. Thank you!',
    internal: false,
    at: new Date(),
  });
  transitionState('supportTicket', ticket, 'closed', { userId: null }, 'Customer confirmed resolution');
  await ticket.save();

  const ping = {
    title: `Resolution confirmed: ${ticket.subject}`,
    body: `${confirmedBy || 'The customer'} confirmed the issue is resolved.`,
  };
  // Confirmation is on the admin ↔ support channel — notify the desk, not the
  // department handler who may be on assignedToUserId.
  await notifySupportStaff({ ticket, ...ping });
  return ticket;
}

/** Tenant user confirms their resolved ticket. */
export async function confirmTenantTicket({ ticketId, tenantId, userId }) {
  const ticket = await getSupportTicket(ticketId, { tenantId });
  await confirmResolution(ticket, { confirmedBy: await userName(userId) });
  return toTenantView(ticket);
}

/** Employee (recipient) confirms their resolved ticket. */
export async function confirmRecipientTicket({ ticketId, tenantId, recipientId, authorName }) {
  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    tenantId,
    relatedRecipientId: recipientId,
    source: 'recipient',
  });
  if (!ticket) throw new NotFoundError('Support ticket not found');
  await confirmResolution(ticket, { confirmedBy: authorName });
  return toTenantView(ticket);
}

export async function linkTicketToOrder({ ticketId, orderId }) {
  const ticket = await getSupportTicket(ticketId);
  // A ticket may only ever link to an order in its OWN tenant — scope by
  // ticket.tenantId even on the platform path (skipTenantGuard).
  const order = await Order.findOne({ _id: orderId, tenantId: ticket.tenantId }).setOptions({
    skipTenantGuard: true,
  });
  if (!order) throw new NotFoundError('Order not found');
  ticket.relatedOrderId = order._id;
  if (!ticket.relatedRecipientId) ticket.relatedRecipientId = order.recipientId;
  await ticket.save();
  return ticket;
}

/**
 * §3.9 cross-tenant search — q matches recipient phone/email, order number,
 * AWB, or campaign name. Returns grouped results for the agent's console.
 */
export async function crossTenantSearch(q) {
  const term = q.trim();
  if (!term) throw new ApiError(422, 'Search term "q" is required', 'INVALID_QUERY');
  const regex = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const skipGuard = { skipTenantGuard: true };

  const [recipients, orders, shipments, campaigns] = await Promise.all([
    Recipient.find({ $or: [{ email: regex }, { phone: regex }, { name: regex }] })
      .setOptions(skipGuard)
      .select('name email phone tenantId campaignId redemptionStatus')
      .limit(10)
      .lean(),
    Order.find({ orderNumber: regex })
      .setOptions(skipGuard)
      .select('orderNumber status tenantId recipientId amountBreakdown.total')
      .limit(10)
      .lean(),
    Shipment.find({ awb: regex })
      .setOptions(skipGuard)
      .select('awb courier status orderId tenantId')
      .limit(10)
      .lean(),
    Campaign.find({ name: regex })
      .setOptions(skipGuard)
      .select('name status type tenantId')
      .limit(10)
      .lean(),
  ]);

  return { recipients, orders, shipments, campaigns };
}

async function recipientForTicket(ticket) {
  let recipientId = ticket.relatedRecipientId;
  if (!recipientId && ticket.relatedOrderId) {
    const order = await Order.findOne({ _id: ticket.relatedOrderId, tenantId: ticket.tenantId }).setOptions({
      skipTenantGuard: true,
    });
    recipientId = order?.recipientId ?? null;
  }
  if (!recipientId) {
    throw new ApiError(422, 'Ticket has no linked recipient or order', 'NO_RECIPIENT');
  }
  const recipient = await Recipient.findOne({ _id: recipientId, tenantId: ticket.tenantId }).setOptions({
    skipTenantGuard: true,
  });
  if (!recipient?.email) throw new ApiError(422, 'No recipient email on file', 'NO_RECIPIENT_EMAIL');
  return recipient;
}

/** §3.9 — resend the redemption link for the recipient on the ticket. */
export async function resendRedemptionLink({ ticketId }) {
  const ticket = await getSupportTicket(ticketId);
  const recipient = await recipientForTicket(ticket);
  if (['redeemed', 'order_created'].includes(recipient.redemptionStatus)) {
    throw new ApiError(422, 'This recipient has already redeemed', 'ALREADY_REDEEMED');
  }

  await sendNotificationEmail({
    to: recipient.email,
    title: 'Your gift is waiting — redemption link',
    body: `Hi ${recipient.name}, here is your gift redemption link again.`,
    link: appUrl(`/redeem/${recipient.redemptionToken}`),
  });
  return { sent: true, to: recipient.email };
}

/** §3.9 — resend the tracking link for the order on the ticket. */
export async function resendTrackingLink({ ticketId }) {
  const ticket = await getSupportTicket(ticketId);
  if (!ticket.relatedOrderId) throw new ApiError(422, 'Ticket has no linked order', 'NO_ORDER');

  const order = await Order.findOne({ _id: ticket.relatedOrderId, tenantId: ticket.tenantId }).setOptions({
    skipTenantGuard: true,
  });
  if (!order) throw new NotFoundError('Order not found');
  const recipient = await recipientForTicket(ticket);

  const shipment = await Shipment.findOne({ orderId: order._id, tenantId: order.tenantId });
  await sendNotificationEmail({
    to: recipient.email,
    title: `Tracking update for order ${order.orderNumber}`,
    body: shipment
      ? `Your order is with ${shipment.courier || 'our courier'} (AWB ${shipment.awb}).`
      : `Your order ${order.orderNumber} is currently "${order.status}".`,
    link: shipment?.trackingUrl || appUrl(`/redeem/${recipient.redemptionToken}`),
  });
  return { sent: true, to: recipient.email };
}

/** §3.9 — fix a recipient's shipping address on the linked order. */
export async function updateTicketOrderAddress({ ticketId, address }) {
  const ticket = await getSupportTicket(ticketId);
  if (!ticket.relatedOrderId) throw new ApiError(422, 'Ticket has no linked order', 'NO_ORDER');

  const order = await Order.findOne({ _id: ticket.relatedOrderId, tenantId: ticket.tenantId }).setOptions({
    skipTenantGuard: true,
  });
  if (!order) throw new NotFoundError('Order not found');
  if (['shipped', 'delivered'].includes(order.status)) {
    throw new ApiError(422, `Cannot change the address of a ${order.status} order`, 'TOO_LATE');
  }

  const before = order.toObject().shippingAddress;
  Object.assign(order.shippingAddress, address);
  await order.save();
  return { order, before };
}
