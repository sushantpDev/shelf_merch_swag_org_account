import { createMcpHandler, McpServer, requireScopes } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { logger } from '../../config/logger.js';
import {
  CATALOG_SEARCH_DESCRIPTION,
  catalogCardVisibleFromContext,
  catalogSearchContent,
  catalogSearchInputSchema,
  catalogSearchOutputSchema,
  searchCatalog,
} from './catalogSearch.js';
import {
  CATALOG_GET_PRODUCT_DESCRIPTION,
  CATALOG_LIST_CATEGORIES_DESCRIPTION,
  catalogCategoriesText,
  catalogGetProductInputSchema,
  catalogGetProductOutputSchema,
  catalogListCategoriesInputSchema,
  catalogListCategoriesOutputSchema,
  catalogProductContent,
  getCatalogProduct,
  listCatalogCategories,
} from './catalogRead.js';
import {
  CATALOG_PRODUCT_CARD_MIME,
  CATALOG_PRODUCT_CARD_URI,
  catalogProductCardResourceMeta,
  catalogProductCardToolMeta,
  readCatalogProductCard,
} from './catalogProductCard.js';
import {
  KIT_CATALOG_CARD_MIME,
  KIT_CATALOG_CARD_URI,
  kitCatalogCardResourceMeta,
  kitCatalogCardToolMeta,
  readKitCatalogCard,
} from './kitCatalogCard.js';
import {
  ORDERS_GET_DESCRIPTION,
  ORDERS_SEARCH_DESCRIPTION,
  getOrderForCaller,
  orderDetailText,
  orderToolError,
  ordersGetInputSchema,
  ordersGetOutputSchema,
  ordersSearchInputSchema,
  ordersSearchOutputSchema,
  ordersSearchText,
  searchOrdersForCaller,
} from './ordersRead.js';
import {
  CAMPAIGNS_GET_DESCRIPTION,
  CAMPAIGNS_SEARCH_DESCRIPTION,
  campaignDetailText,
  campaignToolError,
  campaignsGetInputSchema,
  campaignsGetOutputSchema,
  campaignsSearchInputSchema,
  campaignsSearchOutputSchema,
  campaignsSearchText,
  getCampaignForCaller,
  searchCampaignsForCaller,
} from './campaignsRead.js';
import {
  WALLET_BALANCES_DESCRIPTION,
  WALLET_TRANSACTIONS_DESCRIPTION,
  listBalancesForCaller,
  listTransactionsForCaller,
  walletBalancesInputSchema,
  walletBalancesOutputSchema,
  walletBalancesText,
  walletToolError,
  walletTransactionsInputSchema,
  walletTransactionsOutputSchema,
  walletTransactionsText,
} from './walletsRead.js';
import {
  WALLETS_EXECUTE_PAYMENT_ORDER_DESCRIPTION,
  WALLETS_EXECUTE_PAYMENT_VERIFY_DESCRIPTION,
  WALLETS_EXECUTE_SETUP_DESCRIPTION,
  WALLETS_PREPARE_PAYMENT_ORDER_DESCRIPTION,
  WALLETS_PREPARE_PAYMENT_VERIFY_DESCRIPTION,
  WALLETS_PREPARE_SETUP_DESCRIPTION,
  executeWalletPaymentOrderForCaller,
  executeWalletPaymentVerifyForCaller,
  executeWalletSetupForCaller,
  prepareWalletPaymentOrderForCaller,
  prepareWalletPaymentVerifyForCaller,
  prepareWalletSetupForCaller,
  walletsExecutePaymentOrderInputSchema,
  walletsExecutePaymentOrderOutputSchema,
  walletsExecutePaymentVerifyInputSchema,
  walletsExecutePaymentVerifyOutputSchema,
  walletsExecuteSetupInputSchema,
  walletsExecuteSetupOutputSchema,
  walletsPreparePaymentOrderInputSchema,
  walletsPreparePaymentOrderOutputSchema,
  walletsPreparePaymentVerifyInputSchema,
  walletsPreparePaymentVerifyOutputSchema,
  walletsPrepareSetupInputSchema,
  walletsPrepareSetupOutputSchema,
  walletsSetupError,
  walletsSetupText,
} from './walletsSetupWrite.js';
import {
  WALLETS_GET_DOCUMENT_UPLOAD_DESCRIPTION,
  WALLETS_PREPARE_DOCUMENT_UPLOAD_DESCRIPTION,
  getWalletDocumentUploadForCaller,
  prepareWalletDocumentUploadForCaller,
  walletsDocumentUploadError,
  walletsDocumentUploadText,
  walletsGetDocumentUploadInputSchema,
  walletsGetDocumentUploadOutputSchema,
  walletsPrepareDocumentUploadInputSchema,
  walletsPrepareDocumentUploadOutputSchema,
} from './walletsDocumentUpload.js';
import {
  WALLETS_EXECUTE_TOPUP_DESCRIPTION,
  WALLETS_PREPARE_TOPUP_DESCRIPTION,
  executeWalletTopupForCaller,
  prepareWalletTopupForCaller,
  walletsExecuteTopupInputSchema,
  walletsExecuteTopupOutputSchema,
  walletsPrepareTopupInputSchema,
  walletsPrepareTopupOutputSchema,
  walletsTopupError,
  walletsTopupText,
} from './walletsTopupWrite.js';
import {
  EMPLOYEES_GET_DESCRIPTION,
  EMPLOYEES_SEARCH_DESCRIPTION,
  employeeDetailText,
  employeeToolError,
  employeesGetInputSchema,
  employeesGetOutputSchema,
  employeesSearchInputSchema,
  employeesSearchOutputSchema,
  employeesSearchText,
  getEmployeeForCaller,
  searchEmployeesForCaller,
} from './employeesRead.js';
import {
  EMPLOYEES_EXECUTE_CREATE_DESCRIPTION,
  EMPLOYEES_EXECUTE_UPDATE_DESCRIPTION,
  EMPLOYEES_PREPARE_CREATE_DESCRIPTION,
  EMPLOYEES_PREPARE_UPDATE_DESCRIPTION,
  employeeWriteError,
  employeeWriteText,
  employeesExecuteCreateInputSchema,
  employeesExecuteCreateOutputSchema,
  employeesExecuteUpdateInputSchema,
  employeesExecuteUpdateOutputSchema,
  employeesPrepareCreateInputSchema,
  employeesPrepareCreateOutputSchema,
  employeesPrepareUpdateInputSchema,
  employeesPrepareUpdateOutputSchema,
  executeEmployeeCreateForCaller,
  executeEmployeeUpdateForCaller,
  prepareEmployeeCreateForCaller,
  prepareEmployeeUpdateForCaller,
} from './employeesWrite.js';
import {
  CAMPAIGNS_EXECUTE_POINTS_DRAFT_DESCRIPTION,
  CAMPAIGNS_PREPARE_POINTS_DRAFT_DESCRIPTION,
  campaignsExecutePointsDraftInputSchema,
  campaignsExecutePointsDraftOutputSchema,
  campaignsPreparePointsDraftInputSchema,
  campaignsPreparePointsDraftOutputSchema,
  executePointsDraftForCaller,
  pointsDraftError,
  pointsDraftText,
  preparePointsDraftForCaller,
} from './campaignsDraftWrite.js';
import {
  SHOPS_EXECUTE_CREATE_DESCRIPTION,
  SHOPS_EXECUTE_UPDATE_DESCRIPTION,
  SHOPS_PREPARE_CREATE_DESCRIPTION,
  SHOPS_PREPARE_UPDATE_DESCRIPTION,
  executeShopCreateForCaller,
  executeShopUpdateForCaller,
  prepareShopCreateForCaller,
  prepareShopUpdateForCaller,
  shopWriteError,
  shopWriteText,
  shopsExecuteCreateInputSchema,
  shopsExecuteCreateOutputSchema,
  shopsExecuteUpdateInputSchema,
  shopsExecuteUpdateOutputSchema,
  shopsPrepareCreateInputSchema,
  shopsPrepareCreateOutputSchema,
  shopsPrepareUpdateInputSchema,
  shopsPrepareUpdateOutputSchema,
} from './shopsWrite.js';
import {
  SHOPS_GET_ASSET_UPLOAD_DESCRIPTION,
  SHOPS_PREPARE_ASSET_UPLOAD_DESCRIPTION,
  getShopAssetUploadForCaller,
  prepareShopAssetUploadForCaller,
  shopAssetUploadError,
  shopAssetUploadText,
  shopsGetAssetUploadInputSchema,
  shopsGetAssetUploadOutputSchema,
  shopsPrepareAssetUploadInputSchema,
  shopsPrepareAssetUploadOutputSchema,
} from './shopsAssetUpload.js';
import {
  SHOPS_EXECUTE_CATALOG_DESCRIPTION,
  SHOPS_PREPARE_CATALOG_DESCRIPTION,
  executeShopCatalogUpdateForCaller,
  prepareShopCatalogUpdateForCaller,
  shopCatalogError,
  shopCatalogText,
  shopsExecuteCatalogInputSchema,
  shopsExecuteCatalogOutputSchema,
  shopsPrepareCatalogInputSchema,
  shopsPrepareCatalogOutputSchema,
} from './shopsCatalogWrite.js';
import {
  SHOPS_EXECUTE_PUBLISH_DESCRIPTION,
  SHOPS_PREPARE_PUBLISH_DESCRIPTION,
  executeShopPublishForCaller,
  prepareShopPublishForCaller,
  shopPublishError,
  shopPublishText,
  shopsExecutePublishInputSchema,
  shopsExecutePublishOutputSchema,
  shopsPreparePublishInputSchema,
  shopsPreparePublishOutputSchema,
} from './shopsPublishWrite.js';
import {
  SHOPS_EXECUTE_CATEGORIES_DESCRIPTION,
  SHOPS_GET_CATEGORIES_DESCRIPTION,
  SHOPS_PREPARE_CATEGORIES_DESCRIPTION,
  executeShopCategoriesUpdateForCaller,
  getShopCategoriesForCaller,
  prepareShopCategoriesUpdateForCaller,
  shopCategoriesError,
  shopCategoriesText,
  shopsExecuteCategoriesInputSchema,
  shopsExecuteCategoriesOutputSchema,
  shopsGetCategoriesInputSchema,
  shopsGetCategoriesOutputSchema,
  shopsPrepareCategoriesInputSchema,
  shopsPrepareCategoriesOutputSchema,
} from './shopsCategoriesWrite.js';
import {
  SHOPS_GET_DESCRIPTION,
  SHOPS_LIST_DESCRIPTION,
  getShopForCaller,
  listShopsForCaller,
  shopsGetInputSchema,
  shopsGetOutputSchema,
  shopsListInputSchema,
  shopsListOutputSchema,
  shopsReadError,
  shopsReadText,
} from './shopsRead.js';
import {
  BUDGET_EXECUTE_DESCRIPTION,
  BUDGET_PREPARE_DESCRIPTION,
  budgetError,
  budgetExecuteInputSchema,
  budgetExecuteOutputSchema,
  budgetPrepareInputSchema,
  budgetPrepareOutputSchema,
  budgetText,
  executeBudgetAllocationForCaller,
  prepareBudgetAllocationForCaller,
} from './budgetsWrite.js';
import {
  KITS_GET_CURATED_DESCRIPTION,
  KITS_GET_DESCRIPTION,
  KITS_LIST_CURATED_DESCRIPTION,
  KITS_LIST_DESCRIPTION,
  getCuratedKitForCaller,
  getKitForCaller,
  kitsError,
  kitsGetCuratedInputSchema,
  kitsGetCuratedOutputSchema,
  kitsGetInputSchema,
  kitsGetOutputSchema,
  kitsListCuratedInputSchema,
  kitsListCuratedOutputSchema,
  kitsListInputSchema,
  kitsListOutputSchema,
  kitsText,
  listCuratedKitsForCaller,
  listKitsForCaller,
} from './kitsRead.js';
import {
  ENTITIES_LIST_DESCRIPTION,
  entitiesListInputSchema,
  entitiesListOutputSchema,
  entitiesListText,
  entitiesReadError,
  listEntitiesForCaller,
} from './entitiesRead.js';
import {
  ENTITIES_EXECUTE_ASSIGN_DESCRIPTION,
  ENTITIES_EXECUTE_SETUP_DESCRIPTION,
  ENTITIES_PREPARE_ASSIGN_DESCRIPTION,
  ENTITIES_PREPARE_SETUP_DESCRIPTION,
  entitiesAssignText,
  entitiesExecuteAssignInputSchema,
  entitiesExecuteAssignOutputSchema,
  entitiesExecuteSetupInputSchema,
  entitiesExecuteSetupOutputSchema,
  entitiesPrepareAssignInputSchema,
  entitiesPrepareAssignOutputSchema,
  entitiesPrepareSetupInputSchema,
  entitiesPrepareSetupOutputSchema,
  entitiesSetupError,
  entitiesSetupText,
  executeAssignManagerForCaller,
  executeEntitySetupForCaller,
  prepareAssignManagerForCaller,
  prepareEntitySetupForCaller,
} from './entitiesWrite.js';
import {
  CREDIT_EXECUTE_DESCRIPTION,
  CREDIT_PREPARE_DESCRIPTION,
  LAUNCH_EXECUTE_DESCRIPTION,
  LAUNCH_PREPARE_DESCRIPTION,
  campaignSendError,
  campaignSendText,
  creditExecuteInputSchema,
  creditExecuteOutputSchema,
  creditPrepareInputSchema,
  creditPrepareOutputSchema,
  executeCreditAllocationForCaller,
  executeLaunchForCaller,
  launchExecuteInputSchema,
  launchExecuteOutputSchema,
  launchPrepareInputSchema,
  launchPrepareOutputSchema,
  prepareCreditAllocationForCaller,
  prepareLaunchForCaller,
} from './campaignsSendWrite.js';
import {
  COLLECTION_EXECUTE_DRAFT_DESCRIPTION,
  COLLECTION_EXECUTE_PUBLISH_DESCRIPTION,
  COLLECTION_PREPARE_DRAFT_DESCRIPTION,
  COLLECTION_PREPARE_PUBLISH_DESCRIPTION,
  collectionError,
  executeCollectionDraftForCaller,
  collectionExecuteDraftInputSchema,
  collectionExecuteDraftOutputSchema,
  executeCollectionPublishForCaller,
  collectionExecutePublishInputSchema,
  collectionExecutePublishOutputSchema,
  prepareCollectionDraftForCaller,
  collectionPrepareDraftInputSchema,
  collectionPrepareDraftOutputSchema,
  prepareCollectionPublishForCaller,
  collectionPreparePublishInputSchema,
  collectionPreparePublishOutputSchema,
  collectionText,
} from './shopsCollectionWrite.js';
import {
  MERCHANDISE_EXECUTE_DRAFT_DESCRIPTION,
  MERCHANDISE_EXECUTE_LAUNCH_DESCRIPTION,
  MERCHANDISE_PREPARE_DRAFT_DESCRIPTION,
  MERCHANDISE_PREPARE_LAUNCH_DESCRIPTION,
  executeMerchandiseDraftForCaller,
  executeMerchandiseLaunchForCaller,
  merchandiseError,
  merchandiseExecuteDraftInputSchema,
  merchandiseExecuteDraftOutputSchema,
  merchandiseExecuteLaunchInputSchema,
  merchandiseExecuteLaunchOutputSchema,
  merchandisePrepareDraftInputSchema,
  merchandisePrepareDraftOutputSchema,
  merchandisePrepareLaunchInputSchema,
  merchandisePrepareLaunchOutputSchema,
  merchandiseText,
  prepareMerchandiseDraftForCaller,
  prepareMerchandiseLaunchForCaller,
} from './campaignsMerchandiseWrite.js';
import {
  GIFTS_SEARCH_DESCRIPTION,
  POINTS_SUMMARY_DESCRIPTION,
  giftsSearchInputSchema,
  giftsSearchOutputSchema,
  giftsSearchText,
  pointsGiftsToolError,
  pointsSummaryInputSchema,
  pointsSummaryOutputSchema,
  pointsSummaryText,
  searchGiftsForCaller,
  summarizePointsForCaller,
} from './pointsGiftsRead.js';

