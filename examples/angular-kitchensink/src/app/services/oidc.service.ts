import { Injectable } from '@angular/core';
import { AbstractOidcService } from 'oidc-spa/angular';

export type DecodedIdToken = {
  name: string;
};

@Injectable({ providedIn: 'root' })
export class Oidc extends AbstractOidcService<DecodedIdToken> {
  // With this set to false, you are responsible for wrapping every usage of
  // oidc.isUserLoggedIn, oidc.$decodedIdToken, ect into:
  // @defer (when oidc.prInitialized | async) { } @placeholder { }
  // Note you only need to worry about that for public page and for the layout.
  // The goal of this mode is to make sure that oidc does not delay the
  // rendering of your marketing pages.
  override providerAwaitsInitialization = false;
}
