import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, type Observable } from 'rxjs';
import { injectOidc } from '../services/oidc.service';
import { TodoService, type Todo } from '../services/todo.service';

@Component({
  selector: 'app-protected',
  imports: [FormsModule],
  template: `
    <h2>{{ oidc.user().displayName }}'s todos</h2>
    <p>
      Your list is private to your account. Todos are stored in memory and reset when the server
      restarts.
    </p>
    <form (ngSubmit)="addTodo()">
      <label for="todo-title">New todo</label>
      <input id="todo-title" name="title" [(ngModel)]="title" maxlength="200" required />
      <button type="submit" [disabled]="busy() || !title.trim()">Add todo</button>
    </form>
    @if (error(); as message) {
    <p role="alert">{{ message }}</p>
    } @if (todos(); as items) {
    <ul>
      @for (todo of items; track todo.id) {
      <li>
        <label>
          <input
            type="checkbox"
            [checked]="todo.completed"
            [disabled]="busy()"
            (change)="toggleTodo(todo)"
          />
          <span [style.text-decoration]="todo.completed ? 'line-through' : 'none'">{{
            todo.title
          }}</span>
        </label>
        <button type="button" [disabled]="busy()" (click)="deleteTodo(todo)">Delete</button>
      </li>
      } @empty {
      <li>No todos yet. Add your first one above.</li>
      }
    </ul>
    } @else if (!error()) {
    <p>Loading todos...</p>
    }
  `,
})
export class Protected {
  oidc = injectOidc({ assert: 'user logged in' });
  private readonly todoService = inject(TodoService);
  private readonly destroyRef = inject(DestroyRef);
  readonly todos = signal<Todo[] | undefined>(undefined);
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);
  title = '';

  constructor() {
    this.request(this.todoService.getTodos(), (todos) => this.todos.set(todos));
  }

  addTodo() {
    if (this.busy() || !this.title.trim()) return;
    this.request(this.todoService.addTodo(this.title.trim()), (todo) => {
      this.todos.update((todos) => [...(todos ?? []), todo]);
      this.title = '';
    });
  }

  toggleTodo(todo: Todo) {
    this.request(
      this.todoService.updateTodo(todo.id, { completed: !todo.completed }),
      (updated) => {
        this.todos.update((todos) =>
          todos?.map((item) => (item.id === updated.id ? updated : item))
        );
      }
    );
  }

  deleteTodo(todo: Todo) {
    this.request(this.todoService.deleteTodo(todo.id), () => {
      this.todos.update((todos) => todos?.filter((item) => item.id !== todo.id));
    });
  }

  private request<T>(request: Observable<T>, onSuccess: (value: T) => void) {
    this.busy.set(true);
    this.error.set(undefined);
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false))
      )
      .subscribe({
        next: onSuccess,
        error: () => this.error.set('The todo request failed. Please try again.'),
      });
  }
}
