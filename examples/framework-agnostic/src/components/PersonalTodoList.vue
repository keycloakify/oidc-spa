<script setup lang="ts">
import { ref } from "vue";
import { fetchWithAuth } from "../oidc";
import { trpc } from "../trpc";
import { useAsyncData } from "../useAsyncData";
import type { TodoItem } from "../../server/data/todos";

const props = defineProps<{ backend: "API" | "tRPC" }>();
const newTodo = ref("");
const isSubmitting = ref(false);

const {
    data: todos,
    isLoading,
    reload
} = useAsyncData(async (): Promise<TodoItem[]> => {
    if (props.backend === "tRPC") return trpc.todos.list.query();
    const response = await fetchWithAuth("/api/todos");
    return response.json();
});

async function addTodo() {
    const name = newTodo.value.trim();
    if (isSubmitting.value || !name) return;

    isSubmitting.value = true;
    if (props.backend === "tRPC") {
        await trpc.todos.add.mutate(name);
    } else {
        await fetchWithAuth("/api/todos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
    }
    newTodo.value = "";
    await reload();
    isSubmitting.value = false;
}
</script>

<template>
    <h1>Todo List ({{ backend }})</h1>
    <p>Your personal todo list, backed by {{ backend === "API" ? "Express handlers" : "tRPC" }}.</p>
    <p v-if="isLoading" role="status">Loading todos...</p>
    <template v-if="todos">
        <p v-if="todos.length === 0" class="empty-state">No todos yet.</p>
        <ul v-else class="todo-list">
            <li v-for="todo in todos" :key="todo.id">{{ todo.name }}</li>
        </ul>
    </template>
    <form class="todo-form" @submit.prevent="addTodo">
        <label for="new-todo">New todo</label>
        <input
            id="new-todo"
            v-model="newTodo"
            name="todo"
            placeholder="What needs to be done?"
            :disabled="isSubmitting"
            required
        />
        <button type="submit" :disabled="isSubmitting || newTodo.trim() === ''">
            {{ isSubmitting ? "Adding..." : "Add todo" }}
        </button>
    </form>
</template>
