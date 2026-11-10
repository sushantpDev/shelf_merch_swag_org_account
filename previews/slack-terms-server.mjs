// Isolated local design preview: no environment loading, DB, OAuth or workers.
// Production behavior is verified separately through createApp HTTP tests.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { sendSlackTerms } from '../apps/api/src/modules/legal/slackTerms.controller.js';

const app = express();
const dist = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
// The shared Header reads public catalog categories. A preview has no backend;
// return an empty fixture so its built-in fallback navigation can render.
app.get('/api/v1/catalog/categories', (_req, res) => res.json([]));
app.get('/legal/slack-terms-of-service', (req, res, next) => {
  // Preview the actual React route as well as the server document.
  if (req.query.spa === '1') return next();
  return sendSlackTerms(req, res);
});
app.use(express.static(dist));
app.get('/{*path}', (_req, res) => res.sendFile(`${dist}/index.html`));
const server = app.listen(8097, '127.0.0.1', () => {
  console.log('Slack Terms preview: http://127.0.0.1:8097/legal/slack-terms-of-service');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
