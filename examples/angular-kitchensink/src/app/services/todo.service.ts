import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { REQUIRE_ACCESS_TOKEN, INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN } from './oidc.service';

export interface Todo {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
}

const TODO_API_URL = 'https://jsonplaceholder.typicode.com';

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = TODO_API_URL;

  // NOTE: This is an example of how to make a request that
  // includes the Authorization: Bearer <access_token> header
  // if called while the user isn't logged in this will throw.
  getTodos(): Observable<Todo[]> {
    return this.http.get<Todo[]>(`${this.apiUrl}/todos`, {
      params: { _limit: 5 },
      context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
    });
  }

  // NOTE: This is an example of how to make a request where the
  // Authorization: Bearer <access_token> is added if user is logged in
  // omitted otherwise.
  getPublicAndUserTodos(): Observable<Todo[]> {
    return this.http.get<Todo[]>(`${this.apiUrl}/todos`, {
      params: { _limit: 5 },
      context: new HttpContext().set(INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN, true),
    });
  }
}
