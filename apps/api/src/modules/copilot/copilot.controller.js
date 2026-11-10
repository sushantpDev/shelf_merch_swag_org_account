import { env } from '../../config/env.js';
import { ApiError, ForbiddenError } from '../../utils/errors.js';
import { writeAudit } from '../../services/audit.service.js';
import { buildCopilotToolCtx } from './buildCallerCtx.js';
import {
  capabilitiesForRole,
  isCopilotRole,
  isEmbeddedCopilotEnabled,
  resolveCopilotProviderStatus,
} from './copilotCapabilities.js';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  persistConversationWriteArtifact,
  streamAssistantTurn,
} from './copilotChat.service.js';
import {
  removeCopilotAttachment,
  uploadCopilotAttachment,
} from './copilotAttachments.service.js';
import { registeredToolNames, activeCopilotTools } from './copilotTools.js';
import { discoveryForUser } from './copilotDiscovery.js';
import {
  cancelCopilotStoreCreate,
  executeCopilotStoreCreate,
  isStoreCreateWriteEnabled,
  prepareCopilotStoreCreate,
} from './copilotStoreCreate.service.js';
import {
  anyWriteDomainEnabled,
  writeDomainsStatus,
  prepareCopilotWrite,
  executeCopilotWrite,
  cancelCopilotWrite,
  resolveCopilotWrite,
} from './copilotWrites.service.js';

function requireEnabled(req) {
  if (!isEmbeddedCopilotEnabled()) {
    throw new ApiError(404, 'Embedded AI Copilot is not enabled', 'COPILOT_DISABLED');
  }
  if (!isCopilotRole(req.user?.role)) {
    throw new ForbiddenError('AI Copilot is not available for this role');
  }
}

export async function status(req, res) {
  const enabled = isEmbeddedCopilotEnabled() && isCopilotRole(req.user?.role);
  const provider = resolveCopilotProviderStatus();
  res.json({
    enabled,
    provider: provider.provider,
    selectedProvider: provider.selected,
    model: enabled ? provider.model : null,
    role: req.user?.role ?? null,
    capabilities: enabled ? capabilitiesForRole(req.user.role) : [],
    discovery: enabled
      ? discoveryForUser(req.user, {
          tools: activeCopilotTools(),
          writeToolsEnabled: anyWriteDomainEnabled(),
          writeDomains: writeDomainsStatus(),
        })
      : { categories: [] },
    // Internal diagnostics for tests — not shown in UI.
    allowlistedTools: enabled ? registeredToolNames() : [],
    writeToolsEnabled: enabled ? anyWriteDomainEnabled() : false,
    writeDomains: enabled ? writeDomainsStatus() : writeDomainsStatus(),
    // Back-compat alias used by older store-create tests.
    storeCreateWriteEnabled: enabled ? isStoreCreateWriteEnabled() : false,
  });
}

export async function prepareStoreCreate(req, res) {
  requireEnabled(req);
  const result = await prepareCopilotStoreCreate(req, req.body);
  res.json(result);
}

export async function executeStoreCreate(req, res) {
  requireEnabled(req);
  const result = await executeCopilotStoreCreate(req, req.body);
  res.json(result);
}

export async function cancelStoreCreate(req, res) {
  requireEnabled(req);
  const result = await cancelCopilotStoreCreate(req, req.body);
  res.json(result);
}

export async function prepareWrite(req, res) {
  requireEnabled(req);
  const result = await prepareCopilotWrite(req, req.params.workflow, req.body);
  res.json(result);
}

export async function executeWrite(req, res) {
  requireEnabled(req);
  const result = await executeCopilotWrite(req, req.params.workflow, req.body);
  res.json(result);
}

export async function cancelWrite(req, res) {
  requireEnabled(req);
  const result = await cancelCopilotWrite(req, req.params.workflow, req.body);
  res.json(result);
}

export async function resolveWrite(req, res) {
  requireEnabled(req);
  const result = await resolveCopilotWrite(req, req.params.workflow, req.body);
  res.json(result);
}

