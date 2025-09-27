import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type Observable, from, switchMap } from 'rxjs';
import { AppOidc } from '../services/oidc.service';

export interface Todo {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
}

const TODO_API_URL = 'https://jsonplaceholder.typicode.com/todos';

export const todoApiInterceptor: HttpInterceptorFn = (req, next) => {
  const oidc = inject(AppOidc);

  if (!req.url.startsWith(TODO_API_URL)) {
    return next(req);
  }

  return from(oidc.getAccessToken()).pipe(
    switchMap(({ isUserLoggedIn, accessToken }) => {
      if (!isUserLoggedIn) {
        throw new Error("Assertion Error: Call to the TODO API while the user isn't logged in.");
      }

      return next(
        req.clone({
          setHeaders: { Authorization: `Bearer ${accessToken}` },
        })
      );
    })
  );
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
