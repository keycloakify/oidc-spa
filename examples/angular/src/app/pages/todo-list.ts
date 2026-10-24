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
        required
      />
      <button type="submit" [disabled]="newTodo.trim() === ''">Add todo</button>
    </form>
    } @else {
    <p>Loading todos...</p>
    }
  `,
})
export class TodoList {
  private readonly todoService = inject(TodoService);
  readonly todos = signal<TodoItem[] | undefined>(undefined);
  newTodo = '';

  constructor() {
    void this.loadTodos();
  }

  async loadTodos() {
    this.todos.set(await firstValueFrom(this.todoService.getTodos()));
  }

  async addTodo() {
    if (this.newTodo.trim() === '') return;
    await firstValueFrom(this.todoService.addTodo(this.newTodo));
    this.newTodo = '';
    await this.loadTodos();
  }
}
