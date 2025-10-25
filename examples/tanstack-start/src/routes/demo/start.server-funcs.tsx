import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { enforceLogin, oidcFnMiddleware } from "@/oidc";
import Spinner from "@/components/Spinner";

import { getTodosStore } from "@/data/todos";

const getTodos = createServerFn({ method: "GET" })
    .middleware([oidcFnMiddleware({ assert: "user logged in" })])
    .handler(async ({ context: { oidc } }) => {
        const userId = oidc.accessTokenClaims.sub;

        const todosStore = getTodosStore();

        return await todosStore.readTodos({ userId });
    });

const addTodo = createServerFn({ method: "POST" })
    .inputValidator((d: string) => d)
    .middleware([oidcFnMiddleware({ assert: "user logged in" })])
    .handler(async ({ data, context: { oidc } }) => {
        const userId = oidc.accessTokenClaims.sub;

        const todosStore = getTodosStore();

        const todos = await todosStore.readTodos({ userId });
        todos.push({ id: todos.length + 1, name: data });

        await todosStore.updateTodos({ userId, todos });
    });

export const Route = createFileRoute("/demo/start/server-funcs")({
    beforeLoad: enforceLogin,
    component: Home,
    loader: async () => await getTodos(),
    pendingComponent: () => (
        <div className="flex flex-1 items-center justify-center py-16">
            <Spinner />
        </div>
    )
});

function Home() {
    const router = useRouter();
    const todos = Route.useLoaderData();

    const [newTodoInputValue, setNewTodoInputValue] = useState("");

    const onAddTodoButtonClick = async () => {
        await addTodo({ data: newTodoInputValue });
        setNewTodoInputValue("");
        router.invalidate();
    };

    return (
        <div>
            <ul>
                {todos.map(todo => (
                    <li key={todo.id}>
                        <span className="text-lg text-white">{todo.name}</span>
                    </li>
                ))}
            </ul>
            <div>
                <input
                    type="text"
                    value={newTodoInputValue}
                    onChange={e => setNewTodoInputValue(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            onAddTodoButtonClick();
                        }
                    }}
                    placeholder="Enter a new todo..."
                />
                <button disabled={newTodoInputValue.trim().length === 0} onClick={onAddTodoButtonClick}>
                    Add todo
                </button>
            </div>
        </div>
    );
}
