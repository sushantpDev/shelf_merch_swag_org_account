import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser, authHeader } from './helpers.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { CopilotConversation } from '../src/modules/copilot/copilotConversation.model.js';
import { CopilotAudit } from '../src/modules/copilot/copilotAudit.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Kit } from '../src/modules/kits/kit.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { createConversation, streamAssistantTurn } from '../src/modules/copilot/copilotChat.service.js';
import { buildCopilotToolCtx } from '../src/modules/copilot/buildCallerCtx.js';
import * as adapter from '../src/modules/copilot/providers/anthropicChatAdapter.js';
let app;
const previous = { enabled: env.EMBEDDED_COPILOT_ENABLED, provider: env.COPILOT_AI_PROVIDER, key: env.ANTHROPIC_API_KEY };
beforeAll(async () => { await connectTestDb(); app = createApp(); });
afterAll(async () => { env.EMBEDDED_COPILOT_ENABLED = previous.enabled; env.COPILOT_AI_PROVIDER = previous.provider; env.ANTHROPIC_API_KEY = previous.key; await disconnectTestDb(); });
beforeEach(async () => { await clearTestDb(); vi.restoreAllMocks(); env.EMBEDDED_COPILOT_ENABLED = 'true'; env.COPILOT_AI_PROVIDER = 'anthropic'; env.ANTHROPIC_API_KEY = 'test-only-no-network'; vi.spyOn(adapter, 'createAnthropicClient').mockReturnValue({}); });
function response(name, plan) { return { text: '', toolCalls: [{ id: 'call', name, arguments: JSON.stringify(plan) }], usage: { promptTokens: 80, completionTokens: 40 } }; }
async function setup(role = 'company_admin') {
  const tenant = await makeTenant(); const admin = await makeUser(tenant, role, role === 'entity_manager' ? 'entity' : 'tenant');
  const conversation = await createConversation({ tenantId: tenant._id, userId: admin.user._id });
  const toolCtx = buildCopilotToolCtx({ tenantId: tenant._id, user: { userId: admin.user._id, role, scopeType: admin.assignment.scopeType, assignedEntityIds: [] } });
  return { tenant, admin, conversation, args: { tenantId: tenant._id, userId: admin.user._id, role, conversationId: String(conversation._id), toolCtx, mode: 'curator' } };
}
describe('curator inside existing authenticated Copilot (isolated database, mocked provider)', () => {
  it.each(['company_admin', 'entity_manager'])('uses genuine catalog data for %s with no business writes', async (role) => {
    const { tenant, admin, conversation, args } = await setup(role);
    const product = await CatalogProduct.create({ sku: 'LAMP-1', name: 'Desk Lamp', category: 'Work Essentials', basePriceInr: 1200, status: 'active', primaryImageUrl: 'https://official.test/lamp.png', variants: [{ sku: 'L1', color: 'Black', stock: 12 }] });
    await CatalogProduct.create({ sku: 'MUG-1', name: 'Ceramic Mug', category: 'Drinkware', basePriceInr: 300, status: 'active', variants: [{ sku: 'M1', stock: 12 }] });
    const model = vi.spyOn(adapter, 'streamAnthropicCompletion').mockResolvedValueOnce(response('curator_update_brief', { brief: { company: 'Toast', occasion: 'Welcome', recipients: 10, budgetPerRecipient: 3000, currency: 'INR', exclusions: ['mugs', 'bottles', 'apparel'] }, queries: [''] })).mockResolvedValueOnce(response('curator_concepts', { concepts: [{ name: 'First day focus', rationale: 'A practical desk upgrade.', packaging: 'A reusable box', itemIds: [`product:${product._id}`, 'product:invented'], ideas: [] }] }));
    const events = [];
    await streamAssistantTurn({ ...args, content: 'Welcome gifts for 10 Toast employees, ₹3,000 each. No mugs, bottles or apparel.', onEvent: event => events.push(event) });
    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls.every(([call]) => call.tools.length === 1 && !/execute|prepare/.test(call.tools[0].function.name))).toBe(true);
    const saved = await CopilotConversation.findById(conversation._id);
    const artifact = saved.messages.at(-1).artifacts[0].curation;
    expect(artifact.brief).toMatchObject({ company: 'Toast', recipients: 10, budgetPerRecipient: 3000 });
    expect(artifact.concepts[0].items).toHaveLength(1);
    expect(artifact.concepts[0].items[0]).toMatchObject({ id: String(product._id), imageUrl: product.primaryImageUrl, price: 1200 });
    expect(artifact.concepts[0].estimatedTotal).toBe(12000);
    for (const Model of [Shop, Kit, Order, Campaign]) expect(await Model.countDocuments({ tenantId: tenant._id })).toBe(0);
    expect(await CopilotAudit.findOne({ toolName: 'curator.turn', tenantId: tenant._id })).toMatchObject({ ok: true, metrics: { modelCalls: 2 } });
    expect(events.at(-1).type).toBe('done');
    const detail = await request(app).get(`/api/v1/copilot/conversations/${conversation._id}`).set(authHeader(admin.token));
    expect(detail.body.curator.enabled).toBe(true);
    const outsiderTenant = await makeTenant(); const outsider = await makeUser(outsiderTenant, 'company_admin');
    const denied = await request(app).get(`/api/v1/copilot/conversations/${conversation._id}`).set(authHeader(outsider.token));
    expect(denied.status).toBe(404);
  });
  it('keeps external-only follow-ups external, strips fake shopping data and never searches inventory', async () => {
    const { conversation, args } = await setup();
    const plan = { brief: { occasion: 'Appreciation', recipients: 10, budgetPerRecipient: 3000, currency: 'INR' }, queries: ['mug'] };
    const concepts = { concepts: [{ name: 'Rest & recovery', rationale: 'Time to unwind', packaging: 'Reusable wrap', ideas: [{ name: 'Wellness class', description: 'A shared relaxation experience' }] }] };
    const model = vi.spyOn(adapter, 'streamAnthropicCompletion').mockResolvedValueOnce(response('curator_update_brief', plan)).mockResolvedValueOnce(response('curator_concepts', concepts)).mockResolvedValueOnce(response('curator_update_brief', { brief: {}, queries: ['mug'] })).mockResolvedValueOnce(response('curator_concepts', concepts));
    await streamAssistantTurn({ ...args, content: 'Show gifts outside ShelfMerch for 10 employees, budget ₹3,000 each.', onEvent() {} });
    const events = [];
    await streamAssistantTurn({ ...args, content: 'Show me more unique products', onEvent: e => events.push(e) });
    const saved = await CopilotConversation.findById(conversation._id);
    expect(saved.curator.brief.source).toBe('external');
    expect(saved.curator.brief.budgetPerRecipient).toBe(3000);
    expect(saved.messages.at(-1).artifacts[0].curation.concepts[0].items[0]).toMatchObject({ source: 'inspiration', price: null, currency: null });
    expect(events.some(e => /catalog|kits/.test(e.name || ''))).toBe(false);
    expect(model).toHaveBeenCalledTimes(4);
  });
  it('asks for missing essentials together and stops after one extraction call', async () => {
    const { args, conversation } = await setup();
    const model = vi.spyOn(adapter, 'streamAnthropicCompletion').mockResolvedValue(response('curator_update_brief', { brief: { company: 'Toast' }, queries: [] }));
    await streamAssistantTurn({ ...args, content: 'Help me plan gifts for Toast.', onEvent() {} });
    expect(model).toHaveBeenCalledOnce();
    const saved = await CopilotConversation.findById(conversation._id);
    expect(saved.messages.at(-1).content).toMatch(/occasion, recipient count, budget per person/);
  });
});
