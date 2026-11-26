<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { trpc, type RouterOutputs } from "../../trpc";

const todos = shallowRef<RouterOutputs["todos"]["list"]>();
const newTodo = ref("");
const isSubmitting = ref(false);

async function loadTodos() {
    todos.value = await trpc.todos.list.query();
}

onMounted(loadTodos);

async function addTodo() {
    if (isSubmitting.value || newTodo.value.trim() === "") return;

    isSubmitting.value = true;
    await trpc.todos.add.mutate(newTodo.value);
    newTodo.value = "";
    await loadTodos();
    isSubmitting.value = false;
}
</script>

<template>
    <h1>Todo List (tRPC)</h1>
    <p>Your personal todo list, backed by tRPC.</p>
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
