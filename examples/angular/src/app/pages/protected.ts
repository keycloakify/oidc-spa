import { Component } from '@angular/core';
import { getOidc, get$decodedIdToken } from '../../oidc';

@Component({
  selector: 'app-protected',
  template: `
    <h4>Hello {{ $decodedIdToken().name }}</h4>
    <p>The access/id tokens where issued at: {{ $decodedIdToken().iat }}</p>
    <button (click)="oidc.renewTokens()">Renew tokens</button>
    &nbsp;
    <small
      >(NOTE: You don't need to worry about renewing token this button is just to demo
      reactivity)</small
    >
  `,
})
export class Protected {
  oidc = getOidc({ assert: 'user logged in' });
  $decodedIdToken = get$decodedIdToken();
}
