/**
 * Authoritative Embedded Copilot ↔ MCP tool inventory (67 tools).
 * Handlers are bound in copilotTools / copilotWrites — this file is metadata only.
 */

function tool(entry) {
  return {
    modelVisible: entry.kind !== 'execute',
    writeFlag: null,
    mcpOperation: null,
    workflow: null,
    copilotStatus: entry.copilotStatus || 'pending',
    ...entry,
  };
}

/** @type {Array<Record<string, unknown>>} */
export const COPILOT_MCP_CATALOG = [
  // —— READ (23) ——
  tool({ name: 'catalog_search', kind: 'read', domain: 'catalog', area: 'catalog', handler: 'searchCatalog', module: 'catalogSearch', copilotStatus: 'integrated' }),
  tool({ name: 'catalog_get_product', kind: 'read', domain: 'catalog', area: 'catalog', handler: 'getCatalogProduct', module: 'catalogRead', copilotStatus: 'integrated' }),
  tool({ name: 'catalog_list_categories', kind: 'read', domain: 'catalog', area: 'catalog', handler: 'listCatalogCategories', module: 'catalogRead', copilotStatus: 'integrated' }),
  tool({ name: 'kits_list', kind: 'read', domain: 'kits', area: 'kits', handler: 'listKitsForCaller', module: 'kitsRead', copilotStatus: 'integrated' }),
  tool({ name: 'kits_get', kind: 'read', domain: 'kits', area: 'kits', handler: 'getKitForCaller', module: 'kitsRead', copilotStatus: 'integrated' }),
  tool({ name: 'kits_list_curated', kind: 'read', domain: 'kits', area: 'kits', handler: 'listCuratedKitsForCaller', module: 'kitsRead', copilotStatus: 'integrated' }),
  tool({ name: 'kits_get_curated', kind: 'read', domain: 'kits', area: 'kits', handler: 'getCuratedKitForCaller', module: 'kitsRead', copilotStatus: 'integrated' }),
  tool({ name: 'wallet_list_balances', kind: 'read', domain: 'wallets', area: 'wallets', handler: 'listBalancesForCaller', module: 'walletsRead', copilotStatus: 'integrated' }),
  tool({ name: 'wallet_list_transactions', kind: 'read', domain: 'wallets', area: 'wallets', handler: 'listTransactionsForCaller', module: 'walletsRead', copilotStatus: 'integrated' }),
  tool({ name: 'wallets_get_document_upload', kind: 'upload_status', domain: 'wallets', area: 'wallets', handler: 'getWalletDocumentUploadForCaller', module: 'walletsDocumentUpload', copilotStatus: 'integrated' }),
  tool({ name: 'entities_list', kind: 'read', domain: 'budgets', area: 'wallets', handler: 'listEntitiesForCaller', module: 'entitiesRead', copilotStatus: 'integrated' }),
  tool({ name: 'employees_search', kind: 'read', domain: 'contacts', area: 'contacts', handler: 'searchEmployeesForCaller', module: 'employeesRead', copilotStatus: 'integrated' }),
  tool({ name: 'employees_get', kind: 'read', domain: 'contacts', area: 'contacts', handler: 'getEmployeeForCaller', module: 'employeesRead', copilotStatus: 'integrated' }),
  tool({ name: 'shops_list', kind: 'read', domain: 'shops', area: 'shops', handler: 'listShopsForCaller', module: 'shopsRead', copilotStatus: 'integrated' }),
  tool({ name: 'shops_get', kind: 'read', domain: 'shops', area: 'shops', handler: 'getShopForCaller', module: 'shopsRead', copilotStatus: 'integrated' }),
  tool({ name: 'shops_get_categories', kind: 'read', domain: 'shops', area: 'shops', handler: 'getShopCategoriesForCaller', module: 'shopsCategoriesWrite', copilotStatus: 'integrated' }),
  tool({ name: 'shops_get_asset_upload', kind: 'upload_status', domain: 'shops', area: 'shops', handler: 'getShopAssetUploadForCaller', module: 'shopsAssetUpload', copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_search', kind: 'read', domain: 'campaigns', area: 'campaigns', handler: 'searchCampaignsForCaller', module: 'campaignsRead', copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_get', kind: 'read', domain: 'campaigns', area: 'campaigns', handler: 'getCampaignForCaller', module: 'campaignsRead', copilotStatus: 'integrated' }),
  tool({ name: 'orders_search', kind: 'read', domain: 'orders', area: 'orders', handler: 'searchOrdersForCaller', module: 'ordersRead', copilotStatus: 'integrated' }),
  tool({ name: 'orders_get', kind: 'read', domain: 'orders', area: 'orders', handler: 'getOrderForCaller', module: 'ordersRead', copilotStatus: 'integrated' }),
  tool({ name: 'points_summary', kind: 'read', domain: 'gifting', area: 'campaigns', handler: 'summarizePointsForCaller', module: 'pointsGiftsRead', copilotStatus: 'integrated' }),
  tool({ name: 'gifts_search', kind: 'read', domain: 'gifting', area: 'campaigns', handler: 'searchGiftsForCaller', module: 'pointsGiftsRead', copilotStatus: 'integrated' }),

  // —— PREPARE (23) ——
  tool({ name: 'shops_prepare_create', kind: 'prepare', domain: 'shops', area: 'shops', handler: 'prepareShopCreateForCaller', module: 'shopsWrite', writeFlag: 'storeCreate', mcpOperation: 'shops.create', workflow: 'shops.create', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'shops_prepare_update', kind: 'prepare', domain: 'shops', area: 'shops', handler: 'prepareShopUpdateForCaller', module: 'shopsWrite', writeFlag: 'storeUpdate', mcpOperation: 'shops.update', workflow: 'shops.update', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'shops_prepare_publish', kind: 'prepare', domain: 'shops', area: 'shops', handler: 'prepareShopPublishForCaller', module: 'shopsPublishWrite', writeFlag: 'storePublish', mcpOperation: 'shops.publish', workflow: 'shops.publish', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'shops_prepare_collection_draft', kind: 'prepare', domain: 'shops', area: 'shops', handler: 'prepareCollectionDraftForCaller', module: 'shopsCollectionWrite', writeFlag: 'collections', mcpOperation: 'shops.collection_draft', workflow: 'shops.collection_draft', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'shops_prepare_collection_publish', kind: 'prepare', domain: 'shops', area: 'shops', handler: 'prepareCollectionPublishForCaller', module: 'shopsCollectionWrite', writeFlag: 'collections', mcpOperation: 'shops.collection_publish', workflow: 'shops.collection_publish', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'shops_prepare_catalog_update', kind: 'prepare', domain: 'shops', area: 'shops', handler: 'prepareShopCatalogUpdateForCaller', module: 'shopsCatalogWrite', writeFlag: 'shopCatalog', mcpOperation: 'shops.catalog_update', workflow: 'shops.catalog_update', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'shops_prepare_categories_update', kind: 'prepare', domain: 'shops', area: 'shops', handler: 'prepareShopCategoriesUpdateForCaller', module: 'shopsCategoriesWrite', writeFlag: 'shopCategories', mcpOperation: 'shops.categories_update', workflow: 'shops.categories_update', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'shops_prepare_asset_upload', kind: 'upload_prepare', domain: 'shops', area: 'shops', handler: 'prepareShopAssetUploadForCaller', module: 'shopsAssetUpload', writeFlag: 'storeCreate', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'budget_prepare_allocation', kind: 'prepare', domain: 'budgets', area: 'wallets', handler: 'prepareBudgetAllocationForCaller', module: 'budgetsWrite', writeFlag: 'budgets', mcpOperation: 'wallets.allocate', workflow: 'budget.allocate', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'wallets_prepare_topup', kind: 'prepare', domain: 'wallets', area: 'wallets', handler: 'prepareWalletTopupForCaller', module: 'walletsTopupWrite', writeFlag: 'walletTopup', mcpOperation: 'wallets.topup', workflow: 'wallets.topup', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'wallets_prepare_document_upload', kind: 'upload_prepare', domain: 'wallets', area: 'wallets', handler: 'prepareWalletDocumentUploadForCaller', module: 'walletsDocumentUpload', writeFlag: 'walletTopup', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'wallets_prepare_setup', kind: 'prepare', domain: 'wallets', area: 'wallets', handler: 'prepareWalletSetupForCaller', module: 'walletsSetupWrite', writeFlag: 'walletSetup', mcpOperation: 'wallets.setup', workflow: 'wallets.setup', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'wallets_prepare_payment_order', kind: 'prepare', domain: 'wallets', area: 'wallets', handler: 'prepareWalletPaymentOrderForCaller', module: 'walletsSetupWrite', writeFlag: 'payments', mcpOperation: 'wallets.payment_order', workflow: 'wallets.payment_order', modelVisible: true, copilotStatus: 'blocked' }),
  tool({ name: 'wallets_prepare_payment_verify', kind: 'prepare', domain: 'wallets', area: 'wallets', handler: 'prepareWalletPaymentVerifyForCaller', module: 'walletsSetupWrite', writeFlag: 'payments', mcpOperation: 'wallets.payment_verify', workflow: 'wallets.payment_verify', modelVisible: true, copilotStatus: 'blocked' }),
  tool({ name: 'campaigns_prepare_points_draft', kind: 'prepare', domain: 'gifting', area: 'campaignOps', handler: 'preparePointsDraftForCaller', module: 'campaignsDraftWrite', writeFlag: 'sendPoints', mcpOperation: 'campaigns.points_draft', workflow: 'campaigns.points_draft', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_prepare_credit_allocation', kind: 'prepare', domain: 'gifting', area: 'campaignOps', handler: 'prepareCreditAllocationForCaller', module: 'campaignsSendWrite', writeFlag: 'sendPoints', mcpOperation: 'campaigns.allocate_credits', workflow: 'campaigns.allocate_credits', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_prepare_launch', kind: 'prepare', domain: 'gifting', area: 'campaignOps', handler: 'prepareLaunchForCaller', module: 'campaignsSendWrite', writeFlag: 'sendPoints', mcpOperation: 'campaigns.launch', workflow: 'campaigns.launch', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_prepare_merchandise_draft', kind: 'prepare', domain: 'gifting', area: 'campaignOps', handler: 'prepareMerchandiseDraftForCaller', module: 'campaignsMerchandiseWrite', writeFlag: 'sendKits', mcpOperation: 'campaigns.merchandise_draft', workflow: 'campaigns.merchandise_draft', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_prepare_merchandise_launch', kind: 'prepare', domain: 'gifting', area: 'campaignOps', handler: 'prepareMerchandiseLaunchForCaller', module: 'campaignsMerchandiseWrite', writeFlag: 'sendKits', mcpOperation: 'campaigns.merchandise_launch', workflow: 'campaigns.merchandise_launch', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'employees_prepare_create', kind: 'prepare', domain: 'contacts', area: 'contacts', handler: 'prepareEmployeeCreateForCaller', module: 'employeesWrite', writeFlag: 'employees', mcpOperation: 'employees.create', workflow: 'employees.create', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'employees_prepare_update', kind: 'prepare', domain: 'contacts', area: 'contacts', handler: 'prepareEmployeeUpdateForCaller', module: 'employeesWrite', writeFlag: 'employees', mcpOperation: 'employees.update', workflow: 'employees.update', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'entities_prepare_setup', kind: 'prepare', domain: 'budgets', area: 'wallets', handler: 'prepareEntitySetupForCaller', module: 'entitiesWrite', writeFlag: 'entities', mcpOperation: 'entities.setup', workflow: 'entities.setup', modelVisible: true, copilotStatus: 'integrated' }),
  tool({ name: 'entities_prepare_assign_manager', kind: 'prepare', domain: 'budgets', area: 'wallets', handler: 'prepareAssignManagerForCaller', module: 'entitiesWrite', writeFlag: 'entities', mcpOperation: 'entities.assign_manager', workflow: 'entities.assign_manager', modelVisible: true, copilotStatus: 'integrated' }),

  // —— EXECUTE (21) — never model-visible ——
  tool({ name: 'shops_execute_create', kind: 'execute', domain: 'shops', area: 'shops', handler: 'executeShopCreateForCaller', module: 'shopsWrite', writeFlag: 'storeCreate', mcpOperation: 'shops.create', workflow: 'shops.create', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'shops_execute_update', kind: 'execute', domain: 'shops', area: 'shops', handler: 'executeShopUpdateForCaller', module: 'shopsWrite', writeFlag: 'storeUpdate', mcpOperation: 'shops.update', workflow: 'shops.update', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'shops_execute_publish', kind: 'execute', domain: 'shops', area: 'shops', handler: 'executeShopPublishForCaller', module: 'shopsPublishWrite', writeFlag: 'storePublish', mcpOperation: 'shops.publish', workflow: 'shops.publish', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'shops_execute_collection_draft', kind: 'execute', domain: 'shops', area: 'shops', handler: 'executeCollectionDraftForCaller', module: 'shopsCollectionWrite', writeFlag: 'collections', mcpOperation: 'shops.collection_draft', workflow: 'shops.collection_draft', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'shops_execute_collection_publish', kind: 'execute', domain: 'shops', area: 'shops', handler: 'executeCollectionPublishForCaller', module: 'shopsCollectionWrite', writeFlag: 'collections', mcpOperation: 'shops.collection_publish', workflow: 'shops.collection_publish', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'shops_execute_catalog_update', kind: 'execute', domain: 'shops', area: 'shops', handler: 'executeShopCatalogUpdateForCaller', module: 'shopsCatalogWrite', writeFlag: 'shopCatalog', mcpOperation: 'shops.catalog_update', workflow: 'shops.catalog_update', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'shops_execute_categories_update', kind: 'execute', domain: 'shops', area: 'shops', handler: 'executeShopCategoriesUpdateForCaller', module: 'shopsCategoriesWrite', writeFlag: 'shopCategories', mcpOperation: 'shops.categories_update', workflow: 'shops.categories_update', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'budget_execute_allocation', kind: 'execute', domain: 'budgets', area: 'wallets', handler: 'executeBudgetAllocationForCaller', module: 'budgetsWrite', writeFlag: 'budgets', mcpOperation: 'wallets.allocate', workflow: 'budget.allocate', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'wallets_execute_topup', kind: 'execute', domain: 'wallets', area: 'wallets', handler: 'executeWalletTopupForCaller', module: 'walletsTopupWrite', writeFlag: 'walletTopup', mcpOperation: 'wallets.topup', workflow: 'wallets.topup', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'wallets_execute_setup', kind: 'execute', domain: 'wallets', area: 'wallets', handler: 'executeWalletSetupForCaller', module: 'walletsSetupWrite', writeFlag: 'walletSetup', mcpOperation: 'wallets.setup', workflow: 'wallets.setup', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'wallets_execute_payment_order', kind: 'execute', domain: 'wallets', area: 'wallets', handler: 'executeWalletPaymentOrderForCaller', module: 'walletsSetupWrite', writeFlag: 'payments', mcpOperation: 'wallets.payment_order', workflow: 'wallets.payment_order', modelVisible: false, copilotStatus: 'blocked' }),
  tool({ name: 'wallets_execute_payment_verify', kind: 'execute', domain: 'wallets', area: 'wallets', handler: 'executeWalletPaymentVerifyForCaller', module: 'walletsSetupWrite', writeFlag: 'payments', mcpOperation: 'wallets.payment_verify', workflow: 'wallets.payment_verify', modelVisible: false, copilotStatus: 'blocked' }),
  tool({ name: 'campaigns_execute_points_draft', kind: 'execute', domain: 'gifting', area: 'campaignOps', handler: 'executePointsDraftForCaller', module: 'campaignsDraftWrite', writeFlag: 'sendPoints', mcpOperation: 'campaigns.points_draft', workflow: 'campaigns.points_draft', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_execute_credit_allocation', kind: 'execute', domain: 'gifting', area: 'campaignOps', handler: 'executeCreditAllocationForCaller', module: 'campaignsSendWrite', writeFlag: 'sendPoints', mcpOperation: 'campaigns.allocate_credits', workflow: 'campaigns.allocate_credits', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_execute_launch', kind: 'execute', domain: 'gifting', area: 'campaignOps', handler: 'executeLaunchForCaller', module: 'campaignsSendWrite', writeFlag: 'sendPoints', mcpOperation: 'campaigns.launch', workflow: 'campaigns.launch', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_execute_merchandise_draft', kind: 'execute', domain: 'gifting', area: 'campaignOps', handler: 'executeMerchandiseDraftForCaller', module: 'campaignsMerchandiseWrite', writeFlag: 'sendKits', mcpOperation: 'campaigns.merchandise_draft', workflow: 'campaigns.merchandise_draft', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'campaigns_execute_merchandise_launch', kind: 'execute', domain: 'gifting', area: 'campaignOps', handler: 'executeMerchandiseLaunchForCaller', module: 'campaignsMerchandiseWrite', writeFlag: 'sendKits', mcpOperation: 'campaigns.merchandise_launch', workflow: 'campaigns.merchandise_launch', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'employees_execute_create', kind: 'execute', domain: 'contacts', area: 'contacts', handler: 'executeEmployeeCreateForCaller', module: 'employeesWrite', writeFlag: 'employees', mcpOperation: 'employees.create', workflow: 'employees.create', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'employees_execute_update', kind: 'execute', domain: 'contacts', area: 'contacts', handler: 'executeEmployeeUpdateForCaller', module: 'employeesWrite', writeFlag: 'employees', mcpOperation: 'employees.update', workflow: 'employees.update', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'entities_execute_setup', kind: 'execute', domain: 'budgets', area: 'wallets', handler: 'executeEntitySetupForCaller', module: 'entitiesWrite', writeFlag: 'entities', mcpOperation: 'entities.setup', workflow: 'entities.setup', modelVisible: false, copilotStatus: 'integrated' }),
  tool({ name: 'entities_execute_assign_manager', kind: 'execute', domain: 'budgets', area: 'wallets', handler: 'executeAssignManagerForCaller', module: 'entitiesWrite', writeFlag: 'entities', mcpOperation: 'entities.assign_manager', workflow: 'entities.assign_manager', modelVisible: false, copilotStatus: 'integrated' }),
];

export const COPILOT_MCP_TOOL_NAMES = COPILOT_MCP_CATALOG.map((row) => row.name);

export function catalogByName(name) {
  return COPILOT_MCP_CATALOG.find((row) => row.name === name) || null;
}

export function catalogCounts() {
  const counts = { read: 0, prepare: 0, execute: 0, upload_prepare: 0, upload_status: 0 };
  for (const row of COPILOT_MCP_CATALOG) {
    counts[row.kind] = (counts[row.kind] || 0) + 1;
  }
  return { total: COPILOT_MCP_CATALOG.length, ...counts };
}

export function workflowsFromCatalog() {
  const map = new Map();
  for (const row of COPILOT_MCP_CATALOG) {
    if (!row.workflow) continue;
    const existing = map.get(row.workflow) || {
      id: row.workflow,
      domain: row.domain,
      area: row.area,
      writeFlag: row.writeFlag,
      mcpOperation: row.mcpOperation,
      prepareTool: null,
      executeTool: null,
    };
    if (row.kind === 'prepare') existing.prepareTool = row.name;
    if (row.kind === 'execute') existing.executeTool = row.name;
    map.set(row.workflow, existing);
  }
  return [...map.values()];
}
