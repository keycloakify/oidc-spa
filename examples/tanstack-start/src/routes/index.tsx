import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    component: Home
});

const sourceUrl = "https://github.com/keycloakify/oidc-spa/blob/main/examples/tanstack-start-next";

function Home() {
    return (
        <article className="home-guide">
            <h1>oidc-spa + TanStack Start</h1>
            <p>
                A minimal todo app showing OpenID Connect across the stack. The browser handles sign-in;
                backend middleware validates access tokens and gives your handlers a typed user.
            </p>
            <div className="example-links">
                <Link to="/todo-list-server-function">
                    <strong>Try server functions</strong>
                    <span>
                        Load and add todos with <code>oidcFnMiddleware</code>.
                    </span>
                </Link>
                <Link to="/todo-list-api">
                    <strong>Try API routes</strong>
                    <span>
                        The same todos, using <code>fetch</code> and <code>oidcRequestMiddleware</code>.
                    </span>
                </Link>
            </div>
            <p>
                Both versions share the same per-user data. You can also explore{" "}
                <Link to="/todo-list-admin">admin-only access</Link> and your{" "}
                <Link to="/account">account page</Link>.
            </p>

            <section aria-labelledby="integration-heading">
                <h2 id="integration-heading">How the integration is set up</h2>
                <ol>
                    <li>
                        <h3>Register the Vite plugin</h3>
                        <p>
                            <a href={`${sourceUrl}/vite.config.ts`}>
                                <code>vite.config.ts</code>
                            </a>{" "}
                            includes <code>oidcSpa()</code> from <code>oidc-spa/vite-plugin</code>. The
                            plugin wires up browser initialization, the server entry, and runtime
                            configuration. It also switches routes using <code>enforceLogin</code> to
                            client rendering, while public pages like this one can be server-rendered.
                        </p>
                    </li>
                    <li>
                        <h3>Define the user your app needs</h3>
                        <p>
                            The integration lives in{" "}
                            <a href={`${sourceUrl}/src/oidc.ts`}>
                                <code>src/oidc.ts</code>
                            </a>
                            . <code>withClientUser()</code> maps token claims to the profile returned by{" "}
                            <code>useOidc()</code>: a display name, email, avatar, and admin navigation
                            flag. <code>withServerUser()</code> maps validated access token claims to the
                            backend identity and permissions: <code>id</code> and <code>isAdmin</code>.
                        </p>
                        <p>
                            <code>createUtils()</code> exports the typed hooks, login guard, and
                            middleware used throughout the app. The{" "}
                            <a href={`${sourceUrl}/src/components/AppHeader.tsx`}>header</a> uses these
                            helpers for login, logout, and the avatar; the{" "}
                            <a href={`${sourceUrl}/src/routes/account.tsx`}>account page</a> displays the
                            profile and offers Keycloak account actions when available.
                        </p>
                    </li>
                    <li>
                        <h3>Choose a provider at runtime</h3>
                        <p>
                            <code>withRuntimeConfigs()</code> keeps provider settings in one place. The{" "}
                            <code>client</code> section configures sign-in, scopes, and session behavior.
                            The <code>server</code> section configures access token validation, using
                            either offline JWT validation or an introspection endpoint. Both share an{" "}
                            <code>issuerUri</code>.
                        </p>
                        <p>
                            Copy{" "}
                            <a href={`${sourceUrl}/.env.sample`}>
                                <code>.env.sample</code>
                            </a>{" "}
                            to <code>.env</code>, choose <code>OIDC_PROVIDER</code>, and fill in the
                            matching settings. This example includes Keycloak, Auth0, Microsoft Entra ID,
                            and a mock mode. <code>Keycloak2</code> demonstrates introspection. Provider
                            settings are read at runtime, so you can switch between the configured
                            providers without changing the routes or rebuilding the app.
                        </p>
                        <p className="guide-note">
                            To explore locally without an identity provider, set{" "}
                            <code>OIDC_PROVIDER=mock</code>. The example starts with a signed-in mock
                            admin user.
                        </p>
                    </li>
                    <li>
                        <h3>Protect pages and backend requests</h3>
                        <p>
                            Protected pages declare <code>beforeLoad: enforceLogin</code> to send
                            visitors through sign-in before loading. Their backend requests are protected
                            separately. In the{" "}
                            <a href={`${sourceUrl}/src/routes/todo-list-server-function.tsx`}>
                                server function version
                            </a>
                            , <code>oidcFnMiddleware</code> attaches the access token in the browser and
                            validates it on the server:
                        </p>
                        <pre>
                            <code>{`const getTodos = createServerFn({ method: "GET" })
  .middleware([oidcFnMiddleware({ require: "authed request" })])
  .handler(({ context: { oidc } }) =>
    getTodosStore().readTodos({ userId: oidc.user.id })
  );`}</code>
                        </pre>
                        <p>
                            The <a href={`${sourceUrl}/src/routes/api/todos.ts`}>API route version</a>{" "}
                            uses <code>oidcRequestMiddleware</code> on <code>/api/todos</code>. Its{" "}
                            <a href={`${sourceUrl}/src/routes/todo-list-api.tsx`}>client page</a>{" "}
                            retrieves an access token with <code>getOidc()</code> and sends it in the{" "}
                            <code>Authorization: Bearer …</code> header. Both approaches expose the
                            backend user as <code>context.oidc.user</code>.
                        </p>
                    </li>
                    <li>
                        <h3>Authorize admin operations on the server</h3>
                        <p>
                            The <a href={`${sourceUrl}/src/routes/todo-list-admin.tsx`}>admin page</a>{" "}
                            lists todos grouped by user ID and lets admins delete items. Both server
                            functions require the same authorization check:
                        </p>
                        <pre>
                            <code>{`oidcFnMiddleware({
  require: "authed request",
  hasAuthorization: ({ user }) => user.isAdmin
});`}</code>
                        </pre>
                        <p>
                            The browser uses <code>canSeeAdminNavigation</code> to show the Admin link.
                            The server independently checks <code>user.isAdmin</code> before allowing
                            either operation.
                        </p>
                    </li>
                </ol>
            </section>

            <footer className="guide-links">
                <a href="https://docs.oidc-spa.dev/">oidc-spa documentation ↗</a>
                <a href="https://github.com/keycloakify/oidc-spa/tree/main/examples/tanstack-start-next">
                    Browse the example source ↗
                </a>
            </footer>
        </article>
    );
}
