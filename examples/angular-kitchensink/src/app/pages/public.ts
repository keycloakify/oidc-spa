import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TodoService } from '../services/todo.service';
import { injectOidc } from '../services/oidc.service';

@Component({
  selector: 'app-public',
  imports: [AsyncPipe],
  template: `
    <h4>This is a page that do not requires the user to be authenticated</h4>
    <section>
      <p>Public todos can be fetched with an access token once authentication is initialized.</p>
      @defer (when oidc.prInitialized | async) {
      <p>
        Fetched {{ oidc.isUserLoggedIn ? 'with' : 'without' }}
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
      } } @placeholder {
      <p>Waiting for authentication before loading todos...</p>
      }
    </section>
  `,
})
export class Public {
  oidc = injectOidc();
  private readonly todoService = inject(TodoService);
  // AsyncPipe subscribes inside @defer, after auth is ready in the browser.
  readonly todos$ = this.todoService.getPublicAndUserTodos();
}
