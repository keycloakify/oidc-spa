import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TodoService } from '../services/todo.service';
import { Oidc } from '../services/oidc.service';

@Component({
  selector: 'app-public',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <h4>This is a page that do not requires the user to be authenticated</h4>
    <section>
      <p>
        Todos fetched @defer (when oidc.prInitialized | async) {
        {{ oidc.isUserLoggedIn ? 'with' : 'without' }} } @placeholder { ... }
        <code>Authorization: Bearer [access_token]</code> in the request's headers:
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
export class Public {
  oidc = inject(Oidc);
  private readonly todoService = inject(TodoService);
  readonly todos$ = this.todoService.getPublicAndUserTodos();
}
