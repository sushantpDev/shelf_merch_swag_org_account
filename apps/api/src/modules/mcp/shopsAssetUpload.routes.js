import { Router } from 'express';
import { uploader } from '../../middleware/upload.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  SHOP_BANNER_UPLOAD_TYPES,
  SHOP_LOGO_UPLOAD_TYPES,
  applyShopAssetUploadSecurityHeaders,
  completeShopAssetUpload,
  tokenMatches,
} from './shopsAssetUpload.js';
import { McpShopAssetTicket } from './mcpShopAssetTicket.model.js';

const router = Router();
const logoUpload = uploader({ allow: SHOP_LOGO_UPLOAD_TYPES, maxSizeMb: 5 });
const bannerUpload = uploader({ allow: SHOP_BANNER_UPLOAD_TYPES, maxSizeMb: 10 });

function readUploadToken(req) {
  return String(
    req.get('x-mcp-upload-token')
      || req.get('x-upload-token')
      || req.body?.uploadToken
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

function uploadPageHtml({ ticketId, kind, errorMessage, success }) {
  const safeTicket = encodeURIComponent(ticketId || '');
  const isLogo = kind !== 'banner';
  const title = isLogo ? 'Upload store logo' : 'Upload store banner';
  const accept = isLogo
    ? '.png,image/png'
    : '.png,.webp,.jpeg,.jpg,image/png,image/webp,image/jpeg';
  const hint = isLogo
    ? 'PNG only · at least 300 DPI on both axes · max 5 MB.'
    : 'PNG, JPEG, or WebP · max 10 MB. Recommended 960 × 240 px (4:1).';
  if (success) {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="referrer" content="no-referrer"/>
<title>Uploaded · ShelfMerch</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1.25rem;color:#111}
.card{border:1px solid #ddd;border-radius:12px;padding:1.25rem}
.ok{color:#0a7a32;font-weight:600}
</style></head><body>
<div class="card"><p class="ok">Image uploaded</p>
<p>Return to your assistant and continue. It should call shops_get_asset_upload next (then shops_prepare_create or shops_prepare_update).</p>
</div></body></html>`;
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="referrer" content="no-referrer"/>
<title>${escapeHtml(title)} · ShelfMerch</title>
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
<h1 style="font-size:1.15rem;margin:0 0 .35rem">${escapeHtml(title)}</h1>
<p class="mut">${escapeHtml(hint)} For ShelfMerch MCP clients that cannot attach files to tools.</p>
${errorMessage ? `<p class="err" id="boot-err">${escapeHtml(errorMessage)}</p>` : '<p class="err" id="boot-err" hidden></p>'}
<form id="asset-form" method="post" enctype="multipart/form-data" action="./${safeTicket}">
<input type="hidden" name="uploadToken" id="uploadToken" value=""/>
<label for="asset">${isLogo ? 'Store logo PNG' : 'Store banner image'}</label>
<input id="asset" name="asset" type="file" accept="${accept}" required/>
<button type="submit" id="submit-btn" disabled>Upload image</button>
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
  applyShopAssetUploadSecurityHeaders(res);
  res.status(status).type('html').send(html);
}

router.get(
  '/:ticketId',
  asyncHandler(async (req, res) => {
    const ticketId = String(req.params.ticketId || '');
    const uploadToken = readUploadToken(req);
    const ticket = await McpShopAssetTicket.findOne({ ticketId }).setOptions({ skipTenantGuard: true });
    const kind = ticket?.kind || 'logo';

    if (ticket && (ticket.status === 'ready' || ticket.status === 'consumed')) {
      sendHtml(res, 200, uploadPageHtml({ ticketId, kind, success: true }));
      return;
    }

    if (!uploadToken) {
      sendHtml(res, 200, uploadPageHtml({ ticketId, kind }));
      return;
    }

    if (!ticket || !tokenMatches(ticket.tokenHash, uploadToken)) {
      sendHtml(res, 401, uploadPageHtml({
        ticketId,
        kind,
        errorMessage: 'This upload link is invalid or expired. Ask your assistant for a new upload link.',
      }));
      return;
    }
    if (ticket.expiresAt <= new Date() || ticket.status === 'expired') {
      sendHtml(res, 410, uploadPageHtml({
        ticketId,
        kind,
        errorMessage: 'This upload link has expired. Ask your assistant for a new upload link.',
      }));
      return;
    }
    sendHtml(res, 200, uploadPageHtml({ ticketId, kind }));
  }),
);

router.post(
  '/:ticketId',
  asyncHandler(async (req, res, next) => {
    const ticket = await McpShopAssetTicket.findOne({ ticketId: req.params.ticketId })
      .setOptions({ skipTenantGuard: true });
    const upload = ticket?.kind === 'banner' ? bannerUpload : logoUpload;
    upload.single('asset')(req, res, (err) => {
      if (err) return next(err);
      return next();
    });
  }),
  asyncHandler(async (req, res) => {
    applyShopAssetUploadSecurityHeaders(res);
    const uploadToken = readUploadToken(req);
    const result = await completeShopAssetUpload({
      ticketId: req.params.ticketId,
      uploadToken,
      file: req.file,
    });
    const accept = String(req.get('accept') || '');
    const wantsHtml = accept.includes('text/html') || Boolean(req.body?.uploadToken);
    if (wantsHtml) {
      sendHtml(res, 200, uploadPageHtml({
        ticketId: req.params.ticketId,
        kind: result.kind,
        success: true,
      }));
      return;
    }
    res.status(201).json(result);
  }),
);

export default router;
