import { Component } from '@angular/core';
import { RouterLink, RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterModule],
  template: `
    <nav style="margin-top: 50px;">
      <a routerLink="/">Public</a>
      <a routerLink="/protected">Protected</a>
    </nav>
    <router-outlet />
  `,
  styles: ``,
})
export class AppComponent {}
