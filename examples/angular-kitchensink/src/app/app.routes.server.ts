import { RenderMode, type ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Authentication is established in the browser. Guarded routes must use CSR.
  { path: 'protected', renderMode: RenderMode.Client },
  { path: 'admin-only', renderMode: RenderMode.Client },
  // Public content renders on the server; auth-dependent UI stays in @defer placeholders.
  { path: '**', renderMode: RenderMode.Server },
];
