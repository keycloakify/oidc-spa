# Angular API redesign — completed (2026-09-08)

This section supersedes the historical progress notes below.

## Agreed contract

-   Implement the user's `src/angular/types.ts` proposal, mirroring React SPA's lifecycle and naming.
-   Export `provideOidc`, `injectOidc`, `getOidc`, `createOidcInterceptor`, and (without auto-login) `enforceLoginGuard`.
-   `injectOidc` supports login-state assertions; signals are `user` and `autoLogoutState`. No decoded-ID-token UI API or built-in RxJS user stream.
-   `provideOidc` accepts real/mock parameters or an async injectable getter. Mock user comes from the builder or provider override.
-   UI `prInitialized` includes initial User; imperative `getOidc` and interceptors wait only for core authentication. Never block authenticated createUser requests on User readiness.
-   Preserve injectable createUser on initial build and refresh. Core owns rebuild detection and subsequent failure behavior.
-   Initial core auto-login errors and initial user-build errors are accessible as `initializationError`; other operations requiring failed initialization throw. Do not swallow unexpected errors. One statement per try block.
-   Keep examples free of explicit initialization-error UI. Their proposed-API migration is already in the working tree; preserve it and the user's React/TanStack type edits.
-   User confirmed one active app injector per createUtils. Independent apps use separate createUtils instances; destroying the injector permits reuse.

## Verification checklist

-   [x] Implement runtime and public exports; fix the agreed autoLogoutState signal typo.
-   [x] Migrate type and runtime tests; 30 tests pass covering assertions, getOidc readiness, errors, signals, auto-login interceptors, and lifecycle.
-   [x] Library build and both Angular examples: production builds and existing component tests against the real new adapter.
-   [x] Review formatting, try-block scope, legacy references, and final diff.

## Results and handoff

-   `npm run test:angular`: public type checks and 30 integration tests pass. The fixture uses the real core user lifecycle and Angular injector/HTTP testing backend.
-   `INCREMENTAL=true npm run build`: library build passes. Two TanStack references to `ParamsOfBootstrap.Real<boolean>` were changed to `Real` to accommodate the user's pre-existing type simplification; React/TanStack runtime behavior was not changed.
-   Both examples have the built local package copied into `node_modules/oidc-spa`, matching the repository's start-example workflow. Production builds pass for both examples.
-   `npm test -- --watch=false` passes in both examples: two component tests each, exercising actual adapter mock initialization and templates.
-   Changed source/test formatting and `git diff --check` pass. An AST check verifies one statement in every try block in Angular source and tests (six total).
-   Public legacy token/service APIs and RxJS user streams are gone; negative type/runtime tests confirm their removal.
-   Browser-only `getOidc` follows React: it waits for core, not User, and remains pending on a core auto-login initialization error. The injected view exposes that error so applications can handle it. Initial user-build errors preserve usable tokens.
-   Injection and configuration are synchronous-context operations; the async configuration result is awaited afterward. Initial and refreshed createUser callbacks retain Angular DI.
-   No live identity-provider roundtrip was exercised. The OIDC transport is unchanged and is substituted in integration tests.
-   No documentation changes in this implementation pass, as requested. The older example migration guide and historical notes below describe the superseded API and should not be used as its current contract.
-   Work is uncommitted for review. No outstanding implementation steps.

## SSR follow-up — completed (2026-09-08)

