<script setup lang="ts">
import { ref } from "vue";
import { useAuthenticatedFetch } from "~/composables/useAuthenticatedFetch";

definePageMeta({ requiresAuth: true });
const apiFetch = useAuthenticatedFetch();
const { data: usersTodos, error, refresh } = await useFetch("/api/admin/todos", { $fetch: apiFetch });
const isDeleting = ref(false);
const mutationError = ref("");

async function deleteTodo(userId: string, todoId: number) {
    if (isDeleting.value) return;
    isDeleting.value = true;
    mutationError.value = "";
    try {
        await apiFetch("/api/admin/todos", { method: "DELETE", body: { userId, todoId } });
    } catch (error) {
        mutationError.value = error instanceof Error ? error.message : "Could not delete todo.";
        return;
    } finally {
        isDeleting.value = false;
    }
    await refresh();
}
</script>

<template>
    <h1>Todo List Admin</h1>
    <p>Todos from every user, grouped by user ID.</p>
    <p v-if="error" role="alert">{{ error.message }}</p>
    <p v-if="mutationError" role="alert">{{ mutationError }}</p>
    <p v-if="!usersTodos && !error" role="status">Loading todos...</p>
    <template v-if="usersTodos">
        <p v-if="usersTodos.length === 0" class="empty-state">No user todos yet.</p>
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
</template>
