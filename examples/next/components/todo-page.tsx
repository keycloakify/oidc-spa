"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc";

type Todos = Awaited<ReturnType<typeof trpc.todos.list.query>>;
const buttonClasses =
    "rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50";

export function TodoPage() {
    const [todos, setTodos] = useState<Todos>();
    const [name, setName] = useState("");
    const [error, setError] = useState<string>();
    const [isSaving, setIsSaving] = useState(false);
    const [reload, setReload] = useState(0);
    const saving = useRef(false);

    useEffect(() => {
        let active = true;
        trpc.todos.list.query().then(
            result => {
                if (active) {
                    setTodos(result);
                    setError(undefined);
                }
            },
            error => {
                if (active) {
                    setError(error instanceof Error ? error.message : "Could not load your todos.");
                }
            }
        );
        return () => {
            active = false;
        };
    }, [reload]);

    async function save(next: Todos) {
        if (saving.current) {
            return false;
        }
        saving.current = true;
        setIsSaving(true);
        setError(undefined);
        try {
            setTodos(await trpc.todos.save.mutate(next));
            return true;
        } catch (error) {
            setError(
                error instanceof Error ? error.message : "Could not save your todos. Please try again."
            );
            return false;
        } finally {
            saving.current = false;
            setIsSaving(false);
        }
    }

    async function addTodo(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!todos || !name.trim()) {
            return;
        }
        if (await save([...todos, { id: crypto.randomUUID(), name: name.trim(), completed: false }])) {
            setName("");
        }
    }

    return (
        <section className="space-y-6">
            <div className="space-y-2">
                <p className="text-sm uppercase tracking-wide text-slate-400">Your personal list</p>
                <h1 className="text-3xl font-semibold text-white">Todo app</h1>
                <p className="text-slate-300">
                    Add a task, check it off, and pick up where you left off next time.
                </p>
            </div>
            <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <form onSubmit={addTodo} className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1">
                        <label htmlFor="todo-name" className="mb-2 block text-sm text-slate-300">
                            New task
                        </label>
                        <input
                            id="todo-name"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            required
                            maxLength={200}
                            disabled={isSaving || !todos}
                            placeholder="What needs to get done?"
                            className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-2 text-white focus:outline-2 focus:outline-sky-400"
                        />
                    </div>
                    <button
                        className={buttonClasses}
                        disabled={!todos || isSaving || !name.trim() || todos.length >= 200}
                    >
                        Add task
                    </button>
                </form>
                {error && (
                    <div role="alert" className="space-y-2 text-sm text-rose-200">
                        <p>{error}</p>
                        {!todos && (
                            <button
                                className={buttonClasses}
                                onClick={() => setReload(value => value + 1)}
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}
                {!todos ? (
                    !error && (
                        <p role="status" className="text-slate-400">
                            Loading your todos…
                        </p>
                    )
                ) : (
                    <>
                        <p role="status" className="text-sm text-slate-400">
                            {isSaving
                                ? "Saving…"
                                : `${todos.filter(todo => !todo.completed).length} tasks remaining`}
                        </p>
                        {todos.length === 0 ? (
                            <p className="text-slate-300">
                                Your list is empty. Add your first task above.
                            </p>
                        ) : (
                            <ul className="divide-y divide-slate-800">
                                {todos.map(todo => (
                                    <li key={todo.id} className="flex items-center gap-4 py-4">
                                        <label className="flex min-w-0 flex-1 items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={todo.completed}
                                                disabled={isSaving}
                                                onChange={() =>
                                                    void save(
                                                        todos.map(item =>
                                                            item.id === todo.id
                                                                ? { ...item, completed: !item.completed }
                                                                : item
                                                        )
                                                    )
                                                }
                                                className="h-5 w-5 shrink-0 accent-sky-400"
                                            />
                                            <span
                                                className={`break-words ${
                                                    todo.completed
                                                        ? "text-slate-500 line-through"
                                                        : "text-white"
                                                }`}
                                            >
                                                {todo.name}
                                            </span>
                                        </label>
                                        <button
                                            className={buttonClasses}
                                            disabled={isSaving}
                                            aria-label={`Delete ${todo.name}`}
                                            onClick={() =>
                                                void save(todos.filter(item => item.id !== todo.id))
                                            }
                                        >
                                            Delete
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {todos.length >= 200 && (
                            <p className="text-sm text-slate-400">
                                Your list is full. Delete a task before adding another.
                            </p>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
