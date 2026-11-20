<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { fetchWithAuth } from "../../oidc";
import type { TodoItem } from "../../../server/data/todos";

const todos = shallowRef<TodoItem[]>();
const newTodo = ref("");
const isSubmitting = ref(false);

async function loadTodos() {
    const response = await fetchWithAuth("/api/todos");
    todos.value = await response.json();
}

onMounted(loadTodos);

async function addTodo() {
    if (isSubmitting.value || newTodo.value.trim() === "") return;

    isSubmitting.value = true;
    await fetchWithAuth("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTodo.value })
    });
    newTodo.value = "";
    await loadTodos();
    isSubmitting.value = false;
}
</script>

<template>
    <h1>Todo List (API)</h1>
    <p>Your personal todo list, backed by Express handlers.</p>
    <p v-if="!todos" role="status">Loading todos...</p>
    <template v-else>
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
