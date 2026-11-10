import { ApiError, ForbiddenError } from '../../utils/errors.js';
import { writeAudit } from '../../services/audit.service.js';
import { McpWriteConfirmation } from '../mcp/mcpWriteConfirmation.model.js';
import {
  prepareShopCreateForCaller,
  executeShopCreateForCaller,
  prepareShopUpdateForCaller,
  executeShopUpdateForCaller,
  shopsPrepareCreateInputSchema,
  shopsExecuteCreateInputSchema,
  shopsPrepareUpdateInputSchema,
  shopsExecuteUpdateInputSchema,
} from '../mcp/shopsWrite.js';
import {
  prepareShopPublishForCaller,
  executeShopPublishForCaller,
  shopsPreparePublishInputSchema,
  shopsExecutePublishInputSchema,
} from '../mcp/shopsPublishWrite.js';
import {
  prepareCollectionDraftForCaller,
  executeCollectionDraftForCaller,
  prepareCollectionPublishForCaller,
  executeCollectionPublishForCaller,
  collectionPrepareDraftInputSchema,
  collectionExecuteDraftInputSchema,
  collectionPreparePublishInputSchema,
  collectionExecutePublishInputSchema,
} from '../mcp/shopsCollectionWrite.js';
import {
  prepareShopCatalogUpdateForCaller,
  executeShopCatalogUpdateForCaller,
  shopsPrepareCatalogInputSchema,
  shopsExecuteCatalogInputSchema,
} from '../mcp/shopsCatalogWrite.js';
import {
  prepareShopCategoriesUpdateForCaller,
  executeShopCategoriesUpdateForCaller,
  shopsPrepareCategoriesInputSchema,
  shopsExecuteCategoriesInputSchema,
} from '../mcp/shopsCategoriesWrite.js';
import {
  prepareBudgetAllocationForCaller,
  executeBudgetAllocationForCaller,
  budgetPrepareInputSchema,
  budgetExecuteInputSchema,
} from '../mcp/budgetsWrite.js';
import {
  prepareWalletTopupForCaller,
  executeWalletTopupForCaller,
  walletsPrepareTopupInputSchema,
  walletsExecuteTopupInputSchema,
} from '../mcp/walletsTopupWrite.js';
import {
  prepareWalletSetupForCaller,
  executeWalletSetupForCaller,
  prepareWalletPaymentOrderForCaller,
  executeWalletPaymentOrderForCaller,
  prepareWalletPaymentVerifyForCaller,
  executeWalletPaymentVerifyForCaller,
  walletsPrepareSetupInputSchema,
  walletsExecuteSetupInputSchema,
  walletsPreparePaymentOrderInputSchema,
  walletsExecutePaymentOrderInputSchema,
  walletsPreparePaymentVerifyInputSchema,
  walletsExecutePaymentVerifyInputSchema,
} from '../mcp/walletsSetupWrite.js';
import {
  preparePointsDraftForCaller,
  executePointsDraftForCaller,
  campaignsPreparePointsDraftInputSchema,
  campaignsExecutePointsDraftInputSchema,
} from '../mcp/campaignsDraftWrite.js';
import {
  prepareCreditAllocationForCaller,
  executeCreditAllocationForCaller,
  prepareLaunchForCaller,
  executeLaunchForCaller,
  creditPrepareInputSchema,
  creditExecuteInputSchema,
  launchPrepareInputSchema,
  launchExecuteInputSchema,
} from '../mcp/campaignsSendWrite.js';
import {
  prepareMerchandiseDraftForCaller,
  executeMerchandiseDraftForCaller,
  prepareMerchandiseLaunchForCaller,
  executeMerchandiseLaunchForCaller,
  merchandisePrepareDraftInputSchema,
  merchandiseExecuteDraftInputSchema,
  merchandisePrepareLaunchInputSchema,
  merchandiseExecuteLaunchInputSchema,
} from '../mcp/campaignsMerchandiseWrite.js';
import {
  prepareEmployeeCreateForCaller,
  executeEmployeeCreateForCaller,
  prepareEmployeeUpdateForCaller,
  executeEmployeeUpdateForCaller,
  employeesPrepareCreateInputSchema,
  employeesExecuteCreateInputSchema,
  employeesPrepareUpdateInputSchema,
  employeesExecuteUpdateInputSchema,
} from '../mcp/employeesWrite.js';
import {
  prepareEntitySetupForCaller,
  executeEntitySetupForCaller,
  prepareAssignManagerForCaller,
  executeAssignManagerForCaller,
  entitiesPrepareSetupInputSchema,
  entitiesExecuteSetupInputSchema,
  entitiesPrepareAssignInputSchema,
  entitiesExecuteAssignInputSchema,
} from '../mcp/entitiesWrite.js';
import { buildCopilotToolCtx } from './buildCallerCtx.js';
import { isWriteFlagEnabled, anyWriteDomainEnabled, writeDomainsStatus } from './copilotWriteFlags.js';