-   Unasserted `injectOidc()` now works during SSR. Its runtime belongs to the request injector, and `prInitialized` stays pending because the server provider skips initialization. Public templates can use `@defer (when oidc.prInitialized | async)` with a placeholder.
-   Authentication getters and asserted injection still require initialized authentication. `getOidc()` remains browser-only.
-   `enforceLoginGuard` rejects immediately on the server, before injecting Router or waiting on initialization, with instructions to configure the protected route using `renderMode: RenderMode.Client` in `app.routes.server.ts`. This replaces the old adapter's indefinite guard wait; it does not automatically switch rendering modes.
-   Added public type comments for the SSR contract.
-   `npm run test:angular`: 36 tests and type checks pass. Added coverage for blocking/nonblocking providers with/without auto-login, request isolation alongside an active browser runtime, early access/assertions, and prompt guard rejection.
-   `INCREMENTAL=true npm run build`: passes.
-   Real Angular 20.3.26 `renderApplication` smoke test against built adapter: public routed HTML and auth placeholder returned for two sequential requests in each initialization mode, with zero configuration/User calls. Temporary fixture and matching platform-server package are in ignored `node_modules/.cache/angular-ssr-smoke`; no dependency manifest changes.
-   Existing examples remain SPA projects; no changes to their rendering configuration or the separate documentation repository in this follow-up.

## Kitchen-sink SSR example — completed (2026-09-08)

-   Generated a fresh Angular CLI 22.1.7 SSR project for reference. Added its server entry point, standalone server bootstrap/configuration, hydration provider, and server build settings to `examples/angular-kitchensink`; kept browser `main.ts` / `main.lazy.ts` OIDC early-init boundary intact.
-   Server routes use `RenderMode.Server` for public content and `RenderMode.Client` for `/protected` and `/admin-only`. Deferred the public todo subscription until auth readiness so its optional-token interceptor does not wait forever during SSR.
-   Pinned added SSR/Express/type dependencies, retained `oidc-spa: latest`, and updated README with preview/deployment instructions. Local builds use the copied branch library as in the repository start-example workflow.
-   Production builds pass for normal and mock configurations; existing component tests pass (2). Formatting and diff checks pass.
-   Actual production HTTP responses for all three routes verified in both configurations. Chrome checks pass in mock development and mock production: public hydration, direct protected/admin visits, client navigation, bearer headers, and no console/page errors. Todo API responses were intercepted with a deterministic fixture during browser checks; live IdP login was not exercised.
-   Mock development preview left running at http://localhost:4201/. Normal production test server was stopped. Browser check script is outside the repository at `/tmp/oidc-ssr-browser/check.cjs`.

## Kitchen-sink Express API — completed (2026-09-08)

-   Preserved the user's removal of token substitution from `src/main.ts`; DPoP remains enabled.
-   Added server auth helper following the Express documentation and an in-memory CRUD router. Todo ownership comes from validated `sub`; optional `/api/greet` distinguishes absent credentials from invalid credentials. Mounted-router validation uses `req.originalUrl` to preserve the `/api` prefix in DPoP proofs.
-   Shared `public/oidc-config.json` supplies issuer, frontend client, and `accessTokenExpectedAudience: "account"`. Backend loads source assets in dev and built assets in production; configuration response bypasses static asset caching. Auth initializes on the first request carrying credentials, so public SSR and anonymous requests do not depend on the IdP.
-   Existing environment file replacement selects frontend mock and backend Static Identity together. Mock user is John Doe. Express trusts forwarded URLs only with `TRUST_PROXY=true`, documented for deployment behind a trusted proxy.
-   Replaced JSONPlaceholder calls: public page displays API greeting; protected page supports add/complete/delete with server data retained across page reloads. No persistence across server restarts/processes.
-   Added `npm run test:api` using Vitest's Node environment. Seven integration tests exercise actual signature/issuer/audience/expiry validation through a local test issuer, DPoP URL/method/binding/replay checks, CRUD validation, user isolation, and static mocks. Existing Angular component tests pass (2).
-   Normal and mock production builds pass. Browser checks against the real Express API in development and production mock mode verify greeting, CRUD, reload persistence, logout, and SSR without console errors. Real production configuration also serves anonymous requests and rejects an invalid token after issuer discovery; no live IdP login was performed.
-   Mock dev preview left running at http://localhost:4201/. Temporary browser script: `/tmp/oidc-ssr-browser/api-check.cjs`. Production test server stopped. No commits made.

