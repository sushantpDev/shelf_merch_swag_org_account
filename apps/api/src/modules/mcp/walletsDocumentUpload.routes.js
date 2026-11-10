import { Router } from 'express';
import { uploader } from '../../middleware/upload.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  WALLET_PO_UPLOAD_TYPES,
  applyUploadSecurityHeaders,
  completeWalletDocumentUpload,
  tokenMatches,
} from './walletsDocumentUpload.js';
import { McpWalletDocumentTicket } from './mcpWalletDocumentTicket.model.js';

const router = Router();
const upload = uploader({ allow: WALLET_PO_UPLOAD_TYPES, maxSizeMb: 25 });

function readUploadToken(req) {
  return String(
    req.get('x-mcp-upload-token')
      || req.get('x-upload-token')
      || req.body?.uploadToken
      || req.query?.uploadToken
      || '',
  ).trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uploadPageHtml({ ticketId, errorMessage, success }) {
  const safeTicket = encodeURIComponent(ticketId || '');
  if (success) {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="referrer" content="no-referrer"/>
<title>PO uploaded · ShelfMerch</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1.25rem;color:#111}
.card{border:1px solid #ddd;border-radius:12px;padding:1.25rem}
.ok{color:#0a7a32;font-weight:600}
</style></head><body>
<div class="card"><p class="ok">Document uploaded</p>
<p>Return to your assistant and continue. It should call wallets_get_document_upload next (then wallets_prepare_setup or wallets_prepare_topup).</p>
</div></body></html>`;
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="referrer" content="no-referrer"/>
<title>Upload PO · ShelfMerch</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1.25rem;color:#111;line-height:1.45}
.card{border:1px solid #ddd;border-radius:12px;padding:1.25rem}
label{display:block;font-size:.85rem;font-weight:600;margin:1rem 0 .35rem}
input[type=file]{width:100%}
button{margin-top:1.1rem;background:#111;color:#fff;border:0;border-radius:8px;padding:.7rem 1rem;font-weight:600;cursor:pointer;width:100%}
button:disabled{opacity:.5;cursor:not-allowed}
.err{color:#b00020;font-size:.9rem;margin-top:.75rem}
.mut{color:#666;font-size:.85rem}
</style></head><body>
<div class="card">
<h1 style="font-size:1.15rem;margin:0 0 .35rem">Upload purchase order</h1>
<p class="mut">PDF only · max 25 MB. For ShelfMerch MCP clients that cannot attach files to tools.</p>
${errorMessage ? `<p class="err" id="boot-err">${escapeHtml(errorMessage)}</p>` : '<p class="err" id="boot-err" hidden></p>'}
<form id="po-form" method="post" enctype="multipart/form-data" action="./${safeTicket}">
<input type="hidden" name="uploadToken" id="uploadToken" value=""/>
<label for="document">PO / Agreement PDF</label>
<input id="document" name="document" type="file" accept="application/pdf,.pdf" required/>
<button type="submit" id="submit-btn" disabled>Upload document</button>
</form>
</div>
<script>
(function () {
  var err = document.getElementById('boot-err');
  var tokenInput = document.getElementById('uploadToken');
  var btn = document.getElementById('submit-btn');
  var hash = String(location.hash || '');
  var match = /(?:^|[&#])uploadToken=([^&]+)/.exec(hash);
  var token = match ? decodeURIComponent(match[1]) : '';
  if (history.replaceState) {
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    location.hash = '';
  }
  if (!token) {
    // Query fallback for non-JS / automated clients only — prefer fragment links.
    var q = new URLSearchParams(location.search).get('uploadToken');
    if (q) token = q;
  }
  if (!token) {
    err.hidden = false;
    err.textContent = 'This upload link is missing its secure token. Ask your assistant for a new upload link.';
    return;
  }
  tokenInput.value = token;
  btn.disabled = false;
})();
</script>
</body></html>`;
}

function sendHtml(res, status, html) {
  applyUploadSecurityHeaders(res);
  res.status(status).type('html').send(html);
}

/**
 * Authenticated by MCP upload ticket token (not session JWT).
 * Browser clients should open uploadPageUrl (token in URL fragment).
 */
router.get(
  '/:ticketId',
  asyncHandler(async (req, res) => {
    const ticketId = String(req.params.ticketId || '');
    const uploadToken = readUploadToken(req);
    const ticket = await McpWalletDocumentTicket.findOne({ ticketId }).setOptions({ skipTenantGuard: true });

    // Ready/consumed success does not require a live bearer token (token is invalidated after upload).
    if (ticket && (ticket.status === 'ready' || ticket.status === 'consumed')) {
      sendHtml(res, 200, uploadPageHtml({ ticketId, success: true }));
      return;
    }

    // No token in query: serve fragment bootstrap page (ChatGPT/Claude handoff).
    if (!uploadToken) {
      sendHtml(res, 200, uploadPageHtml({ ticketId }));
      return;
    }

    if (!ticket || !tokenMatches(ticket.tokenHash, uploadToken)) {
      sendHtml(res, 401, uploadPageHtml({
        ticketId,
        errorMessage: 'This upload link is invalid or expired. Ask your assistant for a new upload link.',
      }));
      return;
    }
    if (ticket.expiresAt <= new Date() || ticket.status === 'expired') {
      sendHtml(res, 410, uploadPageHtml({
        ticketId,
        errorMessage: 'This upload link has expired. Ask your assistant for a new upload link.',
      }));
      return;
    }
    sendHtml(res, 200, uploadPageHtml({ ticketId }));
  }),
);

router.post(
  '/:ticketId',
  upload.single('document'),
  asyncHandler(async (req, res) => {
    applyUploadSecurityHeaders(res);
    const uploadToken = readUploadToken(req);
    const result = await completeWalletDocumentUpload({
      ticketId: req.params.ticketId,
      uploadToken,
      file: req.file,
    });
    const accept = String(req.get('accept') || '');
    const wantsHtml = accept.includes('text/html') || Boolean(req.body?.uploadToken);
    if (wantsHtml) {
      sendHtml(res, 200, uploadPageHtml({
        ticketId: req.params.ticketId,
        success: true,
      }));
      return;
    }
    res.status(201).json(result);
  }),
);

export default router;
