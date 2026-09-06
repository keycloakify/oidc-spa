# Angular user abstraction

The Angular adapter uses a builder and a typed injection token. The injected value is a plain object; applications do not subclass a service.

## Configure the adapter

```ts
// services/oidc.service.ts
import { oidcSpa } from 'oidc-spa/angular';
import { createUser, user_mock, type User } from './oidc.user';

export const { Oidc } = oidcSpa
  .withUser<User>({ createUser, user_mock })
  // .withAutoLogin()
  // .withNonBlockingRendering()
  .createUtils();
```

Register `Oidc.provide({ issuerUri, clientId, ... })` in application providers. It also accepts an async callback that can inject services before its first `await`, as shown in [app.config.ts](src/app/app.config.ts). Configuration requests must pass through the interceptor without waiting for authentication.

`Oidc.provideMock({ isUserInitiallyLoggedIn: true })` uses `user_mock` directly, without invoking `createUser`. A `user_mock` passed to `Oidc.provideMock` overrides the builder default. With auto-login, the mock starts logged in.

`Oidc` is both the injection token and the namespace for `provide`, `provideMock`, `createBearerInterceptor`, and `enforceLoginGuard`. Import it wherever you configure or consume authentication. `inject(Oidc)` and `injector.get(Oidc)` infer the application user type without application-side casts.

## Read and refresh the user

```ts
readonly oidc = inject(Oidc);

async saveProfile() {
    await this.profileService.save();
    await this.oidc.refreshUser();
}
```

```html
@defer (when oidc.prInitialized | async) { @if (oidc.initializationError) {
<p role="alert">{{ oidc.initializationError.message }}</p>
} @else if (oidc.isUserLoggedIn) {
<p>Hello {{ oidc.$user().displayName }}</p>
} @else {
<button (click)="oidc.login()">Log in</button>
} } @placeholder {
<p>Loading authentication...</p>
}
```

Include Angular's `AsyncPipe` in the component imports for this template. Default rendering waits for initialization. `.withNonBlockingRendering()` renders immediately, so gate user-dependent UI as above. `prInitialized` settles on both success and initialization failure; check `initializationError` before reading the user. Authentication getters alone do not guarantee that the user model is ready.

`$user()` is a read-only signal. `user$` replays the current user to RxJS subscribers and exposes `getValue()`. Subscriptions made during initialization wait for the first user; anonymous or unconfigured user streams complete without emitting. An initial user-build failure errors the stream. Synchronous user reads before readiness, while anonymous, or without user configuration throw an explanatory error.

For imperative core-style access, `await oidc.getUser()` returns `{ user, subscribeToUserChange, refreshUser }`. The returned `user` is a snapshot; use the signal or subscription for updates. Core owns meaningful token-change detection and refresh behavior, as in React. Routine rotation-only changes do not rebuild the user. `refreshUser()` renews tokens and rebuilds the real user; mocks return the configured user. A later `createUser` failure retains the previous model according to core's behavior.

## Call an authenticated API inside createUser

Every real invocation of `createUser`, including refreshes, runs in the provider's Angular injection context. Inject dependencies before the first `await`; use those service references afterward.

```ts
// services/oidc.user.ts
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CreateUser } from 'oidc-spa/angular';
import { UserApi } from './user-api.service';

export type User = { displayName: string };

export const createUser: CreateUser<User> = async () => {
  const api = inject(UserApi);
  return firstValueFrom(api.getUser());
};

export const user_mock: User = { displayName: 'John Doe' };
```

`UserApi.getUser()` can use `HttpClient` with `INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN` or `REQUIRE_ACCESS_TOKEN`, just like the existing todo service. Validate the response in the API service or `createUser` before returning the application model. The HTTP context tokens are application-defined; the interceptor callback in `app.config.ts` gives them their behavior.

The startup sequence is:

1. Load runtime configuration and establish core authentication.
2. Make authentication getters and `getAccessToken()` usable.
3. Build the user, including any authenticated HTTP requests.
4. Publish the user and settle `prInitialized`.

Thus the interceptor can call `inject(Oidc).isUserLoggedIn` and acquire a token during step 3, even with blocking rendering. It never waits for the user model to obtain a token. If a callback reads core state before step 2, it is re-evaluated once core is ready, in the interceptor's injection context. Keep the callback free of side effects. A callback that returns `false` immediately bypasses authentication.

Requests needed to construct the initial user cannot depend on that user in `shouldInjectAccessToken`. Also do not await `getUser()`, `refreshUser()`, or `prInitialized` from inside `createUser`: that would wait for the operation currently being executed.

## Migrate from the class adapter

| Previous API                                     | New API                                        |
| ------------------------------------------------ | ---------------------------------------------- |
| Extend `AbstractOidcService<DecodedIdToken>`     | Configure `oidcSpa.withUser<User>(...)`        |
| Override `autoLogin`                             | `.withAutoLogin()`                             |
| Override `providerAwaitsInitialization = false`  | `.withNonBlockingRendering()`                  |
| `$decodedIdToken()` / `decodedIdToken$`          | `$user()` / `user$`                            |
| `decodedIdTokenSchema` and mocked decoded tokens | Validation inside `createUser` and `user_mock` |

Continue injecting `Oidc` with Angular's `inject()` function. Pass both `(route, state)` when composing `Oidc.enforceLoginGuard` inside another guard so the complete target URL is available.

This adapter remains browser-oriented. Its provider skips OIDC initialization during server rendering; gate browser-dependent content. This change does not introduce Angular SSR authentication.

## Verify this branch

From the repository root, run `yarn test:angular` to check type inference and Angular integration behavior. The tests use Angular's injector, application initializer, and HTTP testing backend with core's real user lifecycle. Only the OIDC transport is replaced by a deterministic fixture; they do not require credentials or a live identity provider.
