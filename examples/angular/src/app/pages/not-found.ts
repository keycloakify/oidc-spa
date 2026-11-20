import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <h1>Page not found</h1>
    <p>This page doesn't exist. <a routerLink="/">Go home</a>.</p>
  `,
})
export class NotFound {}
