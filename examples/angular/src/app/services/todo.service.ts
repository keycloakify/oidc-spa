import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, Observable, mergeAll } from 'rxjs';
import { getTokens } from '../../oidc';

export interface Todo {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
}

const TODO_API_URL = 'https://jsonplaceholder.typicode.com/todos';

export const todoApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(TODO_API_URL)) {
    return next(req);
  }

  return defer(async () => {
    const { isUserLoggedIn, prTokens } = await getTokens();

    if (!isUserLoggedIn) {
      throw new Error('The TODO API requires the user to be logged in.');
    }

    const { accessToken } = await prTokens;

    return next(
      req.clone({
        setHeaders: { Authorization: `Bearer ${accessToken}` },
      })
    );
  }).pipe(mergeAll());
};

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = TODO_API_URL;

  getTodos(): Observable<Todo[]> {
    return this.http.get<Todo[]>(this.apiUrl, {
      params: { _limit: 5 },
    });
  }
}