export async function persistWriteArtifact(req, res) {
  requireEnabled(req);
  const result = await persistConversationWriteArtifact({
    tenantId: req.tenantId,
    userId: req.user.userId,
    conversationId: req.params.id,
    confirmationId: req.body?.confirmationId,
    artifact: req.body?.artifact,
  });
  res.json(result);
}

export async function create(req, res) {
  requireEnabled(req);
  const conversation = await createConversation({
    tenantId: req.tenantId,
    userId: req.user.userId,
    title: req.body?.title,
  });
  res.status(201).json({
    id: String(conversation._id),
    title: conversation.title,
    createdAt: conversation.createdAt,
  });
}

export async function list(req, res) {
  requireEnabled(req);
  const items = await listConversations({
    tenantId: req.tenantId,
    userId: req.user.userId,
  });
  res.json({
    items: items.map((row) => ({
      id: String(row._id),
      title: row.title,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    })),
  });
}

export async function getOne(req, res) {
  requireEnabled(req);
  const conversation = await getConversation({
    tenantId: req.tenantId,
    userId: req.user.userId,
    conversationId: req.params.id,
  });
  res.json({
    id: String(conversation._id),
    title: conversation.title,
    messages: conversation.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
        artifacts: m.artifacts ?? [],
        attachments: (m.attachments || []).map((row) => ({
          id: row.id,
          kind: row.kind,
          ticketId: row.ticketId || undefined,
          originalName: row.originalName,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
        })),
        createdAt: m.createdAt,
      })),
    updatedAt: conversation.updatedAt,
    curator: conversation.curator || null,
  });
}

export async function uploadAttachment(req, res) {
  requireEnabled(req);
  const attachment = await uploadCopilotAttachment({
    tenantId: req.tenantId,
    userId: req.user.userId,
    role: req.user.role,
    kind: req.attachmentKind || req.query.kind,
    file: req.file,
    conversationId: req.query.conversationId || null,
  });
  writeAudit({
    req,
    action: 'copilot.attachment_upload',
    entityType: 'CopilotAttachment',
    entityId: attachment.id,
    after: {
      kind: attachment.kind,
      ticketId: attachment.ticketId || null,
      originalName: attachment.originalName,
      sizeBytes: attachment.sizeBytes,
    },
  });
  res.status(201).json(attachment);
}

export async function removeAttachment(req, res) {
  requireEnabled(req);
  const result = await removeCopilotAttachment({
    tenantId: req.tenantId,
    userId: req.user.userId,
    attachmentId: req.params.id,
  });
  writeAudit({
    req,
    action: 'copilot.attachment_remove',
    entityType: 'CopilotAttachment',
    entityId: result.id,
    after: { status: 'removed' },
  });
  res.json(result);
}

export async function remove(req, res) {
  requireEnabled(req);
  await deleteConversation({
    tenantId: req.tenantId,
    userId: req.user.userId,
    conversationId: req.params.id,
  });
  res.json({ ok: true });
}

export async function postMessage(req, res) {
  requireEnabled(req);
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  const attachmentIds = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds : [];
  if (!content.trim() && !attachmentIds.length) {
    throw new ApiError(400, 'content or attachmentIds is required', 'VALIDATION');
  }
  if (content.length > env.EMBEDDED_COPILOT_MAX_INPUT_CHARS) {
    throw new ApiError(400, 'Message is too long', 'INPUT_TOO_LONG');
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const writeEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const abort = new AbortController();
  const onClose = () => abort.abort();
  req.on('close', onClose);

  try {
    await streamAssistantTurn({
      tenantId: req.tenantId,
      userId: req.user.userId,
      role: req.user.role,
      conversationId: req.params.id,
      content,
      attachmentIds,
      mode: req.body?.mode,
      toolCtx: buildCopilotToolCtx(req),
      onEvent: writeEvent,
      signal: abort.signal,
    });
  } catch (err) {
    const status = err?.status || 500;
    const code = err?.code || 'COPILOT_ERROR';
    const message = err?.message || 'Copilot request failed';
    writeEvent({ type: 'error', status, code, message });
  } finally {
    req.off('close', onClose);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}
