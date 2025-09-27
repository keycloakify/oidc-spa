import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { todoApiInterceptor } from './services/todo.service';
import { provideOidc } from 'oidc-spa/angular';
//import { z } from "zod";

/*
const zDecodedIdToken = z.object({
  iat: z.number(),
  name: z.string(),
  realm_access: z
    .object({
      roles: z.array(z.string()),
    })
    .optional(),
});

type DecodedIdToken = z.infer<typeof zDecodedIdToken>;

declare module "oidc-spa/angular" {
    interface RegisterDecodedIdToken { 
        DecodedIdToken: DecodedIdToken;
    }
}
*/

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([todoApiInterceptor])),
    provideRouter(routes),
    provideOidc({
      issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
      clientId: 'example-angular',
      debugLogs: true,
      //decodedIdTokenSchema: zDecodedIdToken,
    }),
  ],
};
