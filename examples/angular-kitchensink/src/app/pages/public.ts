import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TodoService } from '../services/todo.service';
import { injectOidc } from '../services/oidc.service';

@Component({
  selector: 'app-public',
  imports: [AsyncPipe],
  template: `
    <h4>This page does not require authentication</h4>
    <p>The API greets you anonymously or by name when you are signed in.</p>
    @defer (when oidc.prInitialized | async) { @if (greeting$ | async; as greeting) {
    <p>{{ greeting }}</p>
    } @else {
    <p>Loading greeting...</p>
    } } @placeholder {
    <p>Waiting for authentication before loading the greeting...</p>
    }
  `,
})
export class Public {
  oidc = injectOidc();
  private readonly todoService = inject(TodoService);
  // AsyncPipe subscribes inside @defer: the optional token depends on browser auth readiness.
  readonly greeting$ = this.todoService.getGreeting();
}
