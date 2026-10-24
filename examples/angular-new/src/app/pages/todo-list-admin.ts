import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { injectOidc } from '../oidc';
import { TodoService, type UserTodos } from '../services/todo.service';

@Component({
  selector: 'app-todo-list-admin',
  template: `
    @if (accessDenied()) {
    <h1>Access denied</h1>
    <p>You need the admin role to view this page.</p>
    } @else {
    <h1>Todo List Admin</h1>
    <p>Todos from every user, grouped by user ID.</p>
    @if (usersTodos(); as groups) { @if (groups.length === 0) {
    <p class="empty-state">No user todos yet.</p>
    } @for (group of groups; track group.userId) {
    <section class="todo-group">
      <h2>
        User: <code>{{ group.userId }}</code>
      </h2>
      @if (group.todos.length === 0) {
      <p class="empty-state">No todos.</p>
      } @else {
      <ul class="todo-list">
        @for (todo of group.todos; track todo.id) {
        <li>
          <span>{{ todo.name }}</span>
          <button
            type="button"
            class="button-danger"
            [disabled]="isDeleting()"
            [attr.aria-label]="'Delete ' + todo.name + ' for ' + group.userId"
            (click)="deleteTodo(group.userId, todo.id)"
          >
            Delete
          </button>
        </li>
        }
      </ul>
      }
    </section>
    } } @else if (isLoading()) {
    <p>Loading todos...</p>
    } @else {
    <button type="button" (click)="loadTodos()">Try again</button>
    } @if (error()) {
    <p role="alert">{{ error() }}</p>
    } }
  `,
})
export class TodoListAdmin {
  private readonly oidc = injectOidc({ assert: 'user logged in' });
  private readonly todoService = inject(TodoService);
  // This is a UI check. Both admin endpoints authorize the request independently.
  readonly accessDenied = signal(!this.oidc.user().canSeeAdminNavigation);
  readonly usersTodos = signal<UserTodos[] | undefined>(undefined);
  readonly isLoading = signal(false);
  readonly isDeleting = signal(false);
  readonly error = signal<string | undefined>(undefined);

  constructor() {
    if (!this.accessDenied()) void this.loadTodos();
  }

  async loadTodos() {
    this.isLoading.set(true);
    this.error.set(undefined);
    try {
      this.usersTodos.set(await firstValueFrom(this.todoService.getAllTodos()));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 403) {
        this.accessDenied.set(true);
      } else {
        this.error.set('Could not load todos. Please try again.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteTodo(userId: string, todoId: number) {
    if (this.isDeleting()) return;
    this.isDeleting.set(true);
    this.error.set(undefined);
    try {
      await firstValueFrom(this.todoService.deleteTodo(userId, todoId));
      this.usersTodos.update((groups) =>
        groups?.map((group) =>
          group.userId === userId
            ? { ...group, todos: group.todos.filter((todo) => todo.id !== todoId) }
            : group
        )
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 403) {
        this.accessDenied.set(true);
      } else {
        this.error.set('Could not delete todo. Please try again.');
      }
    } finally {
      this.isDeleting.set(false);
    }
  }
}