/**
 * Stable workflow id → prepare/execute ForCaller + schemas + domain flag.
 * EXECUTE is only reachable via authenticated HTTP confirm — never the model.
 */
export const COPILOT_WRITE_WORKFLOWS = {
  'shops.create': {
    writeFlag: 'storeCreate',
    operation: 'shops.create',
    entityTypeOnExecute: 'Shop',
    prepareSchema: shopsPrepareCreateInputSchema,
    executeSchema: shopsExecuteCreateInputSchema,
    prepare: prepareShopCreateForCaller,
    execute: executeShopCreateForCaller,
    validationMessage: 'Store details are not valid',
  },
  'shops.update': {
    writeFlag: 'storeUpdate',
    operation: 'shops.update',
    entityTypeOnExecute: 'Shop',
    prepareSchema: shopsPrepareUpdateInputSchema,
    executeSchema: shopsExecuteUpdateInputSchema,
    prepare: prepareShopUpdateForCaller,
    execute: executeShopUpdateForCaller,
    validationMessage: 'Store update details are not valid',
  },
  'shops.publish': {
    writeFlag: 'storePublish',
    operation: 'shops.publish',
    entityTypeOnExecute: 'Shop',
    prepareSchema: shopsPreparePublishInputSchema,
    executeSchema: shopsExecutePublishInputSchema,
    prepare: prepareShopPublishForCaller,
    execute: executeShopPublishForCaller,
    validationMessage: 'Store publish details are not valid',
  },
  'shops.collection_draft': {
    writeFlag: 'collections',
    operation: 'shops.collection_draft',
    entityTypeOnExecute: 'ShopCollection',
    prepareSchema: collectionPrepareDraftInputSchema,
    executeSchema: collectionExecuteDraftInputSchema,
    prepare: prepareCollectionDraftForCaller,
    execute: executeCollectionDraftForCaller,
    validationMessage: 'Collection draft details are not valid',
  },
  'shops.collection_publish': {
    writeFlag: 'collections',
    operation: 'shops.collection_publish',
    entityTypeOnExecute: 'ShopCollection',
    prepareSchema: collectionPreparePublishInputSchema,
    executeSchema: collectionExecutePublishInputSchema,
    prepare: prepareCollectionPublishForCaller,
    execute: executeCollectionPublishForCaller,
    validationMessage: 'Collection publish details are not valid',
  },
  'shops.catalog_update': {
    writeFlag: 'shopCatalog',
    operation: 'shops.catalog_update',
    entityTypeOnExecute: 'Shop',
    prepareSchema: shopsPrepareCatalogInputSchema,
    executeSchema: shopsExecuteCatalogInputSchema,
    prepare: prepareShopCatalogUpdateForCaller,
    execute: executeShopCatalogUpdateForCaller,
    validationMessage: 'Catalog update details are not valid',
  },
  'shops.categories_update': {
    writeFlag: 'shopCategories',
    operation: 'shops.categories_update',
    entityTypeOnExecute: 'Shop',
    prepareSchema: shopsPrepareCategoriesInputSchema,
    executeSchema: shopsExecuteCategoriesInputSchema,
    prepare: prepareShopCategoriesUpdateForCaller,
    execute: executeShopCategoriesUpdateForCaller,
    validationMessage: 'Category update details are not valid',
  },
  'budget.allocate': {
    writeFlag: 'budgets',
    operation: 'wallets.allocate',
    entityTypeOnExecute: 'Wallet',
    prepareSchema: budgetPrepareInputSchema,
    executeSchema: budgetExecuteInputSchema,
    prepare: prepareBudgetAllocationForCaller,
    execute: executeBudgetAllocationForCaller,
    validationMessage: 'Budget allocation details are not valid',
  },
  'wallets.topup': {
    writeFlag: 'walletTopup',
    operation: 'wallets.topup',
    entityTypeOnExecute: 'Wallet',
    prepareSchema: walletsPrepareTopupInputSchema,
    executeSchema: walletsExecuteTopupInputSchema,
    prepare: prepareWalletTopupForCaller,
    execute: executeWalletTopupForCaller,
    validationMessage: 'Wallet top-up details are not valid',
  },
  'wallets.setup': {
    writeFlag: 'walletSetup',
    operation: 'wallets.setup',
    entityTypeOnExecute: 'Wallet',
    prepareSchema: walletsPrepareSetupInputSchema,
    executeSchema: walletsExecuteSetupInputSchema,
    prepare: prepareWalletSetupForCaller,
    execute: executeWalletSetupForCaller,
    validationMessage: 'Wallet setup details are not valid',
  },
  'wallets.payment_order': {
    writeFlag: 'payments',
    operation: 'wallets.payment_order',
    entityTypeOnExecute: 'Wallet',
    prepareSchema: walletsPreparePaymentOrderInputSchema,
    executeSchema: walletsExecutePaymentOrderInputSchema,
    prepare: prepareWalletPaymentOrderForCaller,
    execute: executeWalletPaymentOrderForCaller,
    validationMessage: 'Payment order details are not valid',
  },
  'wallets.payment_verify': {
    writeFlag: 'payments',
    operation: 'wallets.payment_verify',
    entityTypeOnExecute: 'Wallet',
    prepareSchema: walletsPreparePaymentVerifyInputSchema,
    executeSchema: walletsExecutePaymentVerifyInputSchema,
    prepare: prepareWalletPaymentVerifyForCaller,
    execute: executeWalletPaymentVerifyForCaller,
    validationMessage: 'Payment verify details are not valid',
  },
  'campaigns.points_draft': {
    writeFlag: 'sendPoints',
    operation: 'campaigns.points_draft',
    entityTypeOnExecute: 'Campaign',
    prepareSchema: campaignsPreparePointsDraftInputSchema,
    executeSchema: campaignsExecutePointsDraftInputSchema,
    prepare: preparePointsDraftForCaller,
    execute: executePointsDraftForCaller,
    validationMessage: 'Points draft details are not valid',
  },
  'campaigns.allocate_credits': {
    writeFlag: 'sendPoints',
    operation: 'campaigns.allocate_credits',
    entityTypeOnExecute: 'Campaign',
    prepareSchema: creditPrepareInputSchema,
    executeSchema: creditExecuteInputSchema,
    prepare: prepareCreditAllocationForCaller,
    execute: executeCreditAllocationForCaller,
    validationMessage: 'Credit allocation details are not valid',
  },
  'campaigns.launch': {
    writeFlag: 'sendPoints',
    operation: 'campaigns.launch',
    entityTypeOnExecute: 'Campaign',
    prepareSchema: launchPrepareInputSchema,
    executeSchema: launchExecuteInputSchema,
    prepare: prepareLaunchForCaller,
    execute: executeLaunchForCaller,
    validationMessage: 'Campaign launch details are not valid',
  },
  'campaigns.merchandise_draft': {
    writeFlag: 'sendKits',
    operation: 'campaigns.merchandise_draft',
    entityTypeOnExecute: 'Campaign',
    prepareSchema: merchandisePrepareDraftInputSchema,
    executeSchema: merchandiseExecuteDraftInputSchema,
    prepare: prepareMerchandiseDraftForCaller,
    execute: executeMerchandiseDraftForCaller,
    validationMessage: 'Merchandise draft details are not valid',
  },
  'campaigns.merchandise_launch': {
    writeFlag: 'sendKits',
    operation: 'campaigns.merchandise_launch',
    entityTypeOnExecute: 'Campaign',
    prepareSchema: merchandisePrepareLaunchInputSchema,
    executeSchema: merchandiseExecuteLaunchInputSchema,
    prepare: prepareMerchandiseLaunchForCaller,
    execute: executeMerchandiseLaunchForCaller,
    validationMessage: 'Merchandise launch details are not valid',
  },
  'employees.create': {
    writeFlag: 'employees',
    operation: 'employees.create',
    entityTypeOnExecute: 'Contact',
    prepareSchema: employeesPrepareCreateInputSchema,
    executeSchema: employeesExecuteCreateInputSchema,
    prepare: prepareEmployeeCreateForCaller,
    execute: executeEmployeeCreateForCaller,
    validationMessage: 'Employee create details are not valid',
  },
  'employees.update': {
    writeFlag: 'employees',
    operation: 'employees.update',
    entityTypeOnExecute: 'Contact',
    prepareSchema: employeesPrepareUpdateInputSchema,
    executeSchema: employeesExecuteUpdateInputSchema,
    prepare: prepareEmployeeUpdateForCaller,
    execute: executeEmployeeUpdateForCaller,
    validationMessage: 'Employee update details are not valid',
  },
  'entities.setup': {
    writeFlag: 'entities',
    operation: 'entities.setup',
    entityTypeOnExecute: 'Entity',
    prepareSchema: entitiesPrepareSetupInputSchema,
    executeSchema: entitiesExecuteSetupInputSchema,
    prepare: prepareEntitySetupForCaller,
    execute: executeEntitySetupForCaller,
    validationMessage: 'Entity setup details are not valid',
  },
  'entities.assign_manager': {
    writeFlag: 'entities',
    operation: 'entities.assign_manager',
    entityTypeOnExecute: 'Entity',
    prepareSchema: entitiesPrepareAssignInputSchema,
    executeSchema: entitiesExecuteAssignInputSchema,
    prepare: prepareAssignManagerForCaller,
    execute: executeAssignManagerForCaller,
    validationMessage: 'Assign manager details are not valid',
  },
};

