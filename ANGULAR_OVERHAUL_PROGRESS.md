# Angular user abstraction overhaul

## Contract and scope

-   Replace `AbstractOidcService` with a functional adapter and typed injection token.
-   Match the user's kitchen sink builder: `oidcSpa.withUser({ createUser, user_mock }).withAutoLogin().withNonBlockingRendering().createUtils()`.
-   Preserve `inject(Oidc)`. Return helpers separately: `provideOidc`, `provideMockOidc`, `createBearerInterceptor`, and `enforceLoginGuard` (see the type-inference decision below).
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
-   [ ] Implement functional Angular adapter and builder.
-   [ ] Migrate both Angular examples and write migration/usage documentation.
-   [ ] Verify authenticated HTTP from injectable createUser, including refresh and both rendering modes.
-   [ ] Verify mocks, errors, anonymous state, type propagation, guards, and cleanup.
-   [ ] Build library and Angular examples; review final diff.

## Verification notes

The adapter is now implemented in `src/angular/`, with `src/angular.ts` as the public entrypoint. Runtime tests pass using Angular's real injector/HTTP testing backend and core's real `createGetUser`; only the OIDC transport is substituted. `scripts/test-angular.ts` bundles the test fixture and runs Node's test runner. Added `@angular/compiler` as a development dependency for Angular JIT in the tests.

Initial-user rejection tests exposed an existing core timer leak: `getUser` now clears its deadlock-detection timer in `finally`, including when the user promise rejects.

**API adjustment (asked asynchronously; proceeded with the recommended default after waiting):** Angular's `InjectionToken<T>` is structurally phantom in T. Attaching helpers via an intersection or subclass makes `inject(Oidc)` and `injector.get(Oidc)` infer unknown. Return a plain typed token plus separate helpers. This preserves honest types and inference without pretending the token is a constructor. The user has not requested the alternative. The change was explained in commentary before proceeding.

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
