import { Injectable } from '@angular/core';
import { AbstractOidcService } from 'oidc-spa/angular';

export type DecodedIdToken = {
  name: string;
  realm_access?: {
    roles: string[];
  };
};

@Injectable({ providedIn: 'root' })
export class Oidc extends AbstractOidcService<DecodedIdToken> {}
