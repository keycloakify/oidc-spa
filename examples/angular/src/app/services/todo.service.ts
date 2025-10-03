import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { Oidc } from '../services/oidc.service';

export interface Todo {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
}

const TODO_API_URL = 'https://jsonplaceholder.typicode.com/todos';

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = TODO_API_URL;

  getTodos(): Observable<Todo[]> {
    return this.http.get<Todo[]>(this.apiUrl, {
      params: { _limit: 5 },
      context: new HttpContext().set(Oidc.REQUIRE_ACCESS_TOKEN, true),
    });
  }
}
