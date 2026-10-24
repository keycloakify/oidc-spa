import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TodoService, type TodoItem } from '../services/todo.service';

@Component({
  selector: 'app-todo-list',
  imports: [FormsModule],
  template: `
    <h1>Todo List</h1>
    <p>Your personal todo list, backed by an Express API.</p>
    @if (todos(); as items) { @if (items.length === 0) {
    <p class="empty-state">No todos yet.</p>
    } @else {
    <ul class="todo-list">
      @for (todo of items; track todo.id) {
      <li>{{ todo.name }}</li>
      }
    </ul>
    }
    <form (ngSubmit)="addTodo()" class="todo-form">
      <label for="new-todo">New todo</label>
      <input
        id="new-todo"
        name="todo"
        placeholder="What needs to be done?"
        [(ngModel)]="newTodo"
        [disabled]="isSubmitting()"
        required
      />
      <button type="submit" [disabled]="isSubmitting() || newTodo.trim() === ''">
        {{ isSubmitting() ? 'Adding...' : 'Add todo' }}
      </button>
    </form>
    } @else if (isLoading()) {
    <p>Loading todos...</p>
    } @else {
    <button type="button" (click)="loadTodos()">Try again</button>
    } @if (error()) {
    <p role="alert">{{ error() }}</p>
    }
  `,
})
export class TodoList {
  private readonly todoService = inject(TodoService);
  readonly todos = signal<TodoItem[] | undefined>(undefined);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | undefined>(undefined);
  newTodo = '';

  constructor() {
    void this.loadTodos();
  }

  async loadTodos() {
    this.isLoading.set(true);
    this.error.set(undefined);
    try {
      this.todos.set(await firstValueFrom(this.todoService.getTodos()));
    } catch {
      this.error.set('Could not load todos. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async addTodo() {
    if (this.isSubmitting() || this.newTodo.trim() === '') return;
    this.isSubmitting.set(true);
    this.error.set(undefined);
    try {
      const todo = await firstValueFrom(this.todoService.addTodo(this.newTodo));
      this.todos.update((todos) => [...(todos ?? []), todo]);
      this.newTodo = '';
    } catch {
      this.error.set('Could not add todo. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
