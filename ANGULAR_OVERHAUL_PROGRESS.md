# Angular user abstraction overhaul

## Contract and scope

-   Replace `AbstractOidcService` with a functional adapter and typed injection token.
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
