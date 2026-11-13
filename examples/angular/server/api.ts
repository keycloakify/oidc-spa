import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { getUser, HttpError } from './oidc';
import { getTodosStore, type TodoItem } from './data/todos';

export function createApiRouter() {
  const api = express.Router();

  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/oidc-client-env', (_req, res) => {
    res.json({
      OIDC_PROVIDER: process.env['OIDC_PROVIDER'],

      KEYCLOAK_ISSUER_URI: process.env['KEYCLOAK_ISSUER_URI'],
      KEYCLOAK_CLIENT_ID: process.env['KEYCLOAK_CLIENT_ID'],

      KEYCLOAK2_ISSUER_URI: process.env['KEYCLOAK2_ISSUER_URI'],
      KEYCLOAK2_CLIENT_ID: process.env['KEYCLOAK2_CLIENT_ID'],

      AUTH0_ISSUER_URI: process.env['AUTH0_ISSUER_URI'],
      AUTH0_CLIENT_ID: process.env['AUTH0_CLIENT_ID'],
      AUTH0_API_IDENTIFIER: process.env['AUTH0_API_IDENTIFIER'],
      AUTH0_SSO_SESSION_IDLE_SECONDS: process.env['AUTH0_SSO_SESSION_IDLE_SECONDS'],

      ENTRA_ISSUER_URI: process.env['ENTRA_ISSUER_URI'],
      ENTRA_CLIENT_ID: process.env['ENTRA_CLIENT_ID'],
      ENTRA_API_SCOPE: process.env['ENTRA_API_SCOPE'],
    });
  });

  api.use(express.json({ limit: '16kb' }));

  api.get('/todos', async (req, res) => {
    const user = await getUser(req);
    res.json(await getTodosStore().readTodos({ userId: user.id }));
  });

  api.post('/todos', async (req, res) => {
    const user = await getUser(req);
    const result = z.object({ name: z.string().trim().min(1) }).safeParse(req.body);
    if (!result.success) throw new HttpError(400, 'A non-empty todo name is required.');

    const store = getTodosStore();
    const todos = await store.readTodos({ userId: user.id });
    const todo: TodoItem = { id: Date.now(), name: result.data.name };
    await store.updateTodos({ userId: user.id, todos: [...todos, todo] });
    res.status(201).json(todo);
  });

  api.get('/todos/all', async (req, res) => {
    const user = await getUser(req);

    if (!user.isAdmin) throw new HttpError(403, 'You need the admin role to perform this action.');

    res.json(await getTodosStore().readAllTodos());
  });

  api.delete('/todos/:userId/:todoId', async (req, res) => {
    const user = await getUser(req);

    if (!user.isAdmin) throw new HttpError(403, 'You need the admin role to perform this action.');

    const result = z
      .object({ userId: z.string().min(1), todoId: z.coerce.number().int() })
      .safeParse(req.params);
    if (!result.success) throw new HttpError(400, 'A valid user ID and todo ID are required.');

    const store = getTodosStore();
    const { userId, todoId } = result.data;
    const group = (await store.readAllTodos()).find((group) => group.userId === userId);
    if (!group || !group.todos.some((todo) => todo.id === todoId)) {
      throw new HttpError(404, 'Todo not found.');
    }

    await store.updateTodos({ userId, todos: group.todos.filter((todo) => todo.id !== todoId) });
    res.sendStatus(204);
  });

  // Unknown API requests must never receive the Angular index.html fallback.
  api.use((_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
      res.status(error.status).json({ error: 'Invalid JSON request body.' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  };
  api.use(handleError);

  return api;
}
