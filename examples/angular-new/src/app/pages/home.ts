import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <article class="home-guide">
      <h1>oidc-spa + Angular</h1>
      <p>
        A minimal Angular app showing OpenID Connect and authenticated HTTP requests. An Express API
        is included to make the demo runnable. You can use the Angular integration with your
        existing API and its own token validation.
      </p>
      <div class="example-links">
        <a routerLink="/todo-list">
          <strong>Try the todo list</strong>
          <span>Load and add your own todos with Angular's <code>HttpClient</code>.</span>
        </a>
        <a routerLink="/todo-list-admin">
          <strong>Explore admin access</strong>
          <span
            >View todos grouped by user and delete items with server-enforced authorization.</span
          >
        </a>
      </div>
      <p>You can also explore your <a routerLink="/account">account page</a> using the avatar.</p>

      <section aria-labelledby="integration-heading">
        <h2 id="integration-heading">How the integration is set up</h2>
        <ol>
          <li>
            <h3>Initialize authentication before rendering</h3>
            <p>
              <a [href]="sourceUrl + '/src/main.earlyInit.ts'"
                ><code>src/main.earlyInit.ts</code></a
              >
              calls <code>oidcEarlyInit()</code> with DPoP enabled, then dynamically imports
              <code>src/main.ts</code> to bootstrap Angular. <code>provideOidc()</code> in
              <a [href]="sourceUrl + '/src/app/app.config.ts'"><code>app.config.ts</code></a>
              waits for authentication and the user profile before the app renders. This is a
              browser-only application, without server-side rendering.
            </p>
          </li>
          <li>
            <h3>Define the user your app needs</h3>
            <p>
              <a [href]="sourceUrl + '/src/app/oidc.ts'"><code>src/app/oidc.ts</code></a>
              uses <code>withUser()</code> to map token claims to <code>User_client</code>: a
              display name, email, avatar and admin navigation flag. Components use
              <code>injectOidc()</code> to access authentication state and the reactive
              <code>user()</code> signal. The header handles login, registration and logout; the
              account page offers Keycloak account actions when available.
            </p>
          </li>
          <li>
            <h3>Configure browser authentication</h3>
            <p>
              <code>provideOidc()</code> accepts a configuration object or a synchronous or
              asynchronous getter. You can use constants, Angular environment files, or your own
              configuration service. A direct configuration looks like this:
            </p>
            <pre><code [textContent]="configurationExample"></code></pre>
            <p>
              This example uses an async getter in
              <a [href]="sourceUrl + '/src/app/app.config.ts'"><code>app.config.ts</code></a
              >. It fetches public environment values from <code>/api/oidc-client-env</code> and
              builds the browser configuration in Angular. This endpoint is a convenience for this
              demo; your API does not need to provide one.
            </p>
            <p>
              Choose <code>OIDC_PROVIDER</code> in <code>.env</code>: Keycloak, Auth0, Microsoft
              Entra ID, or mock mode. <code>Keycloak2</code> demonstrates introspection in the
              included backend. Restart Express and reload the page after changing providers. The
              routes and components stay the same, without rebuilding Angular.
            </p>
            <p class="guide-note">
              To explore without an identity provider, set <code>OIDC_PROVIDER=mock</code>. The
              example starts with a signed-in mock admin user.
            </p>
          </li>
          <li>
            <h3>Protect pages and opt requests into authentication</h3>
            <p>
              Protected routes use <code>canActivate: [enforceLoginGuard]</code> to require sign-in
              before loading. The admin route also checks <code>canSeeAdminNavigation</code> in its
              guard, showing an alert and redirecting home when access is denied. In
              <a [href]="sourceUrl + '/src/app/services/todo.service.ts'"
                ><code>todo.service.ts</code></a
              >, requests explicitly opt in to access token injection using
              <code>REQUIRE_ACCESS_TOKEN</code>:
            </p>
            <pre><code [textContent]="requestExample"></code></pre>
            <p>
              <code>createOidcInterceptor()</code> reads this context token and attaches a current
              access token. Public requests, including the runtime configuration request, don't
              carry one.
            </p>
          </li>
          <li>
            <h3>Validate tokens and authorize operations on the server</h3>
            <p>
              The included Express backend configures token validation separately in
              <a [href]="sourceUrl + '/server/oidc.ts'"><code>server/oidc.ts</code></a
              >. It uses <code>extractRequestAuthContext()</code> and
              <code>validateAndGetAccessTokenClaims()</code> from <code>oidc-spa/server</code>. It
              validates bearer tokens or DPoP proofs, then maps the claims to the backend user:
              <code>User_server</code>, with <code>id</code> and <code>isAdmin</code>. Your backend
              can keep its own validation implementation; using <code>oidc-spa/angular</code> does
              not require <code>oidc-spa/server</code>.
            </p>
            <pre><code [textContent]="handlerExample"></code></pre>
            <p>
              Personal todos belong to the validated user's ID. Both admin endpoints call
              <code>getUser(req)</code> and check <code>user.isAdmin</code> before listing
              everyone's todos or deleting an item. The UI's <code>canSeeAdminNavigation</code> flag
              controls navigation; the API independently enforces the <code>admin</code> role on
              every request.
            </p>
          </li>
        </ol>
      </section>
      <footer class="guide-links">
        <a href="https://docs.oidc-spa.dev/">oidc-spa documentation ↗</a>
        <a href="https://github.com/keycloakify/oidc-spa/tree/main/examples/angular-new"
          >Browse the example source ↗</a
        >
      </footer>
    </article>
  `,
})
export class Home {
  readonly sourceUrl = 'https://github.com/keycloakify/oidc-spa/blob/main/examples/angular-new';
  readonly configurationExample = `provideOidc({
  mode: 'real',
  issuerUri: 'https://auth.example.com',
  clientId: 'my-app',
});`;
  readonly requestExample = `this.http.get<TodoItem[]>('/api/todos', {
  context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
});`;
  readonly handlerExample = `api.get('/todos', async (req, res) => {
  const user = await getUser(req);
  res.json(await getTodosStore().readTodos({ userId: user.id }));
});`;
}
