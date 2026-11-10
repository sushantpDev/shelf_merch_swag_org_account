import * as campaignsService from './campaigns.service.js';
import { writeAudit } from '../../services/audit.service.js';

export async function list(req, res) {
  res.json(await campaignsService.listCampaigns({ tenantId: req.tenantId, user: req.user }));
}

export async function getOne(req, res) {
  res.json(await campaignsService.getCampaign({ tenantId: req.tenantId, campaignId: req.params.id, user: req.user }));
}

export async function create(req, res) {
  const campaign = await campaignsService.createCampaign({
    tenantId: req.tenantId,
    userId: req.user.userId,
    user: req.user,
    data: req.body,
  });
  writeAudit({ req, action: 'campaign.create', entityType: 'Campaign', entityId: campaign._id, after: campaign });
  res.status(201).json(campaign);
}

export async function update(req, res) {
  const campaign = await campaignsService.updateCampaign({
    tenantId: req.tenantId,
    campaignId: req.params.id,
    user: req.user,
    patch: req.body,
  });
  writeAudit({ req, action: 'campaign.update', entityType: 'Campaign', entityId: campaign._id, after: campaign });
  res.json(campaign);
}

export async function importRecipients(req, res) {
  const result = await campaignsService.importRecipients({
    tenantId: req.tenantId,
    campaignId: req.params.id,
    user: req.user,
    recipients: req.body.recipients,
    totalBudget: req.body.totalBudget,
    packaging: req.body.packaging,
    paymentMode: req.body.paymentMode,
    razorpayOrderId: req.body.razorpay_order_id,
    razorpayPaymentId: req.body.razorpay_payment_id,
    idempotencyKey: req.get('Idempotency-Key') || undefined,
  });
  writeAudit({
    req,
    action: 'campaign.import_recipients',
    entityType: 'Campaign',
    entityId: req.params.id,
    after: { count: result.count },
  });
  // Import updates an existing campaign's recipients (and may auto-approve
  // kit/items sends) — return 200 with the updated campaign, not 201.
  res.json(result);
}

export async function allocateCredits(req, res) {
  const campaign = await campaignsService.allocateCredits({
    tenantId: req.tenantId,
    campaignId: req.params.id,
    user: req.user,
    creditsPerRecipient: req.body.creditsPerRecipient,
    totalBudget: req.body.totalBudget,
    paymentMode: req.body.paymentMode,
    razorpayOrderId: req.body.razorpay_order_id,
    razorpayPaymentId: req.body.razorpay_payment_id,
    idempotencyKey: req.get('Idempotency-Key') || undefined,
  });
  writeAudit({
    req,
    action: 'campaign.allocate_credits',
    entityType: 'Campaign',
    entityId: campaign._id,
    after: { creditsPerRecipient: req.body.creditsPerRecipient, totalBudget: campaign.totalBudget },
  });
  res.json(campaign);
}

export async function launch(req, res) {
  const campaign = await campaignsService.launchCampaign({
    tenantId: req.tenantId,
    campaignId: req.params.id,
    user: req.user,
    paymentMode: req.body?.paymentMode,
    razorpayOrderId: req.body?.razorpay_order_id,
    razorpayPaymentId: req.body?.razorpay_payment_id,
  });
  writeAudit({ req, action: 'campaign.launch', entityType: 'Campaign', entityId: campaign._id, after: { status: campaign.status } });
  res.json(campaign);
}

export async function close(req, res) {
  const campaign = await campaignsService.closeCampaign({
    tenantId: req.tenantId,
    campaignId: req.params.id,
    user: req.user,
  });
  writeAudit({ req, action: 'campaign.close', entityType: 'Campaign', entityId: campaign._id, after: { status: campaign.status } });
  res.json(campaign);
}

export async function report(req, res) {
  res.json(
    await campaignsService.campaignReport({ tenantId: req.tenantId, campaignId: req.params.id, user: req.user }),
  );
}

export async function savePointsDraft(req, res) {
  const campaign = await campaignsService.savePointsDraft({
    tenantId: req.tenantId,
    userId: req.user.userId,
    user: req.user,
    data: req.body,
  });
  writeAudit({
    req,
    action: 'campaign.save_points_draft',
    entityType: 'Campaign',
    entityId: campaign._id,
    after: { status: campaign.status },
  });
  res.status(req.body.campaignId ? 200 : 201).json(campaign);
}

export async function remove(req, res) {
  await campaignsService.deleteCampaign({
    tenantId: req.tenantId,
    campaignId: req.params.id,
    user: req.user,
  });
  writeAudit({
    req,
    action: 'campaign.delete',
    entityType: 'Campaign',
    entityId: req.params.id,
  });
  res.json({ ok: true });
}
