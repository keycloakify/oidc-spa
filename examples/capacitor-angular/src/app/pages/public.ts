import { Component } from '@angular/core';

@Component({
  selector: 'app-public',
  template: `
    <div class="container">
      <h1>Public Page</h1>
      <div class="info">This is a public page accessible to everyone.</div>
      <div class="success">
        <p><strong>Capacitor Mode Enabled</strong></p>
        <p>This app is configured to use:</p>
        <ul>
          <li>Capacitor Preferences for persistent token storage</li>
          <li>Capacitor Browser plugin for authentication redirects</li>
          <li>App plugin for deep link handling</li>
        </ul>
      </div>
      <p>Navigate to the protected page to trigger authentication.</p>
    </div>
  `,
  styles: ``,
})
export class PublicComponent {}
