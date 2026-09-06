import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Oidc } from '../services/oidc.service';
import { TodoService } from '../services/todo.service';

@Component({
  selector: 'app-protected',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    @if(oidc.$user().roles.length > 0){
    <p>You currently have these roles: {{ oidc.$user().roles.join(', ') }}</p>
    }
    <button (click)="oidc.refreshUser()">Refresh user</button>
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
