import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { injectOidc } from '../services/oidc.service';
import { TodoService } from '../services/todo.service';

@Component({
  selector: 'app-protected',
  imports: [AsyncPipe],
  template: `
    <section>
      <p>
        Todos fetched with <code>Authorization: Bearer [access_token]</code> in the request's
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
  oidc = injectOidc({ assert: 'user logged in' });
  private readonly todoService = inject(TodoService);
  readonly todos$ = this.todoService.getTodos();
}
