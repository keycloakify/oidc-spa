<script setup lang="ts">
import { ref } from "vue";
import { useAuthenticatedFetch } from "~/composables/useAuthenticatedFetch";

definePageMeta({ requiresAuth: true });
const apiFetch = useAuthenticatedFetch();
const { data: todos, error, refresh } = await useFetch("/api/todos", { $fetch: apiFetch });

const newTodo = ref("");
const isSubmitting = ref(false);
const mutationError = ref("");

async function addTodo() {
    if (isSubmitting.value || newTodo.value.trim() === "") return;
    isSubmitting.value = true;
    mutationError.value = "";
    try {
        await apiFetch("/api/todos", { method: "POST", body: { name: newTodo.value } });
    } catch (error) {
        mutationError.value = error instanceof Error ? error.message : "Could not add todo.";
        return;
    } finally {
        isSubmitting.value = false;
    }
    newTodo.value = "";
    await refresh();
}
</script>

<template>
    <h1>Todo List</h1>
    <p>Your personal todo list, backed by Nuxt API handlers.</p>
    <p v-if="error" role="alert">{{ error.message }}</p>
    <p v-if="mutationError" role="alert">{{ mutationError }}</p>
    <p v-if="!todos && !error" role="status">Loading todos...</p>
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
