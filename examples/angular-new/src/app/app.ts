import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './components/app-header';
import { AutoLogoutWarningOverlay } from './components/auto-logout-warning-overlay';

@Component({
  imports: [RouterOutlet, AppHeader, AutoLogoutWarningOverlay],
  selector: 'app-root',
  template: `
    <app-header />
    <main><router-outlet /></main>
    <app-auto-logout-warning-overlay />
  `,
})
export class App {}
