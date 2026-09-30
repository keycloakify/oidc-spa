import { Injectable } from '@angular/core';
import { CapacitorOidcService } from 'oidc-spa/capacitor/angular';

@Injectable()
export class Oidc extends CapacitorOidcService {
  // For AutoLogin see: https://docs.oidc-spa.dev/v/v10/features/auto-login#angular
  // For Non blocking rendering see: https://docs.oidc-spa.dev/v/v10/features/non-blocking-rendering#react-spas
}
