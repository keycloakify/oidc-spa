import type { TodosStore } from './port';

export function createNodeFsTodoStore(params: { dirPath: string }): TodosStore {
  const { dirPath } = params;

  const prFs = import('node:fs/promises');
  const prPath = import('node:path');

  async function getUserFilePath(params: { userId: string }) {
    const { userId } = params;

    const path = await prPath;

    return path.join(dirPath, `todos_${encodeURIComponent(userId)}.json`);
  }

  const todosStore: TodosStore = {
    readTodos: async ({ userId }) => {
      const filePath = await getUserFilePath({ userId });

      const fs = await prFs;

      try {
        return JSON.parse((await fs.readFile(filePath)).toString('utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }

        const todos = [
          { id: 1, name: 'Get groceries' },
          { id: 2, name: 'Buy a new phone' },
        ];

        await todosStore.updateTodos({ userId, todos });

        return todos;
      }
    },
    readAllTodos: async () => {
      const fs = await prFs;
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      const userIds = files
        .filter(
          (file) => file.isFile() && file.name.startsWith('todos_') && file.name.endsWith('.json')
        )
        .map((file) => decodeURIComponent(file.name.slice('todos_'.length, -'.json'.length)))
        .sort();

      return Promise.all(
        userIds.map(async (userId) => ({
          userId,
          todos: await todosStore.readTodos({ userId }),
        }))
      );
    },
    updateTodos: async ({ userId, todos }) => {
      const fs = await prFs;

      const filePath = await getUserFilePath({ userId });

      await fs.writeFile(filePath, Buffer.from(JSON.stringify(todos, null, 2)), 'utf-8');
    },
  };

  return todosStore;
}
