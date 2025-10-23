const getUserFilePath = (params: { userId: string }) => {
    const { userId } = params;
    return `todos_${userId}.json`;
};

export type TodoItem = {
    id: number;
    name: string;
};

export async function readTodos(params: { userId: string }): Promise<TodoItem[]> {
    const { userId } = params;

    const fs = await import("node:fs/promises");

    const filePath = getUserFilePath({ userId });

    try {
        return JSON.parse((await fs.readFile(filePath)).toString("utf8"));
    } catch {
        return [
            { id: 1, name: "Get groceries" },
            { id: 2, name: "Buy a new phone" }
        ];
    }
}

export async function updateTodos(params: { userId: string; todos: TodoItem[] }): Promise<void> {
    const { userId, todos } = params;

    const fs = await import("node:fs/promises");

    const filePath = getUserFilePath({ userId });

    await fs.writeFile(filePath, Buffer.from(JSON.stringify(todos, null, 2)), "utf-8");
}
