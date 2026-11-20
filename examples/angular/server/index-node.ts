import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { app } from './app.js';

// In development Angular CLI serves the SPA and proxies /api to this server.
// The production server serves the built static files; it does not render Angular.
const apiOnly = process.argv.includes('--api-only');
if (!apiOnly) {
  const clientDir = fileURLToPath(new URL('../client/', import.meta.url));
  // Angular emits hashed JS/CSS bundles at the client root, unlike Vite.
  const hashedBundlePath = /\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/;
  app.use(
    '/assets',
    express.static(fileURLToPath(new URL('../client/assets/', import.meta.url)), {
      maxAge: '1y',
      immutable: true,
      fallthrough: false,
    })
  );
  app.use(
    express.static(clientDir, {
      setHeaders: (res, filePath) => {
        res.setHeader(
          'Cache-Control',
          hashedBundlePath.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache'
        );
      },
    })
  );
  app.get('/{*path}', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    if (hashedBundlePath.test(req.path)) {
      res.sendStatus(404);
      return;
    }
    res.sendFile('index.html', { root: clientDir });
  });
}

const port = Number(process.env[apiOnly ? 'API_PORT' : 'PORT'] || (apiOnly ? 3001 : 3000));
app.listen(port, () => console.log(`Express listening on http://localhost:${port}`));
