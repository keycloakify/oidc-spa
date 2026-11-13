import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AutoLogoutWarningOverlay } from '../../components/auto-logout-warning-overlay';

@Component({
  selector: 'app-protected-layout',
  imports: [RouterOutlet, AutoLogoutWarningOverlay],
  template: `
    <router-outlet />
    <app-auto-logout-warning-overlay />
  `,
})
export class ProtectedLayout {}
