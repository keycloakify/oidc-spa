import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <article class="home-guide">
      <h1>oidc-spa + Angular</h1>
      <p>
        A minimal todo app showing OpenID Connect across the stack. Angular handles sign-in; an
        Express API validates access tokens and identifies the user making each request.
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
              <a [href]="sourceUrl + '/src/main.ts'"><code>src/main.ts</code></a> calls
              <code>oidcEarlyInit()</code> before loading Angular, with DPoP enabled.
              <code>provideOidc()</code> in
              <a [href]="sourceUrl + '/src/app/app.config.ts'"><code>app.config.ts</code></a>
              waits for authentication and the user profile before the app renders. This is a
              browser-only application, without server-side rendering.
            </p>
          </li>
          <li>
            <h3>Define the user your app needs</h3>
            <p>
              <a [href]="sourceUrl + '/src/app/services/oidc.service.ts'"
                ><code>oidc.service.ts</code></a
              >
              uses <code>withUser()</code> to map token claims to a display name, email, avatar and
              admin navigation flag. Components use <code>injectOidc()</code> to access
              authentication state and the reactive <code>user()</code> signal. The header handles
              login, registration and logout; the account page offers Keycloak account actions when
              available.
            </p>
          </li>
          <li>
            <h3>Choose a provider at runtime</h3>
            <p>
              Choose <code>OIDC_PROVIDER</code> in <code>.env</code>. This example supports
              Keycloak, Auth0, Microsoft Entra ID and mock mode. <code>Keycloak2</code>
              demonstrates token introspection. Provider settings live in
              <a [href]="sourceUrl + '/server/config.ts'"><code>server/config.ts</code></a
              >. Angular loads the public settings from <code>/api/oidc-config</code> during
              initialization. Validation settings and introspection credentials stay on the server.
            </p>
            <p>
              Restart Express and reload the page after changing providers. The routes and
              components stay the same, and the Angular app does not need to be rebuilt.
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
              before loading. In
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
              <a [href]="sourceUrl + '/server/auth.ts'"><code>server/auth.ts</code></a> uses
              <code>extractRequestAuthContext()</code> and
              <code>validateAndGetAccessTokenClaims()</code> from <code>oidc-spa/server</code>. It
              validates bearer tokens or DPoP proofs, then maps the claims to the backend user:
              <code>id</code> and <code>isAdmin</code>.
            </p>
            <pre><code [textContent]="handlerExample"></code></pre>
            <p>
              Personal todos belong to the validated user's ID. Both admin endpoints call
              <code>requireAdmin()</code> before listing everyone's todos or deleting an item. The
              UI's <code>canSeeAdminNavigation</code> flag controls navigation; the API
              independently enforces the <code>admin</code> role on every request.
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
  readonly requestExample = `this.http.get<TodoItem[]>('/api/todos', {
  context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true),
});`;
  readonly handlerExample = `api.get('/todos', async (req, res) => {
  const user = await getUser(req);
  res.json(await getTodosStore().readTodos({ userId: user.id }));
});`;
}
