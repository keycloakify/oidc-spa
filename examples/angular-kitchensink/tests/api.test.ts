import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

function jwt(header: object, payload: object, privateKey: KeyObject) {
  const unsigned = [header, payload]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url')}`;
}

async function listen(app: ReturnType<typeof express>) {
  const server = await new Promise<Server>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

for (const mock of [false, true]) {
  describe(mock ? 'Static Identity API' : 'validated-token API', () => {
    let server: Server;
    let idp: Server;
    let origin: string;
    let issuerUri: string;
    let privateKey: KeyObject;

    function token(sub = 'alice', claims: Record<string, unknown> = {}) {
      const now = Math.floor(Date.now() / 1000);
      return jwt(
        { alg: 'RS256', kid: 'test-key', typ: 'JWT' },
        {
          iss: issuerUri,
          aud: 'account',
          sub,
          name: sub === 'alice' ? 'Alice' : 'Bob',
          iat: now,
          exp: now + 300,
          ...claims,
        },
        privateKey
      );
    }

    function request(path: string, accessToken?: string, method = 'GET', body?: object) {
      return fetch(origin + '/api' + path, {
        method,
        headers: {
          ...(accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` }),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    }

    beforeAll(async () => {
      vi.resetModules();
      const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
      privateKey = keys.privateKey;
      const provider = express();
      provider.get('/.well-known/openid-configuration', (_req, res) =>
        res.json({ jwks_uri: issuerUri + '/jwks' })
      );
      provider.get('/jwks', (_req, res) =>
        res.json({
          keys: [
            {
              ...keys.publicKey.export({ format: 'jwk' }),
              kid: 'test-key',
              alg: 'RS256',
              use: 'sig',
            },
          ],
        })
      );
      ({ server: idp, origin: issuerUri } = await listen(provider));
      const { bootstrapAuth } = await import('../src/server/auth');
      const { createApiRouter } = await import('../src/server/api');
      const app = express();
      app.use(
        '/api',
        createApiRouter({
          initializeAuth: () =>
            bootstrapAuth(
              mock
                ? {
                    implementation: 'mock',
                    behavior: 'use static identity',
                    decodedAccessToken_mock: { sub: 'mock-user', name: 'John Doe' },
                  }
                : { implementation: 'real', issuerUri, expectedAudience: 'account' }
            ),
        })
      );
      ({ server, origin } = await listen(app));
    });
    afterAll(async () => {
      await close(server);
      await close(idp);
    });

    it('distinguishes anonymous greetings and missing credentials on protected routes', async () => {
      expect(await (await request('/greet')).text()).toBe('Hello Anonymous user');
      expect((await request('/todos')).status).toBe(401);
      expect((await request('/todos', undefined, 'POST', { title: 'No credentials' })).status).toBe(
        401
      );
      expect((await request('/unknown')).status).toBe(404);
      const response = await request('/greet', mock ? 'any-token' : token());
      expect(await response.text()).toBe(mock ? 'Hello John Doe' : 'Hello Alice');
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('creates, reads, updates and deletes todos, validating inputs', async () => {
      const auth = mock ? 'any-token' : token();
      expect((await request('/todos', auth, 'POST', { title: ' ' })).status).toBe(400);
      expect((await request('/todos', auth, 'POST', { title: 'Test', userId: 'bob' })).status).toBe(
        400
      );
      const created = await request('/todos', auth, 'POST', { title: '  Test todo  ' });
      expect(created.status).toBe(201);
      const todo = await created.json();
      expect(todo).toEqual({ id: expect.any(String), title: 'Test todo', completed: false });
      expect(await (await request('/todos', auth)).json()).toContainEqual(todo);
      expect((await request(`/todos/${todo.id}`, auth, 'PATCH', {})).status).toBe(400);
      const updated = await request(`/todos/${todo.id}`, auth, 'PATCH', {
        title: 'Edited',
        completed: true,
      });
      expect(await updated.json()).toEqual({ ...todo, title: 'Edited', completed: true });
      expect((await request(`/todos/${todo.id}`, auth, 'DELETE')).status).toBe(204);
      expect((await request(`/todos/${todo.id}`, auth, 'DELETE')).status).toBe(404);
      expect(await (await request('/todos', auth)).json()).toEqual([]);
    });

    if (!mock) {
      it('rejects invalid, expired, wrong-issuer and wrong-audience tokens', async () => {
        for (const auth of [
          'not-a-jwt',
          token('alice', { exp: 1 }),
          token('alice', { aud: 'other' }),
          token('alice', { iss: issuerUri + '/other' }),
        ]) {
          expect((await request('/greet', auth)).status).toBe(401);
        }
        const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
        const [header, payload] = token()
          .split('.')
          .slice(0, 2)
          .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));
        expect((await request('/todos', jwt(header, payload, otherKey))).status).toBe(401);
        const malformed = await fetch(origin + '/api/greet', {
          headers: { Authorization: 'Bearer' },
        });
        expect(malformed.status).toBe(400);
      });

      it('isolates each validated subject and prevents edits to another user’s todos', async () => {
        const created = await (
          await request('/todos', token('alice'), 'POST', { title: 'Private' })
        ).json();
        expect(await (await request('/todos', token('bob'))).json()).toEqual([]);
        expect(
          (await request(`/todos/${created.id}`, token('bob'), 'PATCH', { completed: true })).status
        ).toBe(404);
        expect((await request(`/todos/${created.id}`, token('bob'), 'DELETE')).status).toBe(404);
        expect(await (await request('/todos', token('alice'))).json()).toContainEqual(created);
      });

      it('validates DPoP binding, request URL/method and proof replay', async () => {
        const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const { crv, kty, x, y } = keys.publicKey.export({ format: 'jwk' });
        const jwk = { crv, kty, x, y };
        const jkt = createHash('sha256').update(JSON.stringify(jwk)).digest('base64url');
        const accessToken = token('alice', { cnf: { jkt } });
        const proof = (claims = {}) =>
          jwt(
            { alg: 'ES256', typ: 'dpop+jwt', jwk },
            {
              jti: randomUUID(),
              iat: Math.floor(Date.now() / 1000),
              htm: 'GET',
              htu: origin + '/api/greet',
              ath: createHash('sha256').update(accessToken).digest('base64url'),
              ...claims,
            },
            keys.privateKey
          );
        const call = (dpop: string) =>
          fetch(origin + '/api/greet', {
            headers: { Authorization: `DPoP ${accessToken}`, DPoP: dpop },
          });
        expect((await request('/greet', accessToken)).status).toBe(401);
        const validProof = proof();
        expect(await (await call(validProof)).text()).toBe('Hello Alice');
        expect((await call(validProof)).status).toBe(401);
        expect((await call(proof({ htu: origin + '/api/other' }))).status).toBe(401);
        expect((await call(proof({ htm: 'POST' }))).status).toBe(401);
      });
    }
  });
}
