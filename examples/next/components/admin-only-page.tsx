"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "@/lib/oidc";

const REQUIRED_ROLE = "realm-admin";

export function AdminOnlyPage() {
    const { user, issuerUri } = useOidc({ assert: "user logged in" });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    if (!user.canSeeKeycloakAdminNavigation) {
        return (
            <section className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-100">
                <p>
                    You need the <code>{REQUIRED_ROLE}</code> role to view this page.
                </p>
            </section>
        );
    }

    return (
        <section className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-xl font-semibold text-white">Administration Page</h1>
                <p className="text-sm text-slate-300">
                    Access is granted because your access token includes the <code>{REQUIRED_ROLE}</code>{" "}
                    role.
                </p>
            </div>

            <AllUserTodos />

            {keycloakUtils && (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                    <a
                        className="inline-flex items-center text-slate-200 underline decoration-slate-700 underline-offset-4 transition-colors hover:decoration-slate-400"
                        href={keycloakUtils.adminConsoleUrl}
                        rel="noreferrer"
                        target="_blank"
                    >
                        Open the Keycloak administration console
                    </a>
                </div>
            )}
        </section>
    );
}

function AllUserTodos() {
    const [users, setUsers] = useState<Awaited<ReturnType<typeof trpc.todos.listAllUserTodos.query>>>();
    const [error, setError] = useState<string>();
    const [isLoading, setIsLoading] = useState(true);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let active = true;
        trpc.todos.listAllUserTodos.query().then(
            users => {
                if (!active) {
                    return;
                }
                setUsers(users);
                setError(undefined);
                setIsLoading(false);
            },
            error => {
                if (!active) {
                    return;
                }
                setUsers(undefined);
                setError(error instanceof Error ? error.message : "Could not load user todos.");
                setIsLoading(false);
            }
        );
        return () => {
            active = false;
        };
    }, [reload]);

    return (
        <section className="space-y-4" aria-labelledby="all-user-todos">
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 id="all-user-todos" className="text-xl font-semibold text-white">
                        Todos by user
                    </h2>
                    <p className="text-sm text-slate-300">
                        All todos item of all users, you can list it because you are admin
                    </p>
                    {users && (
                        <p className="text-sm text-slate-400">
                            {users.length} users ·{" "}
                            {users.reduce((sum, user) => sum + user.todos.length, 0)} tasks
                        </p>
                    )}
                </div>
                <button
                    disabled={isLoading}
                    onClick={() => {
                        setIsLoading(true);
                        setReload(value => value + 1);
                    }}
                    className="rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                    {isLoading ? "Loading…" : "Refresh"}
                </button>
            </div>
            {isLoading && (
                <p role="status" className="text-sm text-slate-400">
                    Loading user todos…
                </p>
            )}
            {error && (
                <p
                    role="alert"
                    className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-100"
                >
                    {error}
                </p>
            )}
            {users?.length === 0 && (
                <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
                    No users have saved todos yet.
                </p>
            )}
            {users?.map(({ userId, todos }) => (
                <article
                    key={userId}
                    className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                        <div className="min-w-0">
                            <p className="text-xs uppercase tracking-wide text-slate-400">User ID</p>
                            <h3 className="mt-1 break-all font-mono text-sm text-white">{userId}</h3>
                        </div>
                        <span className="text-sm text-slate-400">
                            {todos.filter(todo => todo.completed).length} of {todos.length} complete
                        </span>
                    </div>
                    {todos.length === 0 ? (
                        <p className="px-5 py-4 text-sm text-slate-400">No tasks in this list.</p>
                    ) : (
                        <ul className="divide-y divide-slate-800">
                            {todos.map(todo => (
                                <li
                                    key={todo.id}
                                    className="flex items-start justify-between gap-4 px-5 py-4"
                                >
                                    <span
                                        className={`min-w-0 break-words text-sm ${
                                            todo.completed ? "text-slate-400 line-through" : "text-white"
                                        }`}
                                    >
                                        {todo.name}
                                    </span>
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-1 text-xs ${
                                            todo.completed
                                                ? "bg-emerald-400/10 text-emerald-300"
                                                : "bg-amber-400/10 text-amber-200"
                                        }`}
                                    >
                                        {todo.completed ? "Complete" : "To do"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </article>
            ))}
        </section>
    );
}
