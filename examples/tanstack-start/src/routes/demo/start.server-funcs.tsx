import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { enforceLogin, oidcFnMiddleware } from "src/oidc";
import Spinner from "src/components/Spinner";

import * as dataTodos from "src/data/todos";

const getTodos = createServerFn({
    method: "GET"
})
    .middleware([oidcFnMiddleware({ assert: "user logged in" })])
    .handler(async ({ context: { oidc } }) => {
        const userId = oidc.accessTokenClaims.sub;

        return await dataTodos.readTodos({ userId });
    });

const addTodo = createServerFn({ method: "POST" })
    .inputValidator((d: string) => d)
    .middleware([oidcFnMiddleware({ assert: "user logged in" })])
    .handler(async ({ data, context: { oidc } }) => {
        const userId = oidc.accessTokenClaims.sub;

        const todos = await dataTodos.readTodos({ userId });
        todos.push({ id: todos.length + 1, name: data });

        await dataTodos.updateTodos({ userId, todos });
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
        <div className="flex flex-1 items-center justify-center min-h-full p-4 text-white">
            <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
                <h1 className="text-2xl mb-4">Start Server Functions - Todo Example</h1>
                <ul className="mb-4 space-y-2">
                    {todos.map(todo => (
                        <li
                            key={todo.id}
                            className="bg-white/10 border border-white/20 rounded-lg p-3 backdrop-blur-sm shadow-md"
                        >
                            <span className="text-lg text-white">{todo.name}</span>
                        </li>
                    ))}
                </ul>
                <div className="flex flex-col gap-2">
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
                        className="w-full px-4 py-3 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                    <button
                        disabled={newTodoInputValue.trim().length === 0}
                        onClick={onAddTodoButtonClick}
                        className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        Add todo
                    </button>
                </div>
            </div>
        </div>
    );
}