export function getWriteWorkflow(workflowId) {
  return COPILOT_WRITE_WORKFLOWS[workflowId] || null;
}

export function isWorkflowWriteEnabled(workflowId) {
  const wf = getWriteWorkflow(workflowId);
  return Boolean(wf && isWriteFlagEnabled(wf.writeFlag));
}

function requireWorkflow(workflowId) {
  const wf = getWriteWorkflow(workflowId);
  if (!wf) {
    throw new ApiError(404, `Unknown Copilot write workflow: ${workflowId}`, 'COPILOT_WORKFLOW_UNKNOWN');
  }
  if (!isWriteFlagEnabled(wf.writeFlag)) {
    throw new ApiError(404, `Write workflow ${workflowId} is not enabled in Copilot`, 'COPILOT_WRITE_DISABLED');
  }
  return wf;
}

function toolCtxFromReq(req) {
  return buildCopilotToolCtx(req);
}

export async function prepareCopilotWrite(req, workflowId, body) {
  const wf = requireWorkflow(workflowId);
  const parsed = wf.prepareSchema.safeParse(body || {});
  if (!parsed.success) {
    throw new ApiError(400, wf.validationMessage || 'Details are not valid', 'VALIDATION');
  }
  const prepared = await wf.prepare(toolCtxFromReq(req), parsed.data);
  writeAudit({
    req,
    action: `copilot.${workflowId}.prepare`,
    entityType: 'McpWriteConfirmation',
    entityId: prepared.confirmationId,
    after: {
      operation: wf.operation,
      preview: prepared.preview || null,
    },
  });
  return {
    ...prepared,
    workflow: workflowId,
    operation: wf.operation,
    request: parsed.data,
  };
}

