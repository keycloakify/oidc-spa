import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TodoService, type UserTodos } from '../services/todo.service';

@Component({
  selector: 'app-todo-list-admin',
  template: `
    <h1>Todo List Admin</h1>
    <p>Todos from every user, grouped by user ID.</p>
    @if (usersTodos(); as groups) { @for (group of groups; track group.userId) {
    <section class="todo-group">
      <h2>
        User: <code>{{ group.userId }}</code>
      </h2>
      <ul class="todo-list">
        @for (todo of group.todos; track todo.id) {
        <li>
          <span>{{ todo.name }}</span>
          <button
            type="button"
            class="button-danger"
            [attr.aria-label]="'Delete ' + todo.name + ' for ' + group.userId"
            (click)="deleteTodo(group.userId, todo.id)"
          >
            Delete
          </button>
        </li>
        } @empty {
        <li>No todos.</li>
        }
      </ul>
    </section>
    } @empty {
    <p class="empty-state">No user todos yet.</p>
    } } @else {
    <p>Loading todos...</p>
    }
  `,
})
export class TodoListAdmin {
  private readonly todoService = inject(TodoService);
  readonly usersTodos = signal<UserTodos[] | undefined>(undefined);

  constructor() {
    void this.loadTodos();
  }

  async loadTodos() {
    this.usersTodos.set(await firstValueFrom(this.todoService.getAllTodos()));
  }

  async deleteTodo(userId: string, todoId: number) {
    await firstValueFrom(this.todoService.deleteTodo(userId, todoId));
    await this.loadTodos();
  }
}
