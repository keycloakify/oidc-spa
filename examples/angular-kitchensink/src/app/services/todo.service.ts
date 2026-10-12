import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { REQUIRE_ACCESS_TOKEN, INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN } from './oidc.service';

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);

  // Every todo endpoint requires a validated access token on the Express backend.
  getTodos() {
    return this.http.get<Todo[]>('/api/todos', {
      context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
    });
  }

  addTodo(title: string) {
    return this.http.post<Todo>(
      '/api/todos',
      { title },
      {
        context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
      }
    );
  }

  updateTodo(id: string, changes: { title?: string; completed?: boolean }) {
    return this.http.patch<Todo>(`/api/todos/${encodeURIComponent(id)}`, changes, {
      context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
    });
  }

  deleteTodo(id: string) {
    return this.http.delete<void>(`/api/todos/${encodeURIComponent(id)}`, {
      context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
    });
  }

  // This endpoint also accepts anonymous requests. Include a token only when logged in.
  getGreeting() {
    return this.http.get('/api/greet', {
      responseType: 'text',
      context: new HttpContext().set(INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN, true),
    });
  }
}
