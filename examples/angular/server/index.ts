import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './api';

const app = express();
app.disable('x-powered-by');
app.use('/api', createApiRouter());

// In development Angular CLI serves the SPA and proxies /api to this server.
// The production server serves the built static files; it does not render Angular.
const apiOnly = process.argv.includes('--api-only');
if (!apiOnly) {
  const browserDir = fileURLToPath(new URL('../browser/', import.meta.url));
  app.use(express.static(browserDir));
  app.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root: browserDir });
  });
}

const port = Number(process.env[apiOnly ? 'API_PORT' : 'PORT'] || (apiOnly ? 3001 : 3000));
app.listen(port, () => console.log(`Express listening on http://localhost:${port}`));
