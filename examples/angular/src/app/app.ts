import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './components/app-header';

@Component({
  imports: [RouterOutlet, AppHeader],
  selector: 'app-root',
  template: `
    <app-header />
    <main><router-outlet /></main>
  `,
})
export class App {}
