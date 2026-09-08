import 'dotenv/config';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { bootstrapAuth } from './server/auth';
import { createApiRouter } from './server/api';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const useMock = process.env['OIDC_USE_MOCK'] === 'true';

// Start validation setup as soon as the server loads, including under ng serve
// and in a serverless function. Token validation waits for readiness internally.
bootstrapAuth(
  useMock
    ? {
        implementation: 'mock',
        behavior: 'use static identity',
        decodedAccessToken_mock: {
          sub: 'mock-user',
          name: 'John Doe',
          email: 'john.doe@example.com',
        },
      }
    : {
        implementation: 'real',
        issuerUri: process.env['OIDC_ISSUER_URI']!,
        expectedAudience: process.env['OIDC_ACCESS_TOKEN_EXPECTED_AUDIENCE']!,
      }
);

app.get('/api/oidc-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    useMock,
    issuerUri: process.env['OIDC_ISSUER_URI']!,
    clientId: process.env['OIDC_BROWSER_APP_CLIENT_ID']!,
  });
});

app.use('/api', createApiRouter());

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or a serverless function.
 */
export const reqHandler = createNodeRequestHandler(app);
