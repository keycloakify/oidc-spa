import { createFileRoute } from "@tanstack/react-router";
import { fetchWithAuth, enforceLogin, useOidc } from "@/oidc";
import Spinner from "@/components/Spinner";
import type { TodoItem } from "@/data/todos";

export const Route = createFileRoute("/demo/start/api-request")({
    beforeLoad: enforceLogin,
    loader: async () => {
        const todos: TodoItem[] = await fetchWithAuth("/demo/api/todos").then(res => res.json());
        return todos;
    },
    pendingComponent: () => (
        <div className="flex flex-1 items-center justify-center py-16">
            <Spinner />
        </div>
    ),
    component: Home
});

function Home() {
    const todos = Route.useLoaderData();

    const { renewTokens } = useOidc({ assert: "user logged in" });

    return (
        <div className="flex flex-1 items-center justify-center min-h-full p-4 text-white">
            <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10 opacity-0 animate-[fadeIn_0.2s_ease-in_forwards]">
                <h1 className="text-2xl mb-4">TODO items fetched from a standard REST API endpoint</h1>
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
            </div>
            <button
                onClick={() => {
                    renewTokens({
                        extraTokenParams: {
                            scope: "https://graph.microsoft.com/User.Read"
                        }
                    });
                }}
            >
                Request Graph Token
            </button>
        </div>
    );
}
