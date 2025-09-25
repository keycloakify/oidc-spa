import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { getOidc, get$decodedIdToken } from '../../oidc';
import { TodoService } from '../services/todo.service';

@Component({
  selector: 'app-protected',
  imports: [AsyncPipe],
  template: `
    <h4>Hello {{ $decodedIdToken().name }}</h4>
    <p>The access/id tokens where issued at: {{ $decodedIdToken().iat }}</p>
    <button (click)="oidc.renewTokens()">Renew tokens</button>
    &nbsp;
    <small
      >(NOTE: You don't need to worry about renewing token this button is just to demo
      reactivity)</small
    >
    <section>
      <p>
        Todos fetched with <code>Authorization: \`Bearer [acess_token]\`</code> in the request's
        headers:
      </p>
      @if (todos$ | async; as todos) {
      <ul>
        @for (todo of todos; track todo.id) {
        <li>
          <strong>#{{ todo.id }}</strong>
          {{ todo.title }}
          <span>({{ todo.completed ? 'done' : 'pending' }})</span>
        </li>
        }
      </ul>
      } @else {
      <p>Loading todos...</p>
      }
    </section>
  `,
})
export class Protected {
  oidc = getOidc({ assert: 'user logged in' });
  $decodedIdToken = get$decodedIdToken();
  private readonly todoService = inject(TodoService);
  readonly todos$ = this.todoService.getTodos();
}
