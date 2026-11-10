import { z } from 'zod';
import { CATALOG_INVENTORY_RULE, catalogSearchInputSchema, searchCatalog } from '../mcp/catalogSearch.js';
import {
  catalogGetProductInputSchema,
  catalogListCategoriesInputSchema,
  getCatalogProduct,
  listCatalogCategories,
} from '../mcp/catalogRead.js';
import {
  kitsGetCuratedInputSchema,
  kitsGetInputSchema,
  kitsListCuratedInputSchema,
  kitsListInputSchema,
  getCuratedKitForCaller,
  getKitForCaller,
  listCuratedKitsForCaller,
  listKitsForCaller,
} from '../mcp/kitsRead.js';
import { listBalancesForCaller, listTransactionsForCaller, walletTransactionsInputSchema } from '../mcp/walletsRead.js';
import { entitiesListInputSchema, listEntitiesForCaller } from '../mcp/entitiesRead.js';
import { employeesSearchInputSchema, employeesGetInputSchema, getEmployeeForCaller, searchEmployeesForCaller } from '../mcp/employeesRead.js';
import { shopsListInputSchema, shopsGetInputSchema, getShopForCaller, listShopsForCaller } from '../mcp/shopsRead.js';
import { campaignsSearchInputSchema, campaignsGetInputSchema, getCampaignForCaller, searchCampaignsForCaller } from '../mcp/campaignsRead.js';
import { ordersSearchInputSchema, ordersGetInputSchema, getOrderForCaller, searchOrdersForCaller } from '../mcp/ordersRead.js';
import {
  giftsSearchInputSchema,
  pointsSummaryInputSchema,
  searchGiftsForCaller,
  summarizePointsForCaller,
} from '../mcp/pointsGiftsRead.js';
import {
  SHOPS_PREPARE_CREATE_DESCRIPTION,
  SHOPS_EXECUTE_CREATE_DESCRIPTION,
  SHOPS_PREPARE_UPDATE_DESCRIPTION,
  SHOPS_EXECUTE_UPDATE_DESCRIPTION,
  prepareShopCreateForCaller,
  executeShopCreateForCaller,
  prepareShopUpdateForCaller,
  executeShopUpdateForCaller,
  shopsPrepareCreateInputSchema,
  shopsPrepareUpdateInputSchema,
} from '../mcp/shopsWrite.js';
import {
  SHOPS_PREPARE_PUBLISH_DESCRIPTION,
  SHOPS_EXECUTE_PUBLISH_DESCRIPTION,
  prepareShopPublishForCaller,
  executeShopPublishForCaller,
  shopsPreparePublishInputSchema,
} from '../mcp/shopsPublishWrite.js';
import {
  COLLECTION_PREPARE_DRAFT_DESCRIPTION,
  COLLECTION_EXECUTE_DRAFT_DESCRIPTION,
  COLLECTION_PREPARE_PUBLISH_DESCRIPTION,
  COLLECTION_EXECUTE_PUBLISH_DESCRIPTION,
  prepareCollectionDraftForCaller,
  executeCollectionDraftForCaller,
  prepareCollectionPublishForCaller,
  executeCollectionPublishForCaller,
  collectionPrepareDraftInputSchema,
  collectionPreparePublishInputSchema,
} from '../mcp/shopsCollectionWrite.js';
import {
  SHOPS_PREPARE_CATALOG_DESCRIPTION,
  SHOPS_EXECUTE_CATALOG_DESCRIPTION,
  prepareShopCatalogUpdateForCaller,
  executeShopCatalogUpdateForCaller,
  shopsPrepareCatalogInputSchema,
} from '../mcp/shopsCatalogWrite.js';
import {
  SHOPS_GET_CATEGORIES_DESCRIPTION,
  SHOPS_PREPARE_CATEGORIES_DESCRIPTION,
  SHOPS_EXECUTE_CATEGORIES_DESCRIPTION,
  getShopCategoriesForCaller,
  prepareShopCategoriesUpdateForCaller,
  executeShopCategoriesUpdateForCaller,
  shopsGetCategoriesInputSchema,
  shopsPrepareCategoriesInputSchema,
} from '../mcp/shopsCategoriesWrite.js';
import {
  SHOPS_PREPARE_ASSET_UPLOAD_DESCRIPTION,
  SHOPS_GET_ASSET_UPLOAD_DESCRIPTION,
  prepareShopAssetUploadForCaller,
  getShopAssetUploadForCaller,
  shopsPrepareAssetUploadInputSchema,
  shopsGetAssetUploadInputSchema,
} from '../mcp/shopsAssetUpload.js';
import {
  BUDGET_PREPARE_DESCRIPTION,
  BUDGET_EXECUTE_DESCRIPTION,
  prepareBudgetAllocationForCaller,
  executeBudgetAllocationForCaller,
  budgetPrepareInputSchema,
} from '../mcp/budgetsWrite.js';
import {
  WALLETS_PREPARE_TOPUP_DESCRIPTION,
  WALLETS_EXECUTE_TOPUP_DESCRIPTION,
  prepareWalletTopupForCaller,
  executeWalletTopupForCaller,
  walletsPrepareTopupInputSchema,
} from '../mcp/walletsTopupWrite.js';
import {
  WALLETS_PREPARE_DOCUMENT_UPLOAD_DESCRIPTION,
  WALLETS_GET_DOCUMENT_UPLOAD_DESCRIPTION,
  prepareWalletDocumentUploadForCaller,
  getWalletDocumentUploadForCaller,
  walletsPrepareDocumentUploadInputSchema,
  walletsGetDocumentUploadInputSchema,
} from '../mcp/walletsDocumentUpload.js';
import {
  WALLETS_PREPARE_SETUP_DESCRIPTION,
  WALLETS_EXECUTE_SETUP_DESCRIPTION,
  WALLETS_PREPARE_PAYMENT_ORDER_DESCRIPTION,
  WALLETS_EXECUTE_PAYMENT_ORDER_DESCRIPTION,
  WALLETS_PREPARE_PAYMENT_VERIFY_DESCRIPTION,
  WALLETS_EXECUTE_PAYMENT_VERIFY_DESCRIPTION,
  prepareWalletSetupForCaller,
  executeWalletSetupForCaller,
  prepareWalletPaymentOrderForCaller,
  executeWalletPaymentOrderForCaller,
  prepareWalletPaymentVerifyForCaller,
  executeWalletPaymentVerifyForCaller,
  walletsPrepareSetupInputSchema,
  walletsPreparePaymentOrderInputSchema,
  walletsPreparePaymentVerifyInputSchema,
} from '../mcp/walletsSetupWrite.js';
import {
  CAMPAIGNS_PREPARE_POINTS_DRAFT_DESCRIPTION,
  CAMPAIGNS_EXECUTE_POINTS_DRAFT_DESCRIPTION,
  preparePointsDraftForCaller,
  executePointsDraftForCaller,
  campaignsPreparePointsDraftInputSchema,
} from '../mcp/campaignsDraftWrite.js';
import {
  CREDIT_PREPARE_DESCRIPTION,
  CREDIT_EXECUTE_DESCRIPTION,
  LAUNCH_PREPARE_DESCRIPTION,
  LAUNCH_EXECUTE_DESCRIPTION,
  prepareCreditAllocationForCaller,
  executeCreditAllocationForCaller,
  prepareLaunchForCaller,
  executeLaunchForCaller,
  creditPrepareInputSchema,
  launchPrepareInputSchema,
} from '../mcp/campaignsSendWrite.js';
import {
  MERCHANDISE_PREPARE_DRAFT_DESCRIPTION,
  MERCHANDISE_EXECUTE_DRAFT_DESCRIPTION,
  MERCHANDISE_PREPARE_LAUNCH_DESCRIPTION,
  MERCHANDISE_EXECUTE_LAUNCH_DESCRIPTION,
  prepareMerchandiseDraftForCaller,
  executeMerchandiseDraftForCaller,
  prepareMerchandiseLaunchForCaller,
  executeMerchandiseLaunchForCaller,
  merchandisePrepareDraftInputSchema,
  merchandisePrepareLaunchInputSchema,
} from '../mcp/campaignsMerchandiseWrite.js';
import {
  EMPLOYEES_PREPARE_CREATE_DESCRIPTION,
  EMPLOYEES_EXECUTE_CREATE_DESCRIPTION,
  EMPLOYEES_PREPARE_UPDATE_DESCRIPTION,
  EMPLOYEES_EXECUTE_UPDATE_DESCRIPTION,
  prepareEmployeeCreateForCaller,
  executeEmployeeCreateForCaller,
  prepareEmployeeUpdateForCaller,
  executeEmployeeUpdateForCaller,
  employeesPrepareCreateInputSchema,
  employeesPrepareUpdateInputSchema,
} from '../mcp/employeesWrite.js';
import {
  ENTITIES_PREPARE_SETUP_DESCRIPTION,
  ENTITIES_EXECUTE_SETUP_DESCRIPTION,
  ENTITIES_PREPARE_ASSIGN_DESCRIPTION,
  ENTITIES_EXECUTE_ASSIGN_DESCRIPTION,
  prepareEntitySetupForCaller,
  executeEntitySetupForCaller,
  prepareAssignManagerForCaller,
  executeAssignManagerForCaller,
  entitiesPrepareSetupInputSchema,
  entitiesPrepareAssignInputSchema,
} from '../mcp/entitiesWrite.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';

export function zodParams(schema) {
  if (typeof z.toJSONSchema === 'function') {
    try {
      const json = z.toJSONSchema(schema, { target: 'openapi-3.0' });
      const { $schema, ...rest } = json;
      return rest;
    } catch {
      return { type: 'object', additionalProperties: true };
    }
  }
  return { type: 'object', additionalProperties: true };
}

const PREPARE_HINT =
  'In Embedded Copilot, after prepare succeeds, show the confirmation card and wait for the user to Confirm or Cancel. Never call the matching execute tool yourself — execute is confirmation-UI only.';

export function confirmationArtifact(operation, result) {
  return {
    kind: 'confirmation',
    operation,
    confirmationId: result.confirmationId,
    expiresAt: result.expiresAt,
    preview: result.preview,
    request: result.request,
    status: 'pending',
  };
}

function asText(description) {
  return Array.isArray(description) ? description.join(' ') : String(description || '');
}

function prepareTool({ name, area, description, parameters, schema, run, operation }) {
  return {
    name,
    area,
    action: 'write',
    modelVisible: true,
    description: `${asText(description)} ${PREPARE_HINT}`,
    parameters: parameters || zodParams(schema),
    async run(ctx, args) {
      const request = schema ? schema.parse(args ?? {}) : args ?? {};
      const prepared = await run(ctx, request);
      return { ...prepared, request };
    },
    artifacts(result) {
      return [confirmationArtifact(operation, result)];
    },
  };
}

