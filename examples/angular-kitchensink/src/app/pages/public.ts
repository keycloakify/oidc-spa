import { Component } from '@angular/core';

@Component({
  selector: 'app-public',
  standalone: true,
  template: ` <h4>This is a page that do not requires the user to be authenticated</h4> `,
})
export class Public {}
