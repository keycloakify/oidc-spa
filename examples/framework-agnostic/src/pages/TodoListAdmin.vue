<script setup lang="ts">
import { ref } from "vue";
import { trpc } from "../trpc";
import { useAsyncData } from "../useAsyncData";

const { data: usersTodos, isLoading, reload } = useAsyncData(() => trpc.todos.listAllUserTodos.query());
const isDeleting = ref(false);

async function deleteTodo(userId: string, todoId: number) {
    if (isDeleting.value) return;

    isDeleting.value = true;
    await trpc.todos.delete.mutate({ userId, todoId });
    await reload();
    isDeleting.value = false;
}
</script>

<template>
    <h1>Todo List Admin</h1>
    <p>Todos from every user, grouped by user ID.</p>
    <p v-if="isLoading" role="status">Loading todos...</p>
    <p v-if="usersTodos?.length === 0" class="empty-state">No user todos yet.</p>
    <section v-for="{ userId, todos } in usersTodos" :key="userId" class="todo-group">
        <h2>
            User: <code>{{ userId }}</code>
        </h2>
        <p v-if="todos.length === 0" class="empty-state">No todos.</p>
        <ul v-else class="todo-list">
            <li v-for="todo in todos" :key="todo.id">
                <span>{{ todo.name }}</span>
                <button
                    type="button"
                    class="button-danger"
                    :disabled="isDeleting"
                    :aria-label="`Delete ${todo.name} for ${userId}`"
                    @click="deleteTodo(userId, todo.id)"
                >
                    Delete
                </button>
            </li>
        </ul>
    </section>
</template>
