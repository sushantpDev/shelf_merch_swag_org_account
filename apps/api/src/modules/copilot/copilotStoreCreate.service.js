/**
 * Back-compat Create Store WRITE surface.
 * Implementation lives in copilotWrites.service.js (generic PREPARE→confirm→EXECUTE).
 */
export {
  isStoreCreateWriteEnabled,
  prepareCopilotStoreCreate,
  executeCopilotStoreCreate,
  cancelCopilotStoreCreate,
} from './copilotWrites.service.js';