function executeGateTool({ name, area, description, parameters }) {
  return {
    name,
    area,
    action: 'write',
    modelVisible: false,
    description: asText(description),
    parameters: parameters || { type: 'object', additionalProperties: true },
    async run() {
      throw new ForbiddenError(
        `${name} is confirmation-UI only. Use the Confirm button in Copilot.`,
      );
    },
  };
}

function uploadPrepareTool({ name, area, description, schema, run }) {
  return {
    name,
    area,
    action: 'write',
    modelVisible: true,
    description: asText(description),
    parameters: zodParams(schema),
    async run(ctx, args) {
      return run(ctx, schema.parse(args ?? {}));
    },
  };
}

/** Plain OpenAI params — Zod transforms cannot serialize for create/update/setup. */
const STORE_CREATE_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    currencyMode: { type: 'string', enum: ['points', 'inr'] },
    slug: { type: 'string' },
    pointsConversionEnabled: { type: 'boolean' },
    companyEmailDomain: { type: 'string' },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    logoUrl: { type: 'string' },
    logoTicketId: { type: 'string' },
    bannerTicketId: { type: 'string' },
  },
  required: ['name'],
};

const STORE_UPDATE_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shopId: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    companyEmailDomain: { type: 'string' },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    logoUrl: { type: 'string' },
    logoTicketId: { type: 'string' },
    bannerTicketId: { type: 'string' },
  },
  required: ['shopId'],
};

const WALLET_SETUP_PARAMETERS = {
  type: 'object',
  additionalProperties: true,
  properties: {
    name: { type: 'string' },
    currency: { type: 'string' },
    fundingMethod: { type: 'string' },
  },
};