export async function executeCopilotWrite(req, workflowId, body) {
  const wf = requireWorkflow(workflowId);
  const parsed = wf.executeSchema.safeParse(body || {});
  if (!parsed.success) {
    throw new ApiError(400, wf.validationMessage || 'Details are not valid', 'VALIDATION');
  }
  const result = await wf.execute(toolCtxFromReq(req), parsed.data);
  writeAudit({
    req,
    action: `copilot.${workflowId}.execute`,
    entityType: wf.entityTypeOnExecute || 'Unknown',
    entityId: result?.id || parsed.data.confirmationId,
    after: {
      operation: wf.operation,
      confirmationId: parsed.data.confirmationId,
      result: result && typeof result === 'object' ? { id: result.id, status: result.status, name: result.name } : null,
    },
  });
  return result;
}

/**
 * Read confirmation status and, when already consumed, safely reconcile from
 * authoritative state without forcing a new WRITE when the target is applied.
 */
export async function resolveCopilotWrite(req, workflowId, body) {
  const wf = requireWorkflow(workflowId);
  const confirmationId = String(body?.confirmationId || '').trim();
  if (!confirmationId || confirmationId.length < 20) {
    throw new ApiError(400, 'confirmationId is required', 'VALIDATION');
  }
  const confirmation = await McpWriteConfirmation.findOne({
    confirmationId,
    tenantId: req.tenantId,
    actorUserId: req.user.userId,
    operation: wf.operation,
  });
  if (!confirmation) {
    throw new ApiError(404, 'This confirmation is not valid', 'CONFIRMATION_INVALID');
  }
  if (confirmation.status === 'rejected') {
    return { status: 'cancelled', confirmationId, workflow: workflowId };
  }
  if (confirmation.status === 'pending') {
    return {
      status: 'pending',
      confirmationId,
      workflow: workflowId,
      expiresAt: confirmation.expiresAt ? new Date(confirmation.expiresAt).toISOString() : undefined,
    };
  }

  // Consumed: attempt a non-writing reconcile via execute (idempotent / already-applied path).
  const idempotencyKey = String(body?.idempotencyKey || `reconcile:${confirmationId}`).trim();
  const parsed = wf.executeSchema.safeParse({
    ...(body || {}),
    confirmationId,
    idempotencyKey,
  });
  if (!parsed.success) {
    return { status: 'consumed', confirmationId, workflow: workflowId };
  }
  try {
    const result = await wf.execute(toolCtxFromReq(req), parsed.data);
    return {
      status: 'completed',
      confirmationId,
      workflow: workflowId,
      result,
    };
  } catch {
    return { status: 'consumed', confirmationId, workflow: workflowId };
  }
}

