import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { bootstrapAuth } from './server/auth';
import { createApiRouter } from './server/api';
import { environment } from './environments/environment';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Trust forwarded URLs only when explicitly configured for your reverse proxy.
// Used when validating a DPoP proof's target URL.
app.set('trust proxy', process.env['TRUST_PROXY'] === 'true');

const OidcConfig = z.object({
  issuerUri: z.url(),
  clientId: z.string(),
  accessTokenExpectedAudience: z.string().min(1),
});

// Production assets live beside the server bundle. ng serve uses the source public folder.
const configPath = existsSync(join(browserDistFolder, 'oidc-config.json'))
  ? join(browserDistFolder, 'oidc-config.json')
  : resolve('public/oidc-config.json');

async function readOidcConfig() {
  return OidcConfig.parse(JSON.parse(await readFile(configPath, 'utf8')));
}

app.get('/oidc-config.json', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await readOidcConfig());
});

app.use(
  '/api',
  createApiRouter({
    initializeAuth: async () => {
      if (environment.useMockOidc) {
        await bootstrapAuth({
          implementation: 'mock',
          behavior: 'use static identity',
          decodedAccessToken_mock: {
            sub: 'mock-user',
            name: 'John Doe',
            email: 'john.doe@example.com',
          },
        });
        return;
      }

      const { issuerUri, accessTokenExpectedAudience } = await readOidcConfig();
      await bootstrapAuth({
        implementation: 'real',
        issuerUri,
        expectedAudience: accessTokenExpectedAudience,
      });
    },
  })
);

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
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
