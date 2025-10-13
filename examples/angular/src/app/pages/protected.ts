import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Oidc } from '../services/oidc.service';
import { TodoService } from '../services/todo.service';

@Component({
  selector: 'app-protected',
  imports: [AsyncPipe],
  template: `
    @if(oidc.$decodedIdToken().realm_access){
    <p>
      You currently have theses roles: {{ oidc.$decodedIdToken().realm_access!.roles.join(', ') }}
    </p>
    } &nbsp;
    <small
      >(NOTE: You don't need to worry about renewing token this button is just to demo
      reactivity)</small
    >
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
  oidc = inject(Oidc);
  private readonly todoService = inject(TodoService);
  readonly todos$ = this.todoService.getTodos();
}