export function buildCopilotToolDefinitions() {
  const reads = [
    {
      name: 'catalog_search',
      area: 'catalog',
      description: ['Search the ShelfMerch selling catalog for real inventory.', CATALOG_INVENTORY_RULE].join(' '),
      parameters: zodParams(catalogSearchInputSchema),
      async run(_ctx, args) {
        return searchCatalog(catalogSearchInputSchema.parse(args ?? {}));
      },
      artifacts(result) {
        return (result?.items ?? []).map((item) => ({ kind: 'product', product: item }));
      },
    },
    {
      name: 'catalog_get_product',
      area: 'catalog',
      description: 'Look up one ShelfMerch catalog product by id from catalog_search.',
      parameters: zodParams(catalogGetProductInputSchema),
      async run(_ctx, args) {
        const { productId } = catalogGetProductInputSchema.parse(args ?? {});
        const product = await getCatalogProduct(productId);
        if (!product) throw new NotFoundError('Product not found');
        return product;
      },
      artifacts(result) {
        return result ? [{ kind: 'product', product: result }] : [];
      },
    },
    {
      name: 'catalog_list_categories',
      area: 'catalog',
      description: 'List ShelfMerch catalog product categories.',
      parameters: zodParams(catalogListCategoriesInputSchema),
      async run() {
        return listCatalogCategories();
      },
    },
    {
      name: 'kits_list',
      area: 'kits',
      description: 'List customized workspace kits the caller can view.',
      parameters: zodParams(kitsListInputSchema),
      async run(ctx, args) {
        return listKitsForCaller(ctx, kitsListInputSchema.parse(args ?? {}));
      },
      artifacts(result) {
        return (result?.items ?? []).map((kit) => ({ kind: 'kit', kit }));
      },
    },
    {
      name: 'kits_get',
      area: 'kits',
      description: 'Get one customized workspace kit by id.',
      parameters: zodParams(kitsGetInputSchema),
      async run(ctx, args) {
        return getKitForCaller(ctx, kitsGetInputSchema.parse(args ?? {}));
      },
      artifacts(result) {
        return result ? [{ kind: 'kit', kit: result }] : [];
      },
    },
    {
      name: 'kits_list_curated',
      area: 'kits',
      description: 'List platform-curated kits available to send.',
      parameters: zodParams(kitsListCuratedInputSchema),
      async run(ctx, args) {
        return listCuratedKitsForCaller(ctx, kitsListCuratedInputSchema.parse(args ?? {}));
      },
      artifacts(result) {
        return (result?.items ?? []).map((kit) => ({ kind: 'kit', kit: { ...kit, curated: true } }));
      },
    },
    {
      name: 'kits_get_curated',
      area: 'kits',
      description: 'Get one platform-curated kit by id.',
      parameters: zodParams(kitsGetCuratedInputSchema),
      async run(ctx, args) {
        return getCuratedKitForCaller(ctx, kitsGetCuratedInputSchema.parse(args ?? {}));
      },
      artifacts(result) {
        return result ? [{ kind: 'kit', kit: { ...result, curated: true } }] : [];
      },
    },
    {
      name: 'wallet_list_balances',
      area: 'wallets',
      description:
        'List organization wallet balances for company admins. balance is organization cash. allocatedAmount is outstanding earmarks (allocations minus department spends), not the sum of department allocatedAmount columns. unallocatedAmount is balance minus allocatedAmount. Entity managers receive an empty organization cash list; use entities_list for department budgets.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async run(ctx) {
        return listBalancesForCaller(ctx);
      },
      artifacts(result) {
        if (result?.scope === 'department') return [];
        return (result?.items ?? []).map((wallet) => ({
          kind: 'wallet_balance',
          scope: 'organization',
          wallet: {
            id: String(wallet.id ?? ''),
            name: String(wallet.name ?? ''),
            currency: String(wallet.currency ?? 'INR'),
            status: String(wallet.status ?? ''),
            balance: Number(wallet.balance) || 0,
            allocatedAmount: Number(wallet.allocatedAmount) || 0,
            unallocatedAmount: Number(wallet.unallocatedAmount) || 0,
            fundingPending: Boolean(wallet.fundingPending),
          },
        }));
      },
    },
    {
      name: 'wallet_list_transactions',
      area: 'wallets',
      description: 'List ledger activity the caller is allowed to see for one wallet.',
      parameters: zodParams(walletTransactionsInputSchema),
      async run(ctx, args) {
        return listTransactionsForCaller(ctx, walletTransactionsInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'wallets_get_document_upload',
      area: 'wallets',
      description: asText(WALLETS_GET_DOCUMENT_UPLOAD_DESCRIPTION),
      parameters: zodParams(walletsGetDocumentUploadInputSchema),
      async run(ctx, args) {
        return getWalletDocumentUploadForCaller(ctx, walletsGetDocumentUploadInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'entities_list',
      area: 'wallets',
      description:
        'List departments and budget remaining visible to the caller. allocatedAmount is gross department allocation; remainingAmount is what remains to spend. For organization wallet reconciliation, compare wallet allocatedAmount to the sum of remainingAmount, not allocatedAmount.',
      parameters: zodParams(entitiesListInputSchema),
      async run(ctx, args) {
        return listEntitiesForCaller(ctx, entitiesListInputSchema.parse(args ?? {}));
      },
      artifacts(result) {
        const departments = result?.departments ?? [];
        if (!departments.length) return [];
        return [
          {
            kind: 'department_budgets',
            scope: 'department',
            departments: departments.map((row) => ({
              entityId: String(row.entityId ?? ''),
              name: String(row.name ?? ''),
              allocatedAmount: Number(row.allocatedAmount) || 0,
              spentAmount: Number(row.spentAmount) || 0,
              remainingAmount: Number(row.remainingAmount) || 0,
              walletId: String(row.walletId ?? ''),
              walletName: String(row.walletName ?? ''),
            })),
          },
        ];
      },
    },
    {
      name: 'employees_search',
      area: 'contacts',
      description: 'Search employees / contacts in the workspace.',
      parameters: zodParams(employeesSearchInputSchema),
      async run(ctx, args) {
        return searchEmployeesForCaller(ctx, employeesSearchInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'employees_get',
      area: 'contacts',
      description: 'Get one employee / contact by id.',
      parameters: zodParams(employeesGetInputSchema),
      async run(ctx, args) {
        const { contactId } = employeesGetInputSchema.parse(args ?? {});
        return getEmployeeForCaller(ctx, contactId);
      },
    },
    {
      name: 'shops_list',
      area: 'shops',
      description: 'List stores in the signed-in workspace.',
      parameters: zodParams(shopsListInputSchema),
      async run(ctx, args) {
        return listShopsForCaller(ctx, shopsListInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'shops_get',
      area: 'shops',
      description: 'Get one store by id.',
      parameters: zodParams(shopsGetInputSchema),
      async run(ctx, args) {
        return getShopForCaller(ctx, shopsGetInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'shops_get_categories',
      area: 'shops',
      description: asText(SHOPS_GET_CATEGORIES_DESCRIPTION),
      parameters: zodParams(shopsGetCategoriesInputSchema),
      async run(ctx, args) {
        return getShopCategoriesForCaller(ctx, shopsGetCategoriesInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'shops_get_asset_upload',
      area: 'shops',
      description: asText(SHOPS_GET_ASSET_UPLOAD_DESCRIPTION),
      parameters: zodParams(shopsGetAssetUploadInputSchema),
      async run(ctx, args) {
        return getShopAssetUploadForCaller(ctx, shopsGetAssetUploadInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'campaigns_search',
      area: 'campaigns',
      description: 'Search campaigns in the workspace.',
      parameters: zodParams(campaignsSearchInputSchema),
      async run(ctx, args) {
        return searchCampaignsForCaller(ctx, campaignsSearchInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'campaigns_get',
      area: 'campaigns',
      description: 'Get one campaign by id.',
      parameters: zodParams(campaignsGetInputSchema),
      async run(ctx, args) {
        const { campaignId } = campaignsGetInputSchema.parse(args ?? {});
        return getCampaignForCaller(ctx, campaignId);
      },
    },
    {
      name: 'orders_search',
      area: 'orders',
      description: 'Search orders in the workspace.',
      parameters: zodParams(ordersSearchInputSchema),
      async run(ctx, args) {
        return searchOrdersForCaller(ctx, ordersSearchInputSchema.parse(args ?? {}));
      },
    },
    {
      name: 'orders_get',
      area: 'orders',
      description: 'Get one order by id.',
      parameters: zodParams(ordersGetInputSchema),
      async run(ctx, args) {
        const { orderId } = ordersGetInputSchema.parse(args ?? {});
        return getOrderForCaller(ctx, orderId);
      },
    },
    {
      name: 'points_summary',
      area: 'campaigns',
      description: 'Summarize points / credits available for gifting in this workspace.',
      parameters: zodParams(pointsSummaryInputSchema),
      async run(ctx) {
        return summarizePointsForCaller(ctx);
      },
    },
    {
      name: 'gifts_search',
      area: 'campaigns',
      description: 'Search gift / points campaign history the caller can view.',
      parameters: zodParams(giftsSearchInputSchema),
      async run(ctx, args) {
        return searchGiftsForCaller(ctx, giftsSearchInputSchema.parse(args ?? {}));
      },
    },
  ];

  const writes = [
    prepareTool({
      name: 'shops_prepare_create',
      area: 'shops',
      description: SHOPS_PREPARE_CREATE_DESCRIPTION,
      parameters: STORE_CREATE_PARAMETERS,
      schema: shopsPrepareCreateInputSchema,
      run: prepareShopCreateForCaller,
      operation: 'shops.create',
    }),
    executeGateTool({
      name: 'shops_execute_create',
      area: 'shops',
      description: SHOPS_EXECUTE_CREATE_DESCRIPTION,
      parameters: {
        ...STORE_CREATE_PARAMETERS,
        required: ['name', 'confirmationId', 'idempotencyKey'],
        properties: {
          ...STORE_CREATE_PARAMETERS.properties,
          confirmationId: { type: 'string', minLength: 20, maxLength: 200 },
          idempotencyKey: { type: 'string', minLength: 8, maxLength: 200 },
        },
      },
    }),
    prepareTool({
      name: 'shops_prepare_update',
      area: 'shops',
      description: SHOPS_PREPARE_UPDATE_DESCRIPTION,
      parameters: STORE_UPDATE_PARAMETERS,
      schema: shopsPrepareUpdateInputSchema,
      run: prepareShopUpdateForCaller,
      operation: 'shops.update',
    }),
    executeGateTool({ name: 'shops_execute_update', area: 'shops', description: SHOPS_EXECUTE_UPDATE_DESCRIPTION }),
    prepareTool({
      name: 'shops_prepare_publish',
      area: 'shops',
      description: SHOPS_PREPARE_PUBLISH_DESCRIPTION,
      schema: shopsPreparePublishInputSchema,
      run: prepareShopPublishForCaller,
      operation: 'shops.publish',
    }),
    executeGateTool({ name: 'shops_execute_publish', area: 'shops', description: SHOPS_EXECUTE_PUBLISH_DESCRIPTION }),
    prepareTool({
      name: 'shops_prepare_collection_draft',
      area: 'shops',
      description: COLLECTION_PREPARE_DRAFT_DESCRIPTION,
      schema: collectionPrepareDraftInputSchema,
      run: prepareCollectionDraftForCaller,
      operation: 'shops.collection_draft',
    }),
    executeGateTool({
      name: 'shops_execute_collection_draft',
      area: 'shops',
      description: COLLECTION_EXECUTE_DRAFT_DESCRIPTION,
    }),
    prepareTool({
      name: 'shops_prepare_collection_publish',
      area: 'shops',
      description: COLLECTION_PREPARE_PUBLISH_DESCRIPTION,
      schema: collectionPreparePublishInputSchema,
      run: prepareCollectionPublishForCaller,
      operation: 'shops.collection_publish',
    }),
    executeGateTool({
      name: 'shops_execute_collection_publish',
      area: 'shops',
      description: COLLECTION_EXECUTE_PUBLISH_DESCRIPTION,
    }),
    prepareTool({
      name: 'shops_prepare_catalog_update',
      area: 'shops',
      description: SHOPS_PREPARE_CATALOG_DESCRIPTION,
      schema: shopsPrepareCatalogInputSchema,
      run: prepareShopCatalogUpdateForCaller,
      operation: 'shops.catalog_update',
    }),
    executeGateTool({
      name: 'shops_execute_catalog_update',
      area: 'shops',
      description: SHOPS_EXECUTE_CATALOG_DESCRIPTION,
    }),
    prepareTool({
      name: 'shops_prepare_categories_update',
      area: 'shops',
      description: SHOPS_PREPARE_CATEGORIES_DESCRIPTION,
      schema: shopsPrepareCategoriesInputSchema,
      run: prepareShopCategoriesUpdateForCaller,
      operation: 'shops.categories_update',
    }),
    executeGateTool({
      name: 'shops_execute_categories_update',
      area: 'shops',
      description: SHOPS_EXECUTE_CATEGORIES_DESCRIPTION,
    }),
    uploadPrepareTool({
      name: 'shops_prepare_asset_upload',
      area: 'shops',
      description: SHOPS_PREPARE_ASSET_UPLOAD_DESCRIPTION,
      schema: shopsPrepareAssetUploadInputSchema,
      run: prepareShopAssetUploadForCaller,
    }),
    prepareTool({
      name: 'budget_prepare_allocation',
      area: 'wallets',
      description: BUDGET_PREPARE_DESCRIPTION,
      schema: budgetPrepareInputSchema,
      run: prepareBudgetAllocationForCaller,
      operation: 'wallets.allocate',
    }),
    executeGateTool({ name: 'budget_execute_allocation', area: 'wallets', description: BUDGET_EXECUTE_DESCRIPTION }),
    prepareTool({
      name: 'wallets_prepare_topup',
      area: 'wallets',
      description: WALLETS_PREPARE_TOPUP_DESCRIPTION,
      schema: walletsPrepareTopupInputSchema,
      run: prepareWalletTopupForCaller,
      operation: 'wallets.topup',
    }),
    executeGateTool({ name: 'wallets_execute_topup', area: 'wallets', description: WALLETS_EXECUTE_TOPUP_DESCRIPTION }),
    uploadPrepareTool({
      name: 'wallets_prepare_document_upload',
      area: 'wallets',
      description: WALLETS_PREPARE_DOCUMENT_UPLOAD_DESCRIPTION,
      schema: walletsPrepareDocumentUploadInputSchema,
      run: prepareWalletDocumentUploadForCaller,
    }),
    prepareTool({
      name: 'wallets_prepare_setup',
      area: 'wallets',
      description: WALLETS_PREPARE_SETUP_DESCRIPTION,
      parameters: WALLET_SETUP_PARAMETERS,
      schema: walletsPrepareSetupInputSchema,
      run: prepareWalletSetupForCaller,
      operation: 'wallets.setup',
    }),
    executeGateTool({ name: 'wallets_execute_setup', area: 'wallets', description: WALLETS_EXECUTE_SETUP_DESCRIPTION }),
    prepareTool({
      name: 'wallets_prepare_payment_order',
      area: 'wallets',
      description: WALLETS_PREPARE_PAYMENT_ORDER_DESCRIPTION,
      schema: walletsPreparePaymentOrderInputSchema,
      run: prepareWalletPaymentOrderForCaller,
      operation: 'wallets.payment_order',
    }),
    executeGateTool({
      name: 'wallets_execute_payment_order',
      area: 'wallets',
      description: WALLETS_EXECUTE_PAYMENT_ORDER_DESCRIPTION,
    }),
    prepareTool({
      name: 'wallets_prepare_payment_verify',
      area: 'wallets',
      description: WALLETS_PREPARE_PAYMENT_VERIFY_DESCRIPTION,
      schema: walletsPreparePaymentVerifyInputSchema,
      run: prepareWalletPaymentVerifyForCaller,
      operation: 'wallets.payment_verify',
    }),
    executeGateTool({
      name: 'wallets_execute_payment_verify',
      area: 'wallets',
      description: WALLETS_EXECUTE_PAYMENT_VERIFY_DESCRIPTION,
    }),
    prepareTool({
      name: 'campaigns_prepare_points_draft',
      area: 'campaignOps',
      description: CAMPAIGNS_PREPARE_POINTS_DRAFT_DESCRIPTION,
      schema: campaignsPreparePointsDraftInputSchema,
      run: preparePointsDraftForCaller,
      operation: 'campaigns.points_draft',
    }),
    executeGateTool({
      name: 'campaigns_execute_points_draft',
      area: 'campaignOps',
      description: CAMPAIGNS_EXECUTE_POINTS_DRAFT_DESCRIPTION,
    }),
    prepareTool({
      name: 'campaigns_prepare_credit_allocation',
      area: 'campaignOps',
      description: CREDIT_PREPARE_DESCRIPTION,
      schema: creditPrepareInputSchema,
      run: prepareCreditAllocationForCaller,
      operation: 'campaigns.allocate_credits',
    }),
    executeGateTool({
      name: 'campaigns_execute_credit_allocation',
      area: 'campaignOps',
      description: CREDIT_EXECUTE_DESCRIPTION,
    }),
    prepareTool({
      name: 'campaigns_prepare_launch',
      area: 'campaignOps',
      description: LAUNCH_PREPARE_DESCRIPTION,
      schema: launchPrepareInputSchema,
      run: prepareLaunchForCaller,
      operation: 'campaigns.launch',
    }),
    executeGateTool({
      name: 'campaigns_execute_launch',
      area: 'campaignOps',
      description: LAUNCH_EXECUTE_DESCRIPTION,
    }),
    prepareTool({
      name: 'campaigns_prepare_merchandise_draft',
      area: 'campaignOps',
      description: MERCHANDISE_PREPARE_DRAFT_DESCRIPTION,
      schema: merchandisePrepareDraftInputSchema,
      run: prepareMerchandiseDraftForCaller,
      operation: 'campaigns.merchandise_draft',
    }),
    executeGateTool({
      name: 'campaigns_execute_merchandise_draft',
      area: 'campaignOps',
      description: MERCHANDISE_EXECUTE_DRAFT_DESCRIPTION,
    }),
    prepareTool({
      name: 'campaigns_prepare_merchandise_launch',
      area: 'campaignOps',
      description: MERCHANDISE_PREPARE_LAUNCH_DESCRIPTION,
      schema: merchandisePrepareLaunchInputSchema,
      run: prepareMerchandiseLaunchForCaller,
      operation: 'campaigns.merchandise_launch',
    }),
    executeGateTool({
      name: 'campaigns_execute_merchandise_launch',
      area: 'campaignOps',
      description: MERCHANDISE_EXECUTE_LAUNCH_DESCRIPTION,
    }),
    prepareTool({
      name: 'employees_prepare_create',
      area: 'contacts',
      description: EMPLOYEES_PREPARE_CREATE_DESCRIPTION,
      schema: employeesPrepareCreateInputSchema,
      run: prepareEmployeeCreateForCaller,
      operation: 'employees.create',
    }),
    executeGateTool({
      name: 'employees_execute_create',
      area: 'contacts',
      description: EMPLOYEES_EXECUTE_CREATE_DESCRIPTION,
    }),
    prepareTool({
      name: 'employees_prepare_update',
      area: 'contacts',
      description: EMPLOYEES_PREPARE_UPDATE_DESCRIPTION,
      schema: employeesPrepareUpdateInputSchema,
      run: prepareEmployeeUpdateForCaller,
      operation: 'employees.update',
    }),
    executeGateTool({
      name: 'employees_execute_update',
      area: 'contacts',
      description: EMPLOYEES_EXECUTE_UPDATE_DESCRIPTION,
    }),
    prepareTool({
      name: 'entities_prepare_setup',
      area: 'wallets',
      description: ENTITIES_PREPARE_SETUP_DESCRIPTION,
      schema: entitiesPrepareSetupInputSchema,
      run: prepareEntitySetupForCaller,
      operation: 'entities.setup',
    }),
    executeGateTool({
      name: 'entities_execute_setup',
      area: 'wallets',
      description: ENTITIES_EXECUTE_SETUP_DESCRIPTION,
    }),
    prepareTool({
      name: 'entities_prepare_assign_manager',
      area: 'wallets',
      description: ENTITIES_PREPARE_ASSIGN_DESCRIPTION,
      schema: entitiesPrepareAssignInputSchema,
      run: prepareAssignManagerForCaller,
      operation: 'entities.assign_manager',
    }),
    executeGateTool({
      name: 'entities_execute_assign_manager',
      area: 'wallets',
      description: ENTITIES_EXECUTE_ASSIGN_DESCRIPTION,
    }),
  ];

  // Silence unused execute imports — execute is HTTP-only via copilotWrites.
  void [
    executeShopCreateForCaller,
    executeShopUpdateForCaller,
    executeShopPublishForCaller,
    executeCollectionDraftForCaller,
    executeCollectionPublishForCaller,
    executeShopCatalogUpdateForCaller,
    executeShopCategoriesUpdateForCaller,
    executeBudgetAllocationForCaller,
    executeWalletTopupForCaller,
    executeWalletSetupForCaller,
    executeWalletPaymentOrderForCaller,
    executeWalletPaymentVerifyForCaller,
    executePointsDraftForCaller,
    executeCreditAllocationForCaller,
    executeLaunchForCaller,
    executeMerchandiseDraftForCaller,
    executeMerchandiseLaunchForCaller,
    executeEmployeeCreateForCaller,
    executeEmployeeUpdateForCaller,
    executeEntitySetupForCaller,
    executeAssignManagerForCaller,
  ];

  return [...reads, ...writes];
}

export { STORE_CREATE_PARAMETERS };
