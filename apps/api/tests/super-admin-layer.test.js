/**
 * SUPER_ADMIN_FLOW — platform control plane end-to-end coverage:
 * catalog → inventory → tenant governance → order ops → production → shipment
 * → finance → support → team → settings → audit, with role-matrix guards.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Invoice } from '../src/modules/invoices/invoice.model.js';
import { signAccessToken, hashPassword } from '../src/modules/auth/auth.service.js';
import { refreshTokenFromResponse } from './helpers.js';
import { appendEmailAllowlist, BUILT_IN_PLATFORM_ALLOWLIST_EMAILS } from '../src/modules/auth/workEmail.js';
import { ensureCatalogCategories } from '../src/seed/catalogCategories.js';

let app;
let tenant;
let wallet;
let adminToken;
let tokens; // per platform role

async function makeUser(tenantDoc, role, scopeType, extra = {}) {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`;
  const user = await User.create({
    tenantId: tenantDoc?._id ?? null,
    name: `${role} user`,
    email,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenantDoc?._id ?? null,
    userId: user._id,
    role,
    scopeType,
    ...extra,
  });
  return { user, token: signAccessToken(user, assignment) };
}

async function makeOrder(overrides = {}) {
  const entity = await Entity.create({ tenantId: tenant._id, walletId: wallet._id, name: `E${Math.random()}` });
  const shop = await Shop.create({ tenantId: tenant._id, name: `S${Math.random()}`, status: 'live' });
  const campaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: 'Gifts',
    type: 'points',
    shopId: shop._id,
    status: 'redemption_open',
    creditsPerRecipient: 1000,
    totalBudget: 1000,
    recipientCount: 1,
  });
  const recipient = await Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: 'Alice',
    email: 'alice@test.io',
    creditAmount: 1000,
    redemptionToken: `tok-${Math.random().toString(36).slice(2)}`,
    redemptionStatus: 'order_created',
  });
  return Order.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    recipientId: recipient._id,
    orderNumber: `SM-2026-${String(Math.floor(Math.random() * 900000) + 100000)}`,
    items: [{ name: 'Test Tee', qty: 2, unitPriceInr: 500, costPriceInr: 200, gstRate: 18, hsnCode: '6109' }],
    shippingAddress: { name: 'Alice', line1: '123 St', city: 'Hyderabad', state: 'TS', pincode: '500001' },
    amountBreakdown: { subtotal: 1000, serviceFee: 0, gst: 180, total: 1180 },
    status: 'created',
    ...overrides,
  });
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix', status: 'active' });
  wallet = await Wallet.create({ tenantId: tenant._id, name: 'Rubix Wallet' });

  const admin = await makeUser(tenant, 'company_admin', 'tenant');
  adminToken = admin.token;

  tokens = {};
  for (const role of [
    'platform_super_admin',
    'platform_ops_admin',
    'platform_catalog_admin',
    'platform_production_manager',
    'platform_finance_admin',
    'platform_sales_manager',
    'platform_support_agent',
    'platform_logistics_manager',
    'platform_readonly_auditor',
  ]) {
    ({ token: tokens[role] } = await makeUser(null, role, 'platform'));
  }
  await ensureCatalogCategories();
});

// ---------------------------------------------------------------------------

describe('role × area matrix', () => {
  it('enforces writes per area and lets the auditor read but never write', async () => {
    // support agent cannot write catalog
    const denied = await request(app)
      .post('/api/v1/platform/products')
      .set(auth(tokens.platform_support_agent))
      .send({ name: 'Tee', category: 'Apparel', sellingPriceInr: 500 });
    expect(denied.status).toBe(403);

    // auditor can read products but not create
    const read = await request(app).get('/api/v1/platform/products').set(auth(tokens.platform_readonly_auditor));
    expect(read.status).toBe(200);
    const write = await request(app)
      .post('/api/v1/platform/products')
      .set(auth(tokens.platform_readonly_auditor))
      .send({ name: 'Tee', category: 'Apparel', sellingPriceInr: 500 });
    expect(write.status).toBe(403);

    // audit logs: super + auditor only
    expect(
      (await request(app).get('/api/v1/platform/audit-logs').set(auth(tokens.platform_readonly_auditor))).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/v1/platform/audit-logs').set(auth(tokens.platform_production_manager))).status,
    ).toBe(403);

    // tenant users never reach the control plane
    expect((await request(app).get('/api/v1/platform/dashboard').set(auth(adminToken))).status).toBe(403);
  });
});

describe('catalog (§3.1)', () => {
  async function createProduct(body = {}) {
    const res = await request(app)
      .post('/api/v1/platform/products')
      .set(auth(tokens.platform_catalog_admin))
      .send({
        name: 'Classic Tee',
        category: 'Apparel',
        subcategory: 'T-Shirts',
        sellingPriceInr: 599,
        costPriceInr: 250,
        gstRate: 5,
        hsnCode: '6109',
        ...body,
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  it('creates a draft, blocks publish until valid, then publishes', async () => {
    const product = await createProduct({ hsnCode: '' });
    expect(product.status).toBe('draft');
    expect(product.marginInr).toBe(349);

    const failed = await request(app)
      .post(`/api/v1/platform/products/${product._id}/publish`)
      .set(auth(tokens.platform_catalog_admin));
    expect(failed.status).toBe(422);
    expect(failed.body.error.details.join(' ')).toMatch(/hsnCode/);
    expect(failed.body.error.details.join(' ')).toMatch(/image/);

    await request(app)
      .patch(`/api/v1/platform/products/${product._id}`)
      .set(auth(tokens.platform_catalog_admin))
      .send({ hsnCode: '6109', reason: 'Initial HSN classification' })
      .expect(200);
    // The publish gate needs both a visible stage image (role 'base') and the
    // transparent design/production mask (role 'mask').
    await request(app)
      .post(`/api/v1/platform/products/${product._id}/images`)
      .set(auth(tokens.platform_catalog_admin))
      .send({ urls: ['/uploads/test/tee.png'], role: 'base' })
      .expect(201);
    await request(app)
      .post(`/api/v1/platform/products/${product._id}/images`)
      .set(auth(tokens.platform_catalog_admin))
      .send({ urls: ['/uploads/test/tee-mask.png'], role: 'mask' })
      .expect(201);

    const published = await request(app)
      .post(`/api/v1/platform/products/${product._id}/publish`)
      .set(auth(tokens.platform_catalog_admin));
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('active');
  });

  it('requires a reason for price/GST/HSN changes', async () => {
    const product = await createProduct();
    const noReason = await request(app)
      .patch(`/api/v1/platform/products/${product._id}`)
      .set(auth(tokens.platform_catalog_admin))
      .send({ sellingPriceInr: 699 });
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');

    const withReason = await request(app)
      .patch(`/api/v1/platform/products/${product._id}`)
      .set(auth(tokens.platform_catalog_admin))
      .send({ sellingPriceInr: 699, reason: 'Supplier price hike' });
    expect(withReason.status).toBe(200);
    expect(withReason.body.sellingPriceInr).toBe(699);
  });

  it('never leaks costPriceInr to tenant responses (non-negotiable #3)', async () => {
    const product = await createProduct();
    await request(app)
      .post(`/api/v1/platform/products/${product._id}/images`)
      .set(auth(tokens.platform_catalog_admin))
      .send({ urls: ['/uploads/test/tee.png'], role: 'base' });
    await request(app)
      .post(`/api/v1/platform/products/${product._id}/images`)
      .set(auth(tokens.platform_catalog_admin))
      .send({ urls: ['/uploads/test/tee-mask.png'], role: 'mask' });
    await request(app)
      .post(`/api/v1/platform/products/${product._id}/publish`)
      .set(auth(tokens.platform_catalog_admin))
      .expect(200);

    const tenantView = await request(app).get(`/api/v1/catalog/products/${product._id}`).set(auth(adminToken));
    expect(tenantView.status).toBe(200);
    expect(tenantView.body.costPriceInr).toBeUndefined();
    expect(tenantView.body.supplierName).toBeUndefined();

    const platformView = await request(app)
      .get(`/api/v1/platform/products/${product._id}`)
      .set(auth(tokens.platform_super_admin));
    expect(platformView.body.costPriceInr).toBe(250);
  });
});

describe('inventory (§3.2)', () => {
  let productId;
  beforeEach(async () => {
    const product = await CatalogProduct.create({
      sku: 'SM-TEST1',
      name: 'Mug',
      category: 'Drinkware',
      basePriceInr: 299,
    });
    productId = product._id;
  });

  const txn = (body, token = tokens.platform_catalog_admin) =>
    request(app).post(`/api/v1/platform/inventory/${productId}/transactions`).set(auth(token)).send(body);

  it('moves stock only via append-only transactions, with derived caches', async () => {
    expect((await txn({ type: 'add', qty: 100, reason: 'Initial GRN' })).status).toBe(201);
    expect((await txn({ type: 'reserve', qty: 30, reason: 'Campaign launch' })).status).toBe(201);

    const overRelease = await txn({ type: 'release', qty: 50, reason: 'Oops' });
    expect(overRelease.status).toBe(422);

    const release = await txn({ type: 'release', qty: 10, reason: 'Campaign trimmed' });
    expect(release.body.inventory).toMatchObject({ available: 80, reserved: 20 });

    const list = await request(app).get('/api/v1/platform/inventory').set(auth(tokens.platform_ops_admin));
    const row = list.body.items.find((r) => String(r.productId) === String(productId));
    expect(row).toMatchObject({ available: 80, reserved: 20, stockStatus: 'in_stock' });

    const log = await request(app)
      .get(`/api/v1/platform/inventory/${productId}/transactions`)
      .set(auth(tokens.platform_readonly_auditor));
    expect(log.body.items).toHaveLength(3);
  });
});

describe('tenants (§3.4)', () => {
  it('sets plan/limits, returns overview, archived refuses login', async () => {
    const planRes = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/plan`)
      .set(auth(tokens.platform_super_admin))
      .send({ plan: 'growth' });
    expect(planRes.status).toBe(200);
    expect(planRes.body.plan).toBe('growth');

    const limitsRes = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/limits`)
      .set(auth(tokens.platform_super_admin))
      .send({ limits: { maxCampaigns: 50 } });
    expect(limitsRes.body.limits.maxCampaigns).toBe(50);

    const overview = await request(app)
      .get(`/api/v1/platform/tenants/${tenant._id}/overview`)
      .set(auth(tokens.platform_support_agent));
    expect(overview.status).toBe(200);
    expect(overview.body).toHaveProperty('walletBalanceInr');
    expect(overview.body).toHaveProperty('openOrders');
    expect(overview.body).toHaveProperty('openTickets');

    // suspend/archive requires a reason
    const noReason = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/status`)
      .set(auth(tokens.platform_super_admin))
      .send({ status: 'archived' });
    expect(noReason.status).toBe(400);

    await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/status`)
      .set(auth(tokens.platform_super_admin))
      .send({ status: 'archived', reason: 'Churned' })
      .expect(200);

    // archived tenant: logins refused
    const passwordHash = await hashPassword('demo1234');
    const archUser = await User.create({
      tenantId: tenant._id,
      name: 'Locked Out',
      email: 'locked@rubix.net',
      passwordHash,
      status: 'active',
    });
    await appendEmailAllowlist(['locked@rubix.net']);
    await RoleAssignment.create({
      tenantId: tenant._id,
      userId: archUser._id,
      role: 'company_admin',
      scopeType: 'tenant',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'locked@rubix.net', password: 'demo1234' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('TENANT_ARCHIVED');
    expect(login.body.error.message).toMatch(/archived|suspended/i);
  });

  it('only the super admin governs tenants', async () => {
    const res = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/plan`)
      .set(auth(tokens.platform_finance_admin))
      .send({ plan: 'starter' });
    expect(res.status).toBe(403);
  });
});

describe('orders → production → shipment loop (§3.5–§3.7)', () => {
  it('runs the full supply-side loop through the state machines', async () => {
    const order = await makeOrder();
    const ops = tokens.platform_ops_admin;

    // approve
    await request(app)
      .patch(`/api/v1/platform/orders/${order._id}/status`)
      .set(auth(ops))
      .send({ status: 'approved', note: 'Ops approved' })
      .expect(200);

    // mockup upload → mockup_pending
    const mock = await request(app)
      .post(`/api/v1/platform/orders/${order._id}/mockup`)
      .set(auth(ops))
      .send({ url: '/uploads/mockups/tee.png' });
    expect(mock.body.status).toBe('mockup_pending');

    // tenant approves the mockup (their one remaining write)
    await request(app)
      .patch(`/api/v1/orders/${order._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'mockup_approved' })
      .expect(200);

    // production task — creation requires mockup_approved, advances order
    const task = await request(app)
      .post('/api/v1/platform/production/tasks')
      .set(auth(tokens.platform_production_manager))
      .send({ orderId: String(order._id), assignedTo: 'PrintHouse Hyderabad' });
    expect(task.status).toBe(201);
    expect((await Order.findOne({ _id: order._id, tenantId: tenant._id })).status).toBe('in_production');

    const taskId = task.body._id;
    for (const status of ['mockup_pending', 'mockup_approved', 'in_production', 'printing', 'qc_pending']) {
      await request(app)
        .patch(`/api/v1/platform/production/tasks/${taskId}/status`)
        .set(auth(tokens.platform_production_manager))
        .send({ status })
        .expect(200);
    }
    expect((await Order.findOne({ _id: order._id, tenantId: tenant._id })).status).toBe('qc_pending');

    // QC fail loops with a reason; QC pass packs the order
    const fail = await request(app)
      .post(`/api/v1/platform/production/tasks/${taskId}/qc`)
      .set(auth(tokens.platform_production_manager))
      .send({ passed: false });
    expect(fail.status).toBe(422); // reason required

    await request(app)
      .post(`/api/v1/platform/production/tasks/${taskId}/qc`)
      .set(auth(tokens.platform_production_manager))
      .send({ passed: false, reason: 'Print misaligned' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/platform/production/tasks/${taskId}/status`)
      .set(auth(tokens.platform_production_manager))
      .send({ status: 'qc_pending' })
      .expect(200);
    const pass = await request(app)
      .post(`/api/v1/platform/production/tasks/${taskId}/qc`)
      .set(auth(tokens.platform_production_manager))
      .send({ passed: true, photoUrl: '/uploads/qc/1.png' });
    expect(pass.status).toBe(200);
    expect(pass.body.status).toBe('packing');
    expect((await Order.findOne({ _id: order._id, tenantId: tenant._id })).status).toBe('packed');

    // logistics: AWB + tracking events drive the order to delivered
    const shipment = await request(app)
      .post('/api/v1/platform/shipments')
      .set(auth(tokens.platform_logistics_manager))
      .send({ orderId: String(order._id), courier: 'Delhivery', awb: 'AWB-001' });
    expect(shipment.status).toBe(201);

    for (const status of ['shipped', 'in_transit', 'out_for_delivery', 'delivered']) {
      await request(app)
        .post(`/api/v1/platform/shipments/${shipment.body._id}/events`)
        .set(auth(tokens.platform_logistics_manager))
        .send({ status, location: 'Hyderabad' })
        .expect(200);
    }
    const final = await Order.findOne({ _id: order._id, tenantId: tenant._id });
    expect(final.status).toBe('delivered');
    expect(final.trackingNumber).toBe('AWB-001');
  });

  it('creates a zero-charge replacement linked to the original', async () => {
    const order = await makeOrder({ status: 'delivered' });
    const res = await request(app)
      .post(`/api/v1/platform/orders/${order._id}/replacement`)
      .set(auth(tokens.platform_ops_admin))
      .send({ reason: 'Damaged in transit' });
    expect(res.status).toBe(201);
    expect(res.body.original.status).toBe('replacement_processing');
    expect(res.body.replacement.amountBreakdown.total).toBe(0);
    expect(String(res.body.replacement.replacementOfOrderId)).toBe(String(order._id));
    expect(res.body.replacement.items[0].costPriceInr).toBe(200); // snapshot carried over
  });

  it('imports AWBs in bulk from CSV', async () => {
    const o1 = await makeOrder({ status: 'packed' });
    const o2 = await makeOrder({ status: 'packed' });
    const csv = `orderNumber,courier,awb\n${o1.orderNumber},Delhivery,AWB-100\n${o2.orderNumber},BlueDart,AWB-101\nSM-2026-999999,Delhivery,AWB-102`;

    const res = await request(app)
      .post('/api/v1/platform/shipments/bulk-awb')
      .set(auth(tokens.platform_logistics_manager))
      .send({ csv });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.failed).toBe(1);
  });

  it('hides internal notes and cost from tenant order responses', async () => {
    const order = await makeOrder();
    await request(app)
      .post(`/api/v1/platform/orders/${order._id}/notes`)
      .set(auth(tokens.platform_ops_admin))
      .send({ body: 'Vendor is flaky, watch this one' })
      .expect(201);

    const tenantView = await request(app).get(`/api/v1/orders/${order._id}`).set(auth(adminToken));
    expect(tenantView.status).toBe(200);
    expect(tenantView.body.internalNotes).toBeUndefined();
    expect(tenantView.body.items[0].costPriceInr).toBeUndefined();

    const platformView = await request(app)
      .get(`/api/v1/platform/orders/${order._id}`)
      .set(auth(tokens.platform_ops_admin));
    expect(platformView.body.internalNotes).toHaveLength(1);
    expect(platformView.body.items[0].costPriceInr).toBe(200);
  });
});

describe('finance (§3.8)', () => {
  it('approves PO funding through the ledger only', async () => {
    const poWallet = await Wallet.create({
      tenantId: tenant._id,
      name: 'PO Wallet',
      fundingMethod: 'po_upload',
      fundingDocument: { docType: 'Purchase Order', docNumber: 'PO-77', approvalStatus: 'pending' },
    });

    const pending = await request(app)
      .get('/api/v1/platform/finance/funding-approvals')
      .set(auth(tokens.platform_finance_admin));
    expect(pending.body.some((r) => String(r.walletId) === String(poWallet._id))).toBe(true);

    const approve = await request(app)
      .post(`/api/v1/platform/finance/funding-approvals/${poWallet._id}/approve`)
      .set(auth(tokens.platform_finance_admin))
      .send({ amount: 50000 });
    expect(approve.status).toBe(201);
    expect(approve.body.wallet.balance).toBe(50000);
    expect(approve.body.transaction.type).toBe('fund_in');

    const notifications = await request(app).get('/api/v1/notifications').set(auth(adminToken));
    expect(notifications.status).toBe(200);
    expect(notifications.body.items).toContainEqual(expect.objectContaining({
      type: 'wallet_funded',
      title: 'Budget funded',
      body: '₹50,000 has been added to PO Wallet.',
    }));

    // second approve on the same wallet: no longer pending
    const again = await request(app)
      .post(`/api/v1/platform/finance/funding-approvals/${poWallet._id}/approve`)
      .set(auth(tokens.platform_finance_admin))
      .send({ amount: 50000 });
    expect(again.status).toBe(422);
  });

  it('makes wallet adjustments via the ledger and blocks them during impersonation', async () => {
    const adj = await request(app)
      .post('/api/v1/platform/finance/wallet-adjustments')
      .set(auth(tokens.platform_finance_admin))
      .send({ walletId: String(wallet._id), amount: 1500, reason: 'Goodwill credit' });
    expect(adj.status).toBe(201);
    expect(adj.body.wallet.balance).toBe(1500);

    const imp = await request(app)
      .post(`/api/v1/platform/tenants/${tenant._id}/impersonate`)
      .set(auth(tokens.platform_super_admin))
      .send({ reason: 'Debugging', reasonCategory: 'support' });
    const blocked = await request(app)
      .post('/api/v1/platform/finance/wallet-adjustments')
      .set(auth(imp.body.accessToken))
      .send({ walletId: String(wallet._id), amount: 100, reason: 'Sneaky' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toMatch(/impersonation/i);
  });

  it('issues proforma invoices, credit notes against tax invoices, and reports margin from snapshots', async () => {
    const proforma = await request(app)
      .post('/api/v1/platform/finance/invoices/proforma')
      .set(auth(tokens.platform_finance_admin))
      .send({
        tenantId: String(tenant._id),
        lineItems: [{ description: 'Diwali kits x100', hsnCode: '6109', quantity: 100, unitPrice: 500, gstRate: 5 }],
      });
    expect(proforma.status).toBe(201);
    expect(proforma.body.type).toBe('proforma');
    expect(proforma.body.totalAmount).toBe(52500);

    // credit notes only against tax invoices
    const badCn = await request(app)
      .post('/api/v1/platform/finance/credit-notes')
      .set(auth(tokens.platform_finance_admin))
      .send({ invoiceId: proforma.body._id, amount: 100, reason: 'Test' });
    expect(badCn.status).toBe(422);

    const taxInvoice = await Invoice.create({
      tenantId: tenant._id,
      invoiceNumber: 'INV-2026-99999',
      type: 'tax',
      lineItems: [{ description: 'Order', hsnCode: '6109', quantity: 1, unitPrice: 1000, gstRate: 18, amount: 1000 }],
      totalAmount: 1180,
      gstAmount: 180,
      status: 'issued',
    });
    const cn = await request(app)
      .post('/api/v1/platform/finance/credit-notes')
      .set(auth(tokens.platform_finance_admin))
      .send({ invoiceId: String(taxInvoice._id), amount: 590, reason: 'Half the order damaged' });
    expect(cn.status).toBe(201);
    expect(cn.body.creditNoteNumber).toMatch(/^CN-/);

    const listed = await request(app)
      .get('/api/v1/platform/finance/credit-notes')
      .set(auth(tokens.platform_finance_admin));
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row) => row.creditNoteNumber === cn.body.creditNoteNumber)).toBe(true);
    expect(listed.body.items.find((row) => row.creditNoteNumber === cn.body.creditNoteNumber).invoiceNumber).toBe(
      taxInvoice.invoiceNumber,
    );

    await makeOrder({ status: 'delivered' }); // items: 2 × (500 sell / 200 cost)
    const margin = await request(app)
      .get('/api/v1/platform/finance/reports/margin')
      .set(auth(tokens.platform_finance_admin));
    expect(margin.status).toBe(200);
    expect(margin.body.totalRevenueInr).toBe(1000);
    expect(margin.body.totalCostInr).toBe(400);
    expect(margin.body.totalMarginInr).toBe(600);

    // ops admin cannot read finance
    expect(
      (await request(app).get('/api/v1/platform/finance/outstanding').set(auth(tokens.platform_ops_admin))).status,
    ).toBe(403);
  });
});

describe('support (§3.9)', () => {
  it('creates, assigns, searches cross-tenant, and walks the ticket machine', async () => {
    const order = await makeOrder();
    const created = await request(app)
      .post('/api/v1/platform/support-tickets')
      .set(auth(tokens.platform_support_agent))
      .send({
        tenantId: String(tenant._id),
        subject: 'Recipient says box arrived damaged',
        type: 'delivery_issue',
        relatedOrderId: String(order._id),
      });
    expect(created.status).toBe(201);
    expect(created.body.source).toBe('platform');
    const ticketId = created.body._id;

    // assign moves open → in_progress
    const agent = await User.findOne({ email: { $regex: 'platform_support_agent' } });
    const assigned = await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticketId}/assign`)
      .set(auth(tokens.platform_ops_admin))
      .send({ userId: String(agent._id) });
    expect(assigned.body.status).toBe('in_progress');

    // waiting_on_customer ↔ in_progress
    await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticketId}/status`)
      .set(auth(tokens.platform_support_agent))
      .send({ status: 'waiting_on_customer' })
      .expect(200);

    // internal message
    const msg = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticketId}/messages`)
      .set(auth(tokens.platform_support_agent))
      .send({ body: 'Calling the courier hub', internal: true });
    expect(msg.body.messages[0].internal).toBe(true);

    // cross-tenant search by order number
    const search = await request(app)
      .get(`/api/v1/platform/support-tickets/search?q=${order.orderNumber}`)
      .set(auth(tokens.platform_support_agent));
    expect(search.status).toBe(200);
    expect(search.body.orders).toHaveLength(1);

    // address fix on the linked order
    const addr = await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticketId}/recipient-address`)
      .set(auth(tokens.platform_support_agent))
      .send({ address: { line1: '456 New Street', pincode: '500084' } });
    expect(addr.status).toBe(200);
    expect(addr.body.shippingAddress.line1).toBe('456 New Street');
  });
});

describe('platform team (§5)', () => {
  it('invites, re-roles, deactivates and audits platform users — super admin only', async () => {
    const builtInSupport = await User.create({
      tenantId: null,
      name: 'Support Agent',
      email: 'support@shelfmerch.io',
      status: 'active',
    });
    await RoleAssignment.create({
      tenantId: null,
      userId: builtInSupport._id,
      role: 'platform_support_agent',
      scopeType: 'platform',
    });

    await appendEmailAllowlist(['newsales@shelfmerch.io']);
    const invited = await request(app)
      .post('/api/v1/platform/team')
      .set(auth(tokens.platform_super_admin))
      .send({ name: 'New Sales', email: 'newsales@shelfmerch.io', role: 'platform_sales_manager' });
    expect(invited.status).toBe(201);
    expect(invited.body.inviteToken).toBeTruthy();

    const list = await request(app).get('/api/v1/platform/team').set(auth(tokens.platform_readonly_auditor));
    expect(list.body.some((m) => m.email === 'newsales@shelfmerch.io')).toBe(true);
    expect(list.body.find((m) => m.email === 'support@shelfmerch.io')).toMatchObject({
      allowlisted: true,
      protected: true,
    });

    const userId = invited.body.user.id;
    const rerole = await request(app)
      .patch(`/api/v1/platform/team/${userId}`)
      .set(auth(tokens.platform_super_admin))
      .send({ role: 'platform_logistics_manager' });
    expect(rerole.body.role).toBe('platform_logistics_manager');

    await request(app)
      .post(`/api/v1/platform/team/${userId}/deactivate`)
      .set(auth(tokens.platform_super_admin))
      .expect(200);

    const protectedDeactivate = await request(app)
      .post(`/api/v1/platform/team/${builtInSupport._id}/deactivate`)
      .set(auth(tokens.platform_super_admin));
    expect(protectedDeactivate.status).toBe(422);
    expect(protectedDeactivate.body.error.code).toBe('BUILT_IN_PLATFORM_USER_PROTECTED');

    // non-super cannot manage the team
    const denied = await request(app)
      .post('/api/v1/platform/team')
      .set(auth(tokens.platform_ops_admin))
      .send({ name: 'X', email: 'x@shelfmerch.io', role: 'platform_ops_admin' });
    expect(denied.status).toBe(403);
  });
});

describe('settings & signup gating (§3.4, §6)', () => {
  it('signup.mode=closed refuses registration; open activates immediately', async () => {
    // defaults visible; non-super cannot write
    const all = await request(app).get('/api/v1/platform/settings').set(auth(tokens.platform_readonly_auditor));
    expect(all.body['gst.defaultRate']).toBe(18);
    expect(all.body['auth.emailAllowlist']).toEqual(BUILT_IN_PLATFORM_ALLOWLIST_EMAILS);
    expect(
      (
        await request(app)
          .put('/api/v1/platform/settings/signup.mode')
          .set(auth(tokens.platform_finance_admin))
          .send({ value: 'open' })
      ).status,
    ).toBe(403);

    await request(app)
      .put('/api/v1/platform/settings/auth.emailAllowlist')
      .set(auth(tokens.platform_super_admin))
      .send({ value: ['eve@corp.io'] })
      .expect(200);

    await request(app)
      .put('/api/v1/platform/settings/signup.mode')
      .set(auth(tokens.platform_super_admin))
      .send({ value: 'closed' })
      .expect(200);

    const closed = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Eve', email: 'eve@corp.io', password: 'password123', companyName: 'Corp' });
    expect(closed.status).toBe(403);
    expect(closed.body.error.code).toBe('SIGNUP_CLOSED');

    await request(app)
      .put('/api/v1/platform/settings/signup.mode')
      .set(auth(tokens.platform_super_admin))
      .send({ value: 'open' })
      .expect(200);

    const open = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Eve', email: 'eve@corp.io', password: 'password123', companyName: 'Corp' });
    expect(open.status).toBe(201);
    const newTenant = await Tenant.findOne({ _id: open.body.user.tenantId });
    expect(newTenant.status).toBe('active');
  });

  it('auth.emailAllowlist is required for work and personal emails', async () => {
    const work = `worker-${Date.now()}@corp.io`;
    const gmail = `tester-${Date.now()}@gmail.com`;
    const password = 'securepass1';

    const blockedWork = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Work Tester', email: work, password, companyName: 'Test Co' });
    expect(blockedWork.status).toBe(400);
    expect(blockedWork.body.error.code).toBe('EMAIL_NOT_ALLOWLISTED');

    const blockedGmail = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Gmail Tester', email: gmail, password, companyName: 'Test Co' });
    expect(blockedGmail.status).toBe(400);
    expect(blockedGmail.body.error.code).toBe('EMAIL_NOT_ALLOWLISTED');

    const saved = await request(app)
      .put('/api/v1/platform/settings/auth.emailAllowlist')
      .set(auth(tokens.platform_super_admin))
      .send({ value: [gmail.toUpperCase(), 'not-an-email'] });
    expect(saved.status).toBe(400);
    expect(saved.body.error.code).toBe('INVALID_ALLOWLIST');

    await request(app)
      .put('/api/v1/platform/settings/auth.emailAllowlist')
      .set(auth(tokens.platform_super_admin))
      .send({ value: [gmail.toUpperCase(), work.toUpperCase()] })
      .expect(200);

    const settings = await request(app).get('/api/v1/platform/settings').set(auth(tokens.platform_super_admin));
    expect(settings.body['auth.emailAllowlist']).toEqual([
      ...BUILT_IN_PLATFORM_ALLOWLIST_EMAILS,
      gmail,
      work,
    ]);

    await request(app)
      .put('/api/v1/platform/settings/signup.mode')
      .set(auth(tokens.platform_super_admin))
      .send({ value: 'open' })
      .expect(200);

    const registered = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Gmail Tester', email: gmail, password, companyName: 'Test Co' });
    expect(registered.status).toBe(201);

    const login = await request(app).post('/api/v1/auth/login').send({ email: gmail, password });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(gmail);
  });

  it('generates and revokes the temporary test login password', async () => {
    const initial = await request(app)
      .get('/api/v1/platform/settings/demo-login-password')
      .set(auth(tokens.platform_super_admin));
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      email: 'test@shelfmerch.io',
      active: false,
      ttlDays: 5,
    });

    const generated = await request(app)
      .post('/api/v1/platform/settings/demo-login-password')
      .set(auth(tokens.platform_super_admin));
    expect(generated.status).toBe(201);
    expect(generated.body.email).toBe('test@shelfmerch.io');
    expect(generated.body.password).toMatch(/^SM-/);
    expect(generated.body.active).toBe(true);
    expect(new Date(generated.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 4 * 24 * 60 * 60 * 1000);

    const all = await request(app).get('/api/v1/platform/settings').set(auth(tokens.platform_super_admin));
    expect(all.body['auth.demoLoginPassword']).toBeUndefined();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@shelfmerch.io', password: generated.body.password });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({
      email: 'test@shelfmerch.io',
      role: 'company_admin',
      scopeType: 'tenant',
      tenantId: String(tenant._id),
    });

    const platformBlocked = await request(app)
      .get('/api/v1/platform/dashboard')
      .set(auth(login.body.accessToken));
    expect(platformBlocked.status).toBe(403);

    const appOk = await request(app)
      .get('/api/v1/tenants/me')
      .set(auth(login.body.accessToken));
    expect(appOk.status).toBe(200);

    const rotated = await request(app)
      .post('/api/v1/platform/settings/demo-login-password')
      .set(auth(tokens.platform_super_admin));
    expect(rotated.status).toBe(201);
    expect(rotated.body.password).not.toBe(generated.body.password);

    const staleAccess = await request(app)
      .get('/api/v1/tenants/me')
      .set(auth(login.body.accessToken));
    expect(staleAccess.status).toBe(401);

    const staleRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${refreshTokenFromResponse(login)}`);
    expect(staleRefresh.status).toBe(401);

    const oldPasswordBlocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@shelfmerch.io', password: generated.body.password });
    expect(oldPasswordBlocked.status).toBe(401);

    const freshLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@shelfmerch.io', password: rotated.body.password });
    expect(freshLogin.status).toBe(200);

    const freshAccess = await request(app)
      .get('/api/v1/tenants/me')
      .set(auth(freshLogin.body.accessToken));
    expect(freshAccess.status).toBe(200);

    const revoked = await request(app)
      .delete('/api/v1/platform/settings/demo-login-password')
      .set(auth(tokens.platform_super_admin));
    expect(revoked.status).toBe(200);
    expect(revoked.body.active).toBe(false);
    expect(revoked.body.revokedAt).toBeTruthy();

    const revokedAccess = await request(app)
      .get('/api/v1/tenants/me')
      .set(auth(freshLogin.body.accessToken));
    expect(revokedAccess.status).toBe(401);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sm_refresh=${refreshTokenFromResponse(freshLogin)}`);
    expect(refresh.status).toBe(401);

    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@shelfmerch.io', password: rotated.body.password });
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('dashboard (§2)', () => {
  it('returns the morning-glance cards and sections', async () => {
    await makeOrder();
    const res = await request(app).get('/api/v1/platform/dashboard').set(auth(tokens.platform_super_admin));
    expect(res.status).toBe(200);
    expect(res.body.cards).toMatchObject({ activeTenants: 1, ordersInProgress: 1 });
    expect(res.body.cards.totalGmvInr).toBe(1180);
    expect(res.body.sections.orderPipeline.created).toBe(1);
    expect(res.body.sections).toHaveProperty('topTenants');
  });
});

describe('audit trail (non-negotiable #5)', () => {
  it('writes an audit entry for platform mutations', async () => {
    const order = await makeOrder();
    await request(app)
      .patch(`/api/v1/platform/orders/${order._id}/status`)
      .set(auth(tokens.platform_ops_admin))
      .send({ status: 'approved' })
      .expect(200);

    // audit writes are fire-and-forget; give the insert a beat
    await new Promise((r) => setTimeout(r, 200));
    const logs = await request(app)
      .get('/api/v1/platform/audit-logs?action=order.status_override')
      .set(auth(tokens.platform_super_admin));
    expect(logs.status).toBe(200);
    expect(logs.body.items.length).toBeGreaterThanOrEqual(1);
    expect(logs.body.items[0].after.status).toBe('approved');
  });
});
