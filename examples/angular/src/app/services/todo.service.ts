import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { REQUIRE_ACCESS_TOKEN } from '../oidc';

// These describe the HTTP responses. No backend types are imported into the app.
export type TodoItem = { id: number; name: string };
export type UserTodos = { userId: string; todos: TodoItem[] };

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);

  getTodos() {
    return this.http.get<TodoItem[]>('/api/todos', {
      context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
    });
  }

  addTodo(name: string) {
    return this.http.post<TodoItem>(
      '/api/todos',
      { name },
      { context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true) }
    );
  }

  getAllTodos() {
    return this.http.get<UserTodos[]>('/api/todos/all', {
      context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
    });
  }

  deleteTodo(userId: string, todoId: number) {
    return this.http.delete<void>(`/api/todos/${encodeURIComponent(userId)}/${todoId}`, {
      context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
    });
  }
}
