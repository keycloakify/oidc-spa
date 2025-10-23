import { HttpInterceptorFn } from '@angular/common/http';
import { Oidc } from '../services/oidc.service';

export const BearerInterceptor: HttpInterceptorFn = Oidc.createBasicBearerTokenInterceptor({
  conditions: [{ urlPattern: /^(https:\/\/jsonplaceholder\.typicode\.com)(\/.*)?$/i }],
});
