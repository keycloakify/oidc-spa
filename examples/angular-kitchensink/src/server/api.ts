import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getUser, isAnonymousRequest } from './auth';

const TodoInput = z.object({ title: z.string().trim().min(1).max(200) }).strict();
const TodoUpdate = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

type Todo = { id: string; title: string; completed: boolean };

export function createApiRouter() {
  const api = express.Router();
  // Each user's list belongs to their validated subject, never to a caller-supplied user ID.
  // This demo has no database: restarting the server clears all lists.
  const todosByUser = new Map<string, Map<string, Todo>>();

  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '16kb' }));
  api.get('/greet', async (req, res) => {
    let message: string;

    if (isAnonymousRequest(req)) {
      message = 'Hello Anonymous user';
    } else {
      const user = await getUser({ req, res });
      message = `Hello ${user.name}`;
    }

    res.type('text/plain').send(message);
  });

  api.get('/todos', async (req, res) => {
    const user = await getUser({ req, res });
    res.json([...(todosByUser.get(user.id)?.values() ?? [])]);
  });

  api.post('/todos', async (req, res) => {
    const user = await getUser({ req, res });
    const result = TodoInput.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ message: 'Provide a title between 1 and 200 characters.' });
      return;
    }
    const todo: Todo = { id: randomUUID(), title: result.data.title, completed: false };
    let todos = todosByUser.get(user.id);
    if (todos === undefined) {
      todos = new Map();
      todosByUser.set(user.id, todos);
    }
    todos.set(todo.id, todo);
    res.status(201).json(todo);
  });

  api.patch('/todos/:id', async (req, res) => {
    const user = await getUser({ req, res });
    const result = TodoUpdate.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ message: 'Provide a valid title or completed flag.' });
      return;
    }
    const todo = todosByUser.get(user.id)?.get(req.params.id);
    if (todo === undefined) {
      res.sendStatus(404);
      return;
    }
    Object.assign(todo, result.data);
    res.json(todo);
  });

  api.delete('/todos/:id', async (req, res) => {
    const user = await getUser({ req, res });
    if (!todosByUser.get(user.id)?.delete(req.params.id)) {
      res.sendStatus(404);
      return;
    }
    res.sendStatus(204);
  });

  // Unknown API URLs must never fall through to Angular's HTML renderer.
  api.use((_req, res) => {
    res.sendStatus(404);
  });
  return api;
}