## Historical notes (previous API, for reference only)

# Angular user abstraction overhaul

## Contract and scope

-   Replace `AbstractOidcService` with a functional adapter and typed injection token.
-   Keep adapter source layout, naming, parameter conventions, and shared lifecycle logic aligned with `src/react-spa`. Retain differences required for Angular DI, signals, and interceptors.
-   Maintainer rule: every try/catch contains exactly one statement targeting the operation expected to throw. Do not catch surrounding setup/subscription code or convert unexpected bugs into recoverable initialization errors.
-   Match the user's kitchen sink builder: `oidcSpa.withUser({ createUser, user_mock }).withAutoLogin().withNonBlockingRendering().createUtils()`.
-   Preserve `inject(Oidc)`. Expose helpers on the token: `Oidc.provide`, `Oidc.provideMock`, `Oidc.createBearerInterceptor`, and `Oidc.enforceLoginGuard`.
-   Use `src/react-spa/createOidcSpaUtils.ts` and `utilsBuilder.ts` as the user-lifecycle reference. Do not redesign core user management.
-   Keep separate core-authentication and initial-user results. Token acquisition and authentication getters depend only on core; UI initialization includes the initial user result.
-   Wrap every real `createUser` invocation in the provider's Angular injection context. `inject()` must occur before the callback's first await.
-   Initial user failures become `OidcInitializationError`; subsequent refresh behavior remains owned by core. Subscribe to core user changes and expose `$user()`, `user$`, and `refreshUser()`.
-   Mock mode uses the configured user directly and supports a per-provider override, without calling `createUser`.
-   Remove Angular's decoded-token schema/type API. Preserve the user's existing local example edits.
-   Simplify interceptor pre-initialization handling: bypass excluded requests, wait for core when necessary, re-evaluate in injection context. Do not synthesize authentication states. User-dependent initial requests must fail clearly instead of deadlocking.

## Progress

-   [x] Read existing Angular adapter and both Angular examples.
-   [x] Trace React core/user readiness, user errors, mocks, refresh delegation, and subscriptions.
-   [x] Implement functional Angular adapter and builder.
-   [x] Migrate both Angular examples and write migration/usage documentation.
-   [x] Verify authenticated HTTP from injectable createUser, including refresh and both rendering modes.
-   [x] Verify mocks, errors, anonymous state, type propagation, guards, and cleanup.
-   [x] Build library and Angular examples; review final diff.

## Verification notes

The adapter is now implemented in `src/angular/`, with `src/angular/index.ts` as the public entrypoint. Runtime tests pass using Angular's real injector/HTTP testing backend and core's real `createGetUser`; only the OIDC transport is substituted. `scripts/test-angular.ts` bundles the test fixture and runs Node's test runner. Added `@angular/compiler` as a development dependency for Angular JIT in the tests.

Initial-user rejection tests exposed an existing core timer leak: `getUser` now clears its deadlock-detection timer in `finally`, including when the user promise rejects.

**Namespaced API follow-up (requested by user):** Keep the real `InjectionToken` at runtime, attach the helpers, and expose it as `AbstractType<OidcService<AutoLogin, User>> & OidcHelpers`. A documented internal assertion preserves Angular inference without declaring a class. Both Angular examples and the migration guide now use a single `Oidc` import. Follow-up verification passed: Angular type checks (including optional injection and auto-login), all 16 integration tests, the library build, and both Angular production builds against the updated local package. Changed-file formatting and whitespace checks also pass.

Completed verification:

