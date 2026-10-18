# Angular user abstraction

The Angular adapter follows the React SPA adapter's user model, runtime configuration, and imperative core API. Angular uses signals for reactive values and a provider for runtime configuration.

## Configure the adapter

```ts
// services/oidc.service.ts
import { oidcSpa } from 'oidc-spa/angular';

export type User = { displayName: string };

export const { provideOidc, injectOidc, getOidc, createOidcInterceptor, enforceLoginGuard } =
  oidcSpa
    .withUser<User>(({ isMock, idTokenClaims }) => {
      if (isMock) return { displayName: 'John Doe' };
      if (typeof idTokenClaims.name !== 'string') throw new Error('Missing name claim');
      return { displayName: idTokenClaims.name };
    })
    .withNonBlockingRendering()
    .createUtils();
```

`withUser` takes the user factory directly, as in React. The factory receives `isMock`, `idTokenClaims`, `accessToken`, `fetchUserInfo`, provider configuration, and `user_current`. Handle mock users inside the factory with `isMock`; the same factory runs in both modes, including refreshes.

Register runtime configuration in `app.config.ts`:

```ts
provideOidc({
  mode: 'real',
  issuerUri: 'https://issuer.example.com/realms/example',
  clientId: 'my-app',
});
```

`provideOidc` also accepts a synchronous or asynchronous configuration getter. It runs in Angular's injection context, so inject services before the first `await`. The kitchen sink loads `/api/oidc-config` this way. Configuration requests must return `false` from the interceptor predicate before reading authentication state.

Use `provideOidc({ mode: 'mock' })` to start signed in without an identity provider. Set `isUserInitiallyLoggedIn: false` for an anonymous session. Optional `idTokenClaims_mock`, `idToken_mock`, `accessToken_mock`, `refreshToken_mock`, `issuerUri_mock`, and `clientId_mock` override the mock's inputs.

In `main.ts`, call `oidcEarlyInit({ BASE_URL: ... })` before dynamically importing Angular. The adapter no longer supplies the base URL to core during initialization.

## Read and refresh the user

```ts
readonly oidc = injectOidc();

async saveProfile() {
  await this.profileService.save();
  await this.oidc.refreshUser!();
}
```

On a guarded route, use `injectOidc({ assert: 'user logged in' })` to obtain the logged-in type without optional methods. The login guard waits for the application user before activating the component.

```html
@defer (when oidc.prInitialized | async) { @if (oidc.initializationError; as error) {
<p role="alert">{{ error.message }}</p>
} @else if (oidc.isUserLoggedIn) {
<p>Hello {{ oidc.user().displayName }}</p>
} @else {
<button (click)="oidc.login({})">Log in</button>
} } @placeholder {
<p>Loading authentication...</p>
}
```

Include `AsyncPipe` in the component imports. By default, the application initializer waits for authentication and the first user. `.withNonBlockingRendering()` lets the application render immediately; gate authentication-dependent UI as above. `prInitialized` remains pending during SSR, leaving the placeholders visible on the server.

`user()` and `autoLogoutState()` are read-only signals. `refreshUser()` returns `Promise<void>`: core renews tokens, recomputes the user, and notifies the signal when the resulting user changes. Routine token rotation with unchanged meaningful claims does not rebuild the user. Deeply equal results retain their identity. A failed later refresh rejects while retaining the previous user.

Runtime configuration failures and initial user failures settle `prInitialized` and expose an `OidcInitializationError`. Without auto-login, the injected UI reports a logged-out state with `initializationError`. A user factory failure can leave core authentication usable; `getOidc()` still exposes tokens independently of the UI's failed user model. Unexpected core or adapter errors propagate through Angular initialization, or through Angular's `ErrorHandler` in non-blocking mode.

## Use the imperative client

```ts
const oidc = await getOidc({ assert: 'user logged in' });
const user = await oidc.getUser();
const tokens = await oidc.getTokens();
const claims = tokens.idTokenClaims;
const accessToken = await oidc.getAccessToken({
  authorizationParams: { audience: 'another-api' },
});
const { unsubscribeFromUserChange } = oidc.subscribeToUserChange(({ user }) => {
  console.log(user.displayName);
});
```

`getOidc()` returns `Oidc_client<User>`, the same core API used by React SPA. It does not wait for initial user construction to finish. It includes `getTokens`, `getAccessToken`, `subscribeToTokensChange`, `getUser`, `subscribeToUserChange`, `refreshUser`, and `subscribeToAutoLogoutState`. The adapter releases imperative subscriptions when the application injector is destroyed; callers can unsubscribe sooner.

