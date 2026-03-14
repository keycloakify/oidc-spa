export type TodoItem = {
    id: number;
    name: string;
};

export type TodosStore = {
    readTodos: (params: { userId: string }) => Promise<TodoItem[]>;
    updateTodos: (params: { userId: string; todos: TodoItem[] }) => Promise<void>;
};
