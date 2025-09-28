import { Component } from '@angular/core';

@Component({
  selector: 'app-admin-only',
  template: `
    <h2>Admin zone</h2>
    <p>If you can read this, you have the admin role.</p>
  `,
})
export class AdminOnly {}