/** Cancel = reject pending confirmation so EXECUTE cannot succeed later. */
export async function cancelCopilotWrite(req, workflowId, body) {
  const wf = requireWorkflow(workflowId);
  const confirmationId = String(body?.confirmationId || '').trim();
  if (!confirmationId || confirmationId.length < 20) {
    throw new ApiError(400, 'confirmationId is required', 'VALIDATION');
  }
  const confirmation = await McpWriteConfirmation.findOne({
    confirmationId,
    tenantId: req.tenantId,
    actorUserId: req.user.userId,
    operation: wf.operation,
  });
  if (!confirmation) {
    throw new ApiError(404, 'This confirmation is not valid', 'CONFIRMATION_INVALID');
  }
  if (confirmation.status === 'consumed') {
    throw new ForbiddenError('This confirmation was already used');
  }
  if (confirmation.status === 'pending') {
    confirmation.status = 'rejected';
    await confirmation.save();
  }
  writeAudit({
    req,
    action: `copilot.${workflowId}.cancel`,
    entityType: 'McpWriteConfirmation',
    entityId: confirmationId,
    after: { status: 'cancelled' },
  });
  return { status: 'cancelled', confirmationId, workflow: workflowId };
}

/** Back-compat aliases for Create Store. */
export function isStoreCreateWriteEnabled() {
  return isWriteFlagEnabled('storeCreate');
}

export async function prepareCopilotStoreCreate(req, body) {
  return prepareCopilotWrite(req, 'shops.create', body);
}

export async function executeCopilotStoreCreate(req, body) {
  return executeCopilotWrite(req, 'shops.create', body);
}

export async function cancelCopilotStoreCreate(req, body) {
  return cancelCopilotWrite(req, 'shops.create', body);
}

export { anyWriteDomainEnabled, writeDomainsStatus, isWriteFlagEnabled };