Use `login({ returnToUrl, authorizationParams, transformAuthorizationUrl })`, `logout({ returnToUrl })`, and `startAuthorization({ returnToUrl, authorizationParams })`. Inspect `authorizationResult` after returning from an authorization round trip. `autoLogoutState()` forwards core's warning state, including `resetAutoLogoutCountdown()` when a warning is displayed.

When a guard runs before the browser URL changes, parameterized token requests inherit the route's destination as their return URL unless an explicit `returnToUrl` is supplied. The override clears when navigation ends, fails, is cancelled, or is skipped.

## Call an authenticated API inside createUser

Every invocation of the factory runs in the provider's Angular injection context, including mock mode and refreshes. Inject dependencies before the first `await`:

```ts
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CreateClientUser } from 'oidc-spa/angular';
import { UserApi } from './user-api.service';

export const createUser: CreateClientUser<User> = async ({ isMock }) => {
  if (isMock) return { displayName: 'John Doe' };
  return firstValueFrom(inject(UserApi).getUser());
};
```

Core authentication becomes available before user construction. `UserApi` can therefore use the same authenticated `HttpClient` interceptor as other services. An interceptor predicate that reads pending authentication state is retried once core is ready, in Angular's injection context. A predicate that immediately returns `false` bypasses authentication.

Requests that build the initial user must not read that user in `shouldInjectAccessToken`. Do not await `getUser()`, `refreshUser()`, or `prInitialized` inside the factory: those operations wait for user construction. Acquiring tokens through `getOidc()` is supported.

## Auto-login errors

With `.withAutoLogin()`, `injectOidc()` and `getOidc()` have logged-in return types. `enforceLoginGuard` is omitted. The utilities instead expose `injectOidcInitializationError()`, the Angular equivalent of React's `OidcInitializationErrorGate`:

```ts
readonly oidc = injectOidc();
readonly initializationError = injectOidcInitializationError();
```

```html
@defer (when oidc.prInitialized | async) { @if (initializationError(); as error) {
<p role="alert">{{ error.message }}</p>
} @else {
<p>Hello {{ oidc.user().displayName }}</p>
} }
```

Read the error signal before rendering authenticated UI. As in React, imperative `getOidc()` stays pending if initialization fails before core can return a client.

## Breaking changes from the previous Angular adapter

| Previous API                                      | Current API                                               |
| ------------------------------------------------- | --------------------------------------------------------- |
| `withUser({ createUser, user_mock })`             | `withUser(({ isMock, ...params }) => ...)`                |
| `ParamsOfProvide` and `implementation`            | `RuntimeConfigs` and `mode`                               |
| `InjectOidc.Oidc` / `GetOidc.Oidc`                | `Oidc_angular` / `Oidc_client`                            |
| `decodedIdToken`                                  | `idTokenClaims`                                           |
| `getDecodedIdToken()`                             | `(await getTokens()).idTokenClaims`                       |
| `subscribeToTokenRotation()`                      | `subscribeToTokensChange()`                               |
| `(await getUser()).user`                          | `await getUser()`                                         |
| Subscriptions and refresh returned by `getUser()` | Methods directly on the client                            |
| `goToAuthServer` / `backFromAuthServer`           | `startAuthorization` / `authorizationResult`              |
| `redirectUrl` / `redirectTo`                      | `returnToUrl`                                             |
| `extraQueryParams` / `extraTokenParams`           | `authorizationParams` / `tokenParams`                     |
| `transformUrlBeforeRedirect`                      | `transformAuthorizationUrl`                               |
| `doesCurrentHrefRequiresAuth`                     | `doesCurrentHrefEnforceLogin`                             |
| `sessionRestorationMethod: 'full page redirect'`  | `'foreground redirect'`                                   |
| User returned by `refreshUser()`                  | `Promise<void>`; read the signal or `getUser()` afterward |

Runtime configuration remains in `provideOidc` in `app.config.ts`. Pass both `(route, state)` when composing `enforceLoginGuard` so the complete target URL is available. Protected routes must use `RenderMode.Client` in `app.routes.server.ts`; public content can render on the server with deferred authentication UI.

Run `yarn test:angular` from the repository root for public API type checks and Angular integration tests. The tests use Angular's injector and HTTP testing backend with core's real user lifecycle; only the OIDC transport is replaced.
