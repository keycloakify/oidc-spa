import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { z } from 'zod';

@Component({
  selector: 'app-inactivity-logout',
  template: `
    <h1>You have been logged out due to inactivity</h1>
    <p>Sign in again to pick up where you left off.</p>
    <a [href]="returnUrl()">Resume to where I was</a>
  `,
})
export class InactivityLogout {
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap, {
    requireSync: true,
  });
  readonly returnUrl = computed(() =>
    z.url().catch('/').parse(this.queryParams().get('return_url'))
  );
}
