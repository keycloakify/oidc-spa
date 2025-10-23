import type { TodosStore } from "./port";

export function createNodeFsTodoStore(params: { dirPath: string }): TodosStore {
    const { dirPath } = params;

    const prFs = import("node:fs/promises");
    const prPath = import("node:path");

    async function getUserFilePath(params: { userId: string }) {
        const { userId } = params;

        const path = await prPath;

        return path.join(dirPath, `todos_${userId}.json`);
    }

    return {
        readTodos: async ({ userId }) => {
            const filePath = await getUserFilePath({ userId });

            const fs = await prFs;

            try {
                return JSON.parse((await fs.readFile(filePath)).toString("utf8"));
            } catch {
                return [
                    { id: 1, name: "Get groceries" },
                    { id: 2, name: "Buy a new phone" }
                ];
            }
        },
        updateTodos: async ({ userId, todos }) => {
            const fs = await prFs;

            const filePath = await getUserFilePath({ userId });

            await fs.writeFile(filePath, Buffer.from(JSON.stringify(todos, null, 2)), "utf-8");
        }
    };
}