/**
 * Stateless JSON handler. A fresh server is built per request and nothing is
 * stored between calls, so any of the three API replicas can serve the next
 * request. Subscription streams are refused because an in-memory listen bus
 * would not be shared across replicas.
 */
function requireAnyScope(...scopes) {
  return ({ authInfo } = {}) => {
    if (!authInfo) return;
    const active = new Set(authInfo.scopes || []);
    if (scopes.some((scope) => active.has(scope))) return;
    return { scopes };
  };
}
export const shelfMerchMcpHandler = createMcpHandler(
  () => {
    const server = new McpServer({ name: 'shelfmerch', version: '0.1.0' });
    server.server.registerCapabilities({
      extensions: {
        'io.modelcontextprotocol/ui': {
          mimeTypes: [CATALOG_PRODUCT_CARD_MIME],
        },
      },
    });
    server.registerResource(
      'catalog_product_card',
      CATALOG_PRODUCT_CARD_URI,
      {
        title: 'Catalog product card',
        description:
          'Read-only cards for catalog_search and catalog_get_product. It has no product records of its own.',
        mimeType: CATALOG_PRODUCT_CARD_MIME,
        scopeChallenge: requireScopes('catalog:read'),
        _meta: catalogProductCardResourceMeta(),
      },
      async () => readCatalogProductCard(),
    );
    server.registerResource(
      'catalog_kit_card',
      KIT_CATALOG_CARD_URI,
      {
        title: 'Kit catalog card',
        description:
          'Read-only cards for kits_list, kits_get, kits_list_curated, and kits_get_curated. It does not send a kit or copy a curated kit.',
        mimeType: KIT_CATALOG_CARD_MIME,
        scopeChallenge: requireAnyScope('catalog:read', 'campaigns:read'),
        _meta: kitCatalogCardResourceMeta(),
      },
      async () => readKitCatalogCard(),
    );
    server.registerTool(
      'catalog_search',
      {
        title: 'Search catalog',
        description: CATALOG_SEARCH_DESCRIPTION,
        inputSchema: catalogSearchInputSchema,
        outputSchema: catalogSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('catalog:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['catalog:read'] }],
          ...catalogProductCardToolMeta(),
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchCatalog(args);
          return {
            content: catalogSearchContent(output, { cardVisible: catalogCardVisibleFromContext(ctx) }),
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP catalog_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: 'Catalog search failed.' }],
          };
        }
      },
    );
    server.registerTool(
      'catalog_get_product',
      {
        title: 'Get catalog product',
        description: CATALOG_GET_PRODUCT_DESCRIPTION,
        inputSchema: catalogGetProductInputSchema,
        outputSchema: catalogGetProductOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('catalog:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['catalog:read'] }],
          ...catalogProductCardToolMeta(),
        },
      },
      async (args, ctx) => {
        try {
          const output = await getCatalogProduct(args.productId);
          if (!output) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Product not found.' }],
            };
          }
          return {
            content: catalogProductContent(output, { cardVisible: catalogCardVisibleFromContext(ctx) }),
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP catalog_get_product failed');
          return {
            isError: true,
            content: [{ type: 'text', text: 'Product lookup failed.' }],
          };
        }
      },
    );
    server.registerTool(
      'catalog_list_categories',
      {
        title: 'List catalog categories',
        description: CATALOG_LIST_CATEGORIES_DESCRIPTION,
        inputSchema: catalogListCategoriesInputSchema,
        outputSchema: catalogListCategoriesOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('catalog:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['catalog:read'] }],
        },
      },
      async () => {
        try {
          const output = await listCatalogCategories();
          return {
            content: [{ type: 'text', text: catalogCategoriesText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP catalog_list_categories failed');
          return {
            isError: true,
            content: [{ type: 'text', text: 'Category list failed.' }],
          };
        }
      },
    );
    server.registerTool(
      'orders_search',
      {
        title: 'Search orders',
        description: ORDERS_SEARCH_DESCRIPTION,
        inputSchema: ordersSearchInputSchema,
        outputSchema: ordersSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('orders:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['orders:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchOrdersForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: ordersSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP orders_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: orderToolError(err, 'Order search failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'orders_get',
      {
        title: 'Get order',
        description: ORDERS_GET_DESCRIPTION,
        inputSchema: ordersGetInputSchema,
        outputSchema: ordersGetOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('orders:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['orders:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await getOrderForCaller(ctx, args.orderId);
          return {
            content: [{ type: 'text', text: orderDetailText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP orders_get failed');
          return {
            isError: true,
            content: [{ type: 'text', text: orderToolError(err, 'Order lookup failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'campaigns_search',
      {
        title: 'Search campaigns',
        description: CAMPAIGNS_SEARCH_DESCRIPTION,
        inputSchema: campaignsSearchInputSchema,
        outputSchema: campaignsSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('campaigns:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['campaigns:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchCampaignsForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: campaignsSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP campaigns_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: campaignToolError(err, 'Campaign search failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'campaigns_get',
      {
        title: 'Get campaign',
        description: CAMPAIGNS_GET_DESCRIPTION,
        inputSchema: campaignsGetInputSchema,
        outputSchema: campaignsGetOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('campaigns:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['campaigns:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await getCampaignForCaller(ctx, args.campaignId);
          return {
            content: [{ type: 'text', text: campaignDetailText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP campaigns_get failed');
          return {
            isError: true,
            content: [{ type: 'text', text: campaignToolError(err, 'Campaign lookup failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'wallet_list_balances',
      {
        title: 'List wallet balances',
        description: WALLET_BALANCES_DESCRIPTION,
        inputSchema: walletBalancesInputSchema,
        outputSchema: walletBalancesOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('wallets:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['wallets:read'] }],
        },
      },
      async (_args, ctx) => {
        try {
          const output = await listBalancesForCaller(ctx);
          return {
            content: [{ type: 'text', text: walletBalancesText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP wallet_list_balances failed');
          return {
            isError: true,
            content: [{ type: 'text', text: walletToolError(err, 'Wallet list failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'wallet_list_transactions',
      {
        title: 'List wallet transactions',
        description: WALLET_TRANSACTIONS_DESCRIPTION,
        inputSchema: walletTransactionsInputSchema,
        outputSchema: walletTransactionsOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('wallets:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['wallets:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await listTransactionsForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: walletTransactionsText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP wallet_list_transactions failed');
          return {
            isError: true,
            content: [{ type: 'text', text: walletToolError(err, 'Transaction list failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'employees_search',
      {
        title: 'Search employees',
        description: EMPLOYEES_SEARCH_DESCRIPTION,
        inputSchema: employeesSearchInputSchema,
        outputSchema: employeesSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('employees:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['employees:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchEmployeesForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: employeesSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP employees_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: employeeToolError(err, 'Employee search failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'employees_get',
      {
        title: 'Get employee',
        description: EMPLOYEES_GET_DESCRIPTION,
        inputSchema: employeesGetInputSchema,
        outputSchema: employeesGetOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('employees:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['employees:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await getEmployeeForCaller(ctx, args.contactId);
          return {
            content: [{ type: 'text', text: employeeDetailText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP employees_get failed');
          return {
            isError: true,
            content: [{ type: 'text', text: employeeToolError(err, 'Employee lookup failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'points_summary',
      {
        title: 'Summarize points credits',
        description: POINTS_SUMMARY_DESCRIPTION,
        inputSchema: pointsSummaryInputSchema,
        outputSchema: pointsSummaryOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('wallets:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['wallets:read'] }],
        },
      },
      async (_args, ctx) => {
        try {
          const output = await summarizePointsForCaller(ctx);
          return {
            content: [{ type: 'text', text: pointsSummaryText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP points_summary failed');
          return {
            isError: true,
            content: [{ type: 'text', text: pointsGiftsToolError(err, 'Points summary failed.') }],
          };
        }
      },
    );
    server.registerTool(
      'gifts_search',
      {
        title: 'Search gifts',
        description: GIFTS_SEARCH_DESCRIPTION,
        inputSchema: giftsSearchInputSchema,
        outputSchema: giftsSearchOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('gifts:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['gifts:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await searchGiftsForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: giftsSearchText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP gifts_search failed');
          return {
            isError: true,
            content: [{ type: 'text', text: pointsGiftsToolError(err, 'Gift search failed.') }],
          };
        }
      },
    );
    const employeeWriteTools = [
      ['employees_prepare_create', 'Prepare employee create', EMPLOYEES_PREPARE_CREATE_DESCRIPTION, employeesPrepareCreateInputSchema, employeesPrepareCreateOutputSchema, false, prepareEmployeeCreateForCaller, 'Employee create preview failed.'],
      ['employees_execute_create', 'Create employee', EMPLOYEES_EXECUTE_CREATE_DESCRIPTION, employeesExecuteCreateInputSchema, employeesExecuteCreateOutputSchema, true, executeEmployeeCreateForCaller, 'Employee create failed.'],
      ['employees_prepare_update', 'Prepare employee update', EMPLOYEES_PREPARE_UPDATE_DESCRIPTION, employeesPrepareUpdateInputSchema, employeesPrepareUpdateOutputSchema, false, prepareEmployeeUpdateForCaller, 'Employee update preview failed.'],
      ['employees_execute_update', 'Update employee', EMPLOYEES_EXECUTE_UPDATE_DESCRIPTION, employeesExecuteUpdateInputSchema, employeesExecuteUpdateOutputSchema, true, executeEmployeeUpdateForCaller, 'Employee update failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of employeeWriteTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('employees:write'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['employees:write'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: employeeWriteText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: employeeWriteError(err, fallback) }],
            };
          }
        },
      );
    }
    const pointsDraftTools = [
      ['campaigns_prepare_points_draft', 'Prepare points draft', CAMPAIGNS_PREPARE_POINTS_DRAFT_DESCRIPTION, campaignsPreparePointsDraftInputSchema, campaignsPreparePointsDraftOutputSchema, false, preparePointsDraftForCaller, 'Campaign draft preview failed.'],
      ['campaigns_execute_points_draft', 'Save points draft', CAMPAIGNS_EXECUTE_POINTS_DRAFT_DESCRIPTION, campaignsExecutePointsDraftInputSchema, campaignsExecutePointsDraftOutputSchema, true, executePointsDraftForCaller, 'Campaign draft save failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of pointsDraftTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('campaigns:draft'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['campaigns:draft'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: pointsDraftText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: pointsDraftError(err, fallback) }],
            };
          }
        },
      );
    }
    const shopReadTools = [
      ['shops_list', 'List stores', SHOPS_LIST_DESCRIPTION, shopsListInputSchema, shopsListOutputSchema, listShopsForCaller, 'Store list failed.'],
      ['shops_get', 'Get store', SHOPS_GET_DESCRIPTION, shopsGetInputSchema, shopsGetOutputSchema, getShopForCaller, 'Store lookup failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, call, fallback] of shopReadTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('shops:write'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['shops:write'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: shopsReadText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: shopsReadError(err, fallback) }],
            };
          }
        },
      );
    }
    const shopAssetUploadTools = [
      ['shops_prepare_asset_upload', 'Prepare store asset upload', SHOPS_PREPARE_ASSET_UPLOAD_DESCRIPTION, shopsPrepareAssetUploadInputSchema, shopsPrepareAssetUploadOutputSchema, false, prepareShopAssetUploadForCaller, 'Store asset upload ticket failed.', shopAssetUploadText, shopAssetUploadError],
      ['shops_get_asset_upload', 'Get store asset upload', SHOPS_GET_ASSET_UPLOAD_DESCRIPTION, shopsGetAssetUploadInputSchema, shopsGetAssetUploadOutputSchema, true, getShopAssetUploadForCaller, 'Store asset upload status failed.', shopAssetUploadText, shopAssetUploadError],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback, textFor, errorFor] of shopAssetUploadTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: name === 'shops_get_asset_upload',
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('shops:write'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['shops:write'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: textFor(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: errorFor(err, fallback) }],
            };
          }
        },
      );
    }
    const shopWriteTools = [
      ['shops_prepare_create', 'Prepare store create', SHOPS_PREPARE_CREATE_DESCRIPTION, shopsPrepareCreateInputSchema, shopsPrepareCreateOutputSchema, false, prepareShopCreateForCaller, 'Store create preview failed.'],
      ['shops_execute_create', 'Create store', SHOPS_EXECUTE_CREATE_DESCRIPTION, shopsExecuteCreateInputSchema, shopsExecuteCreateOutputSchema, true, executeShopCreateForCaller, 'Store create failed.'],
      ['shops_prepare_update', 'Prepare store update', SHOPS_PREPARE_UPDATE_DESCRIPTION, shopsPrepareUpdateInputSchema, shopsPrepareUpdateOutputSchema, false, prepareShopUpdateForCaller, 'Store update preview failed.'],
      ['shops_execute_update', 'Update store', SHOPS_EXECUTE_UPDATE_DESCRIPTION, shopsExecuteUpdateInputSchema, shopsExecuteUpdateOutputSchema, true, executeShopUpdateForCaller, 'Store update failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of shopWriteTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('shops:write'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['shops:write'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: shopWriteText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: shopWriteError(err, fallback) }],
            };
          }
        },
      );
    }
    const shopPublishTools = [
      ['shops_prepare_publish', 'Prepare store publish', SHOPS_PREPARE_PUBLISH_DESCRIPTION, shopsPreparePublishInputSchema, shopsPreparePublishOutputSchema, false, prepareShopPublishForCaller, 'Store publish preview failed.'],
      ['shops_execute_publish', 'Publish store', SHOPS_EXECUTE_PUBLISH_DESCRIPTION, shopsExecutePublishInputSchema, shopsExecutePublishOutputSchema, true, executeShopPublishForCaller, 'Store publish failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of shopPublishTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('shops:publish'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['shops:publish'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: shopPublishText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: shopPublishError(err, fallback) }],
            };
          }
        },
      );
    }
    const shopCategoryTools = [
      ['shops_get_categories', 'Get store categories', SHOPS_GET_CATEGORIES_DESCRIPTION, shopsGetCategoriesInputSchema, shopsGetCategoriesOutputSchema, true, getShopCategoriesForCaller, 'Store categories lookup failed.', true],
      ['shops_prepare_categories_update', 'Prepare store categories', SHOPS_PREPARE_CATEGORIES_DESCRIPTION, shopsPrepareCategoriesInputSchema, shopsPrepareCategoriesOutputSchema, false, prepareShopCategoriesUpdateForCaller, 'Store category preview failed.', false],
      ['shops_execute_categories_update', 'Update store categories', SHOPS_EXECUTE_CATEGORIES_DESCRIPTION, shopsExecuteCategoriesInputSchema, shopsExecuteCategoriesOutputSchema, true, executeShopCategoriesUpdateForCaller, 'Store category update failed.', false],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback, isRead] of shopCategoryTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: Boolean(isRead),
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('shops:write'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['shops:write'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: shopCategoriesText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: shopCategoriesError(err, fallback) }],
            };
          }
        },
      );
    }
    const shopCatalogTools = [
      ['shops_prepare_catalog_update', 'Prepare store products', SHOPS_PREPARE_CATALOG_DESCRIPTION, shopsPrepareCatalogInputSchema, shopsPrepareCatalogOutputSchema, false, prepareShopCatalogUpdateForCaller, 'Store product preview failed.'],
      ['shops_execute_catalog_update', 'Update store products', SHOPS_EXECUTE_CATALOG_DESCRIPTION, shopsExecuteCatalogInputSchema, shopsExecuteCatalogOutputSchema, true, executeShopCatalogUpdateForCaller, 'Store product update failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of shopCatalogTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('shops:catalog'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['shops:catalog'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: shopCatalogText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: shopCatalogError(err, fallback) }],
            };
          }
        },
      );
    }
    const budgetTools = [
      ['budget_prepare_allocation', 'Prepare budget allocation', BUDGET_PREPARE_DESCRIPTION, budgetPrepareInputSchema, budgetPrepareOutputSchema, false, prepareBudgetAllocationForCaller, 'Budget preview failed.'],
      ['budget_execute_allocation', 'Allocate department budget', BUDGET_EXECUTE_DESCRIPTION, budgetExecuteInputSchema, budgetExecuteOutputSchema, true, executeBudgetAllocationForCaller, 'Budget allocation failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of budgetTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('wallets:allocate'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['wallets:allocate'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: budgetText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: budgetError(err, fallback) }],
            };
          }
        },
      );
    }
    const walletSetupDocTools = [
      ['wallets_prepare_document_upload', 'Prepare wallet document upload', WALLETS_PREPARE_DOCUMENT_UPLOAD_DESCRIPTION, walletsPrepareDocumentUploadInputSchema, walletsPrepareDocumentUploadOutputSchema, false, prepareWalletDocumentUploadForCaller, 'Document upload ticket failed.', walletsDocumentUploadText, walletsDocumentUploadError],
      ['wallets_get_document_upload', 'Get wallet document upload', WALLETS_GET_DOCUMENT_UPLOAD_DESCRIPTION, walletsGetDocumentUploadInputSchema, walletsGetDocumentUploadOutputSchema, true, getWalletDocumentUploadForCaller, 'Document upload status failed.', walletsDocumentUploadText, walletsDocumentUploadError],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback, textFor, errorFor] of walletSetupDocTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: name === 'wallets_get_document_upload',
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('wallets:setup'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['wallets:setup'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: textFor(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: errorFor(err, fallback) }],
            };
          }
        },
      );
    }

    const walletTopupTools = [
      ['wallets_prepare_topup', 'Prepare organization wallet top-up', WALLETS_PREPARE_TOPUP_DESCRIPTION, walletsPrepareTopupInputSchema, walletsPrepareTopupOutputSchema, false, prepareWalletTopupForCaller, 'Wallet top-up preview failed.', walletsTopupText, walletsTopupError],
      ['wallets_execute_topup', 'Submit organization wallet top-up', WALLETS_EXECUTE_TOPUP_DESCRIPTION, walletsExecuteTopupInputSchema, walletsExecuteTopupOutputSchema, true, executeWalletTopupForCaller, 'Wallet top-up failed.', walletsTopupText, walletsTopupError],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback, textFor, errorFor] of walletTopupTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('wallets:setup'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['wallets:setup'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: textFor(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: errorFor(err, fallback) }],
            };
          }
        },
      );
    }

    const walletSetupTools = [
      ['wallets_prepare_setup', 'Prepare organization wallet setup', WALLETS_PREPARE_SETUP_DESCRIPTION, walletsPrepareSetupInputSchema, walletsPrepareSetupOutputSchema, false, prepareWalletSetupForCaller, 'Wallet setup preview failed.'],
      ['wallets_execute_setup', 'Create organization wallet', WALLETS_EXECUTE_SETUP_DESCRIPTION, walletsExecuteSetupInputSchema, walletsExecuteSetupOutputSchema, true, executeWalletSetupForCaller, 'Wallet setup failed.'],
      ['wallets_prepare_payment_order', 'Prepare wallet Razorpay order', WALLETS_PREPARE_PAYMENT_ORDER_DESCRIPTION, walletsPreparePaymentOrderInputSchema, walletsPreparePaymentOrderOutputSchema, false, prepareWalletPaymentOrderForCaller, 'Payment order preview failed.'],
      ['wallets_execute_payment_order', 'Create wallet Razorpay order', WALLETS_EXECUTE_PAYMENT_ORDER_DESCRIPTION, walletsExecutePaymentOrderInputSchema, walletsExecutePaymentOrderOutputSchema, true, executeWalletPaymentOrderForCaller, 'Payment order failed.'],
      ['wallets_prepare_payment_verify', 'Prepare wallet payment verify', WALLETS_PREPARE_PAYMENT_VERIFY_DESCRIPTION, walletsPreparePaymentVerifyInputSchema, walletsPreparePaymentVerifyOutputSchema, false, prepareWalletPaymentVerifyForCaller, 'Payment verify preview failed.'],
      ['wallets_execute_payment_verify', 'Verify wallet Razorpay payment', WALLETS_EXECUTE_PAYMENT_VERIFY_DESCRIPTION, walletsExecutePaymentVerifyInputSchema, walletsExecutePaymentVerifyOutputSchema, true, executeWalletPaymentVerifyForCaller, 'Payment verification failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of walletSetupTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('wallets:setup'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['wallets:setup'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: walletsSetupText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: walletsSetupError(err, fallback) }],
            };
          }
        },
      );
    }
    server.registerTool(
      'entities_list',
      {
        title: 'List departments',
        description: ENTITIES_LIST_DESCRIPTION,
        inputSchema: entitiesListInputSchema,
        outputSchema: entitiesListOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: requireScopes('entities:read'),
        _meta: {
          securitySchemes: [{ type: 'oauth2', scopes: ['entities:read'] }],
        },
      },
      async (args, ctx) => {
        try {
          const output = await listEntitiesForCaller(ctx, args);
          return {
            content: [{ type: 'text', text: entitiesListText(output) }],
            structuredContent: output,
          };
        } catch (err) {
          logger.error({ errName: err?.name, errCode: err?.code }, 'MCP entities_list failed');
          return {
            isError: true,
            content: [{ type: 'text', text: entitiesReadError(err, 'Department list failed.') }],
          };
        }
      },
    );
    const entityTools = [
      ['entities_prepare_setup', 'Prepare department setup', ENTITIES_PREPARE_SETUP_DESCRIPTION, entitiesPrepareSetupInputSchema, entitiesPrepareSetupOutputSchema, false, prepareEntitySetupForCaller, 'Department preview failed.', entitiesSetupText],
      ['entities_execute_setup', 'Set up departments', ENTITIES_EXECUTE_SETUP_DESCRIPTION, entitiesExecuteSetupInputSchema, entitiesExecuteSetupOutputSchema, true, executeEntitySetupForCaller, 'Department setup failed.', entitiesSetupText],
      ['entities_prepare_assign_manager', 'Prepare department manager', ENTITIES_PREPARE_ASSIGN_DESCRIPTION, entitiesPrepareAssignInputSchema, entitiesPrepareAssignOutputSchema, false, prepareAssignManagerForCaller, 'Manager preview failed.', entitiesAssignText],
      ['entities_execute_assign_manager', 'Assign department manager', ENTITIES_EXECUTE_ASSIGN_DESCRIPTION, entitiesExecuteAssignInputSchema, entitiesExecuteAssignOutputSchema, true, executeAssignManagerForCaller, 'Manager assignment failed.', entitiesAssignText],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback, textFor] of entityTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('entities:write'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['entities:write'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: textFor(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: entitiesSetupError(err, fallback) }],
            };
          }
        },
      );
    }
    const campaignSendTools = [
      ['campaigns_prepare_credit_allocation', 'Prepare reward credits', CREDIT_PREPARE_DESCRIPTION, creditPrepareInputSchema, creditPrepareOutputSchema, false, prepareCreditAllocationForCaller, 'Credit preview failed.'],
      ['campaigns_execute_credit_allocation', 'Allocate reward credits', CREDIT_EXECUTE_DESCRIPTION, creditExecuteInputSchema, creditExecuteOutputSchema, true, executeCreditAllocationForCaller, 'Credit allocation failed.'],
      ['campaigns_prepare_launch', 'Prepare campaign launch', LAUNCH_PREPARE_DESCRIPTION, launchPrepareInputSchema, launchPrepareOutputSchema, false, prepareLaunchForCaller, 'Launch preview failed.'],
      ['campaigns_execute_launch', 'Launch campaign', LAUNCH_EXECUTE_DESCRIPTION, launchExecuteInputSchema, launchExecuteOutputSchema, true, executeLaunchForCaller, 'Campaign launch failed.'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback] of campaignSendTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes('campaigns:send'),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: ['campaigns:send'] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: campaignSendText(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: campaignSendError(err, fallback) }],
            };
          }
        },
      );
    }
    const kitReadTools = [
      ['kits_list', 'List workspace kits', KITS_LIST_DESCRIPTION, kitsListInputSchema, kitsListOutputSchema, listKitsForCaller, 'Kit list failed.', 'campaigns:read'],
      ['kits_get', 'Get workspace kit', KITS_GET_DESCRIPTION, kitsGetInputSchema, kitsGetOutputSchema, getKitForCaller, 'Kit lookup failed.', 'campaigns:read'],
      ['kits_list_curated', 'List curated kits', KITS_LIST_CURATED_DESCRIPTION, kitsListCuratedInputSchema, kitsListCuratedOutputSchema, listCuratedKitsForCaller, 'Curated kit list failed.', 'catalog:read'],
      ['kits_get_curated', 'Get curated kit', KITS_GET_CURATED_DESCRIPTION, kitsGetCuratedInputSchema, kitsGetCuratedOutputSchema, getCuratedKitForCaller, 'Curated kit lookup failed.', 'catalog:read'],
    ];
    for (const [name, title, description, inputSchema, outputSchema, call, fallback, scope] of kitReadTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes(scope),
          _meta: {
            ...kitCatalogCardToolMeta(),
            securitySchemes: [{ type: 'oauth2', scopes: [scope] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: kitsText(output, title, { cardVisible: catalogCardVisibleFromContext(ctx) }) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: kitsError(err, fallback) }],
            };
          }
        },
      );
    }
    const merchandiseTools = [
      ['campaigns_prepare_merchandise_draft', 'Prepare kit campaign', MERCHANDISE_PREPARE_DRAFT_DESCRIPTION, merchandisePrepareDraftInputSchema, merchandisePrepareDraftOutputSchema, false, prepareMerchandiseDraftForCaller, 'Kit preview failed.', 'campaigns:merchandise', merchandiseText, merchandiseError],
      ['campaigns_execute_merchandise_draft', 'Save kit campaign', MERCHANDISE_EXECUTE_DRAFT_DESCRIPTION, merchandiseExecuteDraftInputSchema, merchandiseExecuteDraftOutputSchema, true, executeMerchandiseDraftForCaller, 'Kit save failed.', 'campaigns:merchandise', merchandiseText, merchandiseError],
      ['campaigns_prepare_merchandise_launch', 'Prepare kit launch', MERCHANDISE_PREPARE_LAUNCH_DESCRIPTION, merchandisePrepareLaunchInputSchema, merchandisePrepareLaunchOutputSchema, false, prepareMerchandiseLaunchForCaller, 'Kit launch preview failed.', 'campaigns:merchandise', merchandiseText, merchandiseError],
      ['campaigns_execute_merchandise_launch', 'Launch kit campaign', MERCHANDISE_EXECUTE_LAUNCH_DESCRIPTION, merchandiseExecuteLaunchInputSchema, merchandiseExecuteLaunchOutputSchema, true, executeMerchandiseLaunchForCaller, 'Kit launch failed.', 'campaigns:merchandise', merchandiseText, merchandiseError],
      ['shops_prepare_collection_draft', 'Prepare collection draft', COLLECTION_PREPARE_DRAFT_DESCRIPTION, collectionPrepareDraftInputSchema, collectionPrepareDraftOutputSchema, false, prepareCollectionDraftForCaller, 'Collection preview failed.', 'shops:publish', collectionText, collectionError],
      ['shops_execute_collection_draft', 'Save collection draft', COLLECTION_EXECUTE_DRAFT_DESCRIPTION, collectionExecuteDraftInputSchema, collectionExecuteDraftOutputSchema, true, executeCollectionDraftForCaller, 'Collection save failed.', 'shops:publish', collectionText, collectionError],
      ['shops_prepare_collection_publish', 'Prepare collection publish', COLLECTION_PREPARE_PUBLISH_DESCRIPTION, collectionPreparePublishInputSchema, collectionPreparePublishOutputSchema, false, prepareCollectionPublishForCaller, 'Publish preview failed.', 'shops:publish', collectionText, collectionError],
      ['shops_execute_collection_publish', 'Publish collection', COLLECTION_EXECUTE_PUBLISH_DESCRIPTION, collectionExecutePublishInputSchema, collectionExecutePublishOutputSchema, true, executeCollectionPublishForCaller, 'Collection publish failed.', 'shops:publish', collectionText, collectionError],
    ];
    for (const [name, title, description, inputSchema, outputSchema, idempotent, call, fallback, scope, textFor, errorFor] of merchandiseTools) {
      server.registerTool(
        name,
        {
          title,
          description,
          inputSchema,
          outputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: idempotent,
            openWorldHint: false,
          },
          scopeChallenge: requireScopes(scope),
          _meta: {
            securitySchemes: [{ type: 'oauth2', scopes: [scope] }],
          },
        },
        async (args, ctx) => {
          try {
            const output = await call(ctx, args);
            return {
              content: [{ type: 'text', text: textFor(output, title) }],
              structuredContent: output,
            };
          } catch (err) {
            logger.error({ errName: err?.name, errCode: err?.code }, `MCP ${name} failed`);
            return {
              isError: true,
              content: [{ type: 'text', text: errorFor(err, fallback) }],
            };
          }
        },
      );
    }
    return server;
  },
  { responseMode: 'json', maxSubscriptions: 0 },
);

const nodeHandler = toNodeHandler(shelfMerchMcpHandler);

export function handleShelfMerchMcp(req, res, next) {
  Promise.resolve(nodeHandler(req, res, req.body)).catch((err) => {
    if (!res.headersSent) next(err);
  });
}