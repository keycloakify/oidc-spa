# Capacitor Angular Example

This example demonstrates how to use oidc-spa with Capacitor for native mobile authentication.

## Features

- **Capacitor Preferences** for persistent token storage
- **Capacitor Browser** plugin for authentication redirects
- **Deep link handling** via App plugin for warm start and cold start
- **Event-free native callback flow** - the redirect is buffered and processed by oidc-spa during app reload

## Setup

1. Install dependencies:

```bash
npm install
```

2. Add Capacitor:

```bash
npx cap init
npx cap add ios
npx cap add android
```

3. Configure your deep link URL scheme in `capacitor.config.ts`:

```typescript
{
  appId: 'com.example.oidcspa',
  appName: 'oidc-spa-capacitor',
  webDir: 'dist/capacitor-angular',
  server: {
    androidScheme: 'https'
  }
}
```

4. Add your redirect URI to the Identity Provider (IdP):

   - For local development: `http://localhost:4200`
   - For Android: `https://localhost`
   - Or your custom scheme: `myapp://callback`

5. Update `app.config.ts` with your IdP settings:

```typescript
import { CapacitorNavigator, CapacitorPreferencesStorageAdapter } from 'oidc-spa/capacitor';

const storage = new CapacitorPreferencesStorageAdapter();
const navigator = new CapacitorNavigator({
  callbackUrlPolicy: 'tolerant',
  browserFinishedGracePeriodMs: 1000,
});

Oidc.provide({
  issuerUri: 'https://your-idp.com',
  clientId: 'your-client-id',
  storageAdapter: storage,
  tokenStorageAdapter: storage,
  navigator,
  onNavigatorWarning: (warning) => {
    console.warn('[NavigatorWarning]', warning);
  },
  isNativeApp: true,
  postLoginRedirectUrl: 'myapp://callback',
});
```

`CapacitorPreferencesStorageAdapter` stores values under the `oidc-spa:` namespace by default. You can override it with `new CapacitorPreferencesStorageAdapter({ scope: 'your-scope' })`.

Note: Capacitor Preferences is not encrypted at rest by default. For production use, choose the storage strategy based on your security requirements. If you need stronger protection for persisted tokens, wrap it with a secure storage or biometric-gated storage implementation.

`postLoginRedirectUrl` is required in native mode because oidc-spa uses it as the callback URI for the deep link back into your app.

`callbackUrlPolicy` controls callback URL matching:

- `"tolerant"` treats `/callback` and `/callback/` as equivalent.
- `"strict"` requires exact path matching.

`browserFinishedGracePeriodMs` controls how long oidc-spa waits after `browserFinished` before treating the flow as browser-closed.

## Biometric Authentication

To add biometric authentication, create a custom storage adapter that wraps the Capacitor storage with biometric unlock:

```typescript
import { CapacitorNavigator, CapacitorPreferencesStorageAdapter } from 'oidc-spa/capacitor';
import { MyBiometricStorage } from './my-biometric-storage';

const baseStorage = new CapacitorPreferencesStorageAdapter();
const biometricStorage = new MyBiometricStorage(baseStorage);
const navigator = new CapacitorNavigator({
  callbackUrlPolicy: 'tolerant',
  browserFinishedGracePeriodMs: 1000,
});

Oidc.provide({
  issuerUri: '...',
  clientId: '...',
  storageAdapter: biometricStorage,
  tokenStorageAdapter: biometricStorage,
  navigator,
  onNavigatorWarning: (warning) => {
    console.warn('[NavigatorWarning]', warning);
  },
  isNativeApp: true,
  postLoginRedirectUrl: 'myapp://callback',
});
```

## Architecture

```text
┌─────────────────────────────────────────┐
│           Angular Application           │
└─────────────────┬─────────────────────┘
                  │ uses
┌─────────────────▼─────────────────────┐
│         oidc-spa/angular              │
│  ( AbstractOidcService, provide() )   │
└─────────────────┬─────────────────────┘
                  │ creates
┌─────────────────▼─────────────────────┐
│              oidc-spa                  │
│    ( createOidc, token management )    │
└─────────────────┬─────────────────────┘
                  │ uses
┌─────────────────▼─────────────────────┐
│         oidc-ts-client                 │
│    ( UserManager, OidcClient )        │
└───────────────────────────────────────┘
```

## Key Differences from Web

| Feature       | Web             | Capacitor                                  |
| ------------- | --------------- | ------------------------------------------ |
| Token Storage | localStorage    | Capacitor Preferences                      |
| Redirect      | window.location | Browser.open()                             |
| Deep Links    | URL params      | `App.getLaunchUrl()` + `App.addListener()` |
| Iframes       | Supported       | Disabled (`isNativeApp: true`)             |

## Redirect Handling

In Capacitor environments, you can subscribe to auth-flow abortion events (for example when users close the browser before redirect):

```typescript
const navigator = new CapacitorNavigator({
  callbackUrlPolicy: 'tolerant',
  browserFinishedGracePeriodMs: 1000,
});

const unsubscribe = navigator.addAuthFlowAbortedListener(() => {
  console.warn('[AuthFlowAborted] User closed the browser before redirect callback.');
});
```

`unsubscribe()` detaches the listener.

Instead, the flow is:

1. oidc-spa opens the system browser for login or logout.
2. The Identity Provider redirects back to your app using `postLoginRedirectUrl`.
3. Capacitor provides that deep link through `App.getLaunchUrl()` on cold start or `App.addListener('appUrlOpen', ...)` on warm start.
4. oidc-spa buffers the redirect URL, reloads the app, and then completes the normal OIDC callback handling during initialization.

This keeps the native callback path aligned with the standard browser redirect flow.

## Session Restoration

In Capacitor environments, iframe-based silent refresh is disabled. Session restoration works via:

1. **Refresh token flow**: Uses refresh token if available
2. **Full re-login**: If no valid refresh token exists

Configure your IdP to issue refresh tokens with appropriate expiration times.