-   `yarn test:angular`: type checks and 16 integration tests pass. Covers injectable authenticated user construction, both rendering modes, meaningful versus routine token changes, explicit refresh, subsequent failures, initial failures with/without auto-login, mocks and override isolation, anonymous requests, configuration/core failures, guards, and injector cleanup.
-   `INCREMENTAL=true yarn build`: successful CJS and ESM library build, including the new Angular directory in the ESM-only exclusion rules.
-   `yarn build` in both `examples/angular` and `examples/angular-kitchensink`: successful production builds against a local copy of this branch's built package.
-   Kitchen sink `ng serve --configuration mock --port 4317`: successful compile and server startup. Server stopped after checking.
-   Interactive browser smoke test could not run: browser runtime reported no available browsers; discovery returned an empty list. Live identity-provider login was not tested.
-   Changed-file Prettier checks and `git diff --check`: pass.
-   Whole-repository `yarn format:check` reported two unrelated existing todo JSON files: `examples/tanstack-start/todos_ecb18ce2-087f-421c-9d5f-ef0c304ee3b2.json` and `examples/tanstack-start/todos_github|6702424.json`. Left untouched. Temporary type probes were removed; generated Angular build JSON was formatted.
-   CI now runs `yarn test:angular` before the library build.

Documentation is in `examples/angular-kitchensink/USER_ABSTRACTION.md`, linked from both Angular READMEs. The external GitBook site was not edited; no local GitBook source checkout exists here.

No remaining implementation work. Changes are uncommitted for review.

## Resume

Read this file, inspect the working tree, and continue unchecked items. Existing user changes were already present under `examples/angular-kitchensink` before implementation. Do not reset them. No subagents requested.

## Targeted error handling follow-up

Removed the broad catch around Angular initialization. Only `createOidc()` catches the expected `OidcInitializationError` (core's auto-login escape hatch), rethrowing other errors unchanged. Initial `getUser()` failure handling remains aligned with React. Configuration, module loading, mock construction, and subscription setup are outside catches. Every try block in `src/angular/` contains one statement.

Updated tests require synchronous/asynchronous configuration errors, unexpected core errors, and subscription errors (even an `OidcInitializationError` from that wrong source) to reject Angular bootstrap with the original error. Angular type checks and all 19 integration tests pass. The library build passes. An AST check confirms that all five try blocks in `src/angular/` contain exactly one statement. Changed-file formatting and whitespace checks pass.

## Angular entrypoint alignment

Moved the public entrypoint to `src/angular/index.ts`, matching the React adapter directory layout. Package exports now target `dist/esm/angular/index.d.ts` and `dist/esm/angular/index.mjs`. The build continues to exclude the Angular directory from CommonJS output; the obsolete single-file exclusion is removed. Verification passed: Angular type checks and all 19 integration tests, the library build, public `oidc-spa/angular` import resolution and export target existence, both Angular production builds against the updated package, formatting, and whitespace checks.

## Early-access error API removal

Removed the public early-access error class and its module. Premature application reads throw plain `Error` with the existing diagnostics. Only during interceptor evaluation, pending core reads throw the core readiness promise; the interceptor recognizes that exact promise and waits before retrying. User-read failures and unrelated predicate errors still propagate. The deferred file-consolidation work and proposed `getOidc` utility remain out of scope. Verification passed: Angular type checks and all 19 integration tests (including unchanged propagation of unrelated interceptor predicate errors), the library build, formatting, and whitespace checks.

## Adapter source consistency

Consolidated `createOidcService.ts` into `createOidcSpaUtils.ts`. Angular now matches React's four-file layout: `index.ts`, `types.ts`, `utilsBuilder.ts`, and `createOidcSpaUtils.ts`. The service factory is internal to `createOidcSpaUtils`, preserving state per injector. Removed `BuilderParams`; factory and builder arguments are named `params` with inline types. Shared core/user deferred and result names, static user mock naming, and explicit builder parameter forwarding follow React.

Updated the Angular test transport substitution to target the consolidated implementation. Type checks and all 19 integration tests pass. The library build and built public entrypoint import pass. Directory comparison confirms the matching source layout; an AST check confirms all five Angular try blocks contain exactly one statement. Changed-file formatting and whitespace checks pass.
