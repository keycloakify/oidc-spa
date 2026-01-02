import { Injectable } from '@angular/core';
import { AbstractOidcService } from 'oidc-spa/angular';

export type DecodedIdToken = {
  name: string;
  realm_access?: {
    roles: string[];
  };
};

@Injectable({ providedIn: 'root' })
export class Oidc extends AbstractOidcService<DecodedIdToken> {
  // For AutoLogin see: https://docs.oidc-spa.dev/v/v9/features/auto-login#angular
  // For Non blocking rendering see: https://docs.oidc-spa.dev/v/v9/features/non-blocking-rendering#react-spas
}
