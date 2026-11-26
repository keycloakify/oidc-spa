import { Link } from "react-router";

const sourceUrl = "https://github.com/keycloakify/oidc-spa/blob/main/examples/react-router-framework";

export default function HomePage() {
    return (
        <article className="home-guide">
            <h1>oidc-spa + React Router</h1>
            <p>
                A minimal todo app showing OpenID Connect across the stack. The browser handles sign-in;
                React Router server loaders, resource routes, and tRPC validate access tokens and work
                with the same typed user and todo store.
            </p>
            <p>
                Framework mode with <code>ssr: "unstable_api-only"</code> keeps the UI in the browser and
                hosts backend code in the same project. Public pages render while authentication
                initializes, and protected pages require login before loading their data.
            </p>
            <div className="example-links">
                <Link to="/todo-list">
                    <strong>Todos · Loaders</strong>
                    <span>Load and add your personal todos with native loaders and actions.</span>
                </Link>
                <Link to="/todo-list-api">
                    <strong>Todos · API</strong>
                    <span>Call JSON resource routes with fetchWithAuth and a client loader.</span>
                </Link>
                <Link to="/todo-list-trpc">
                    <strong>Todos · tRPC</strong>
                    <span>Call a typed tRPC API hosted by a resource route.</span>
                </Link>
                <Link to="/todo-list-admin">
                    <strong>Todo List Admin</strong>
                    <span>See todos grouped by user and delete items with the admin role.</span>
                </Link>
            </div>
            <p>
                Open your <Link to="/account">account page</Link> from the avatar to view your profile
                and available account actions.
            </p>
            <section aria-labelledby="integration-heading">
                <h2 id="integration-heading">How the integration is set up</h2>
                <ol>
                    <li>
                        <h3>Register the plugin and handle readiness</h3>
                        <p>
                            <a href={`${sourceUrl}/vite.config.ts`}>
                                <code>vite.config.ts</code>
                            </a>{" "}
                            registers the oidc-spa Vite plugin with browser runtime protection and DPoP.
                            The plugin installs early initialization before application code runs. Public
                            pages render while OIDC initializes; the header checks{" "}
                            <code>isOidcReady</code> before showing authentication controls.{" "}
                            <code>HydrateFallback</code> returns <code>null</code>.
                        </p>
                    </li>
                    <li>
                        <h3>Define the user your application needs</h3>
                        <p>
                            <a href={`${sourceUrl}/app/oidc.ts`}>
                                <code>app/oidc.ts</code>
                            </a>{" "}
                            uses <code>oidc-spa/react</code>. <code>withUser()</code> maps token claims
                            to a display name, email, avatar, and admin navigation flag. Components
                            receive that model through <code>useOidc()</code>.
                        </p>
                    </li>
                    <li>
                        <h3>Choose a provider through configuration</h3>
                        <p>
                            In <code>.env</code>, choose <code>VITE_OIDC_PROVIDER</code>: Keycloak,
                            Auth0, Microsoft Entra ID, or mock mode. <code>Keycloak2</code> demonstrates
                            introspection instead of offline JWT validation.
                        </p>
                        <p>
                            Browser authentication in <code>app/oidc.ts</code> and token validation in{" "}
                            <a href={`${sourceUrl}/app/.server/oidc.ts`}>
                                <code>app/.server/oidc.ts</code>
                            </a>{" "}
                            are configured independently. Configuration getters can be synchronous or
                            asynchronous; environment variables are simply this example's configuration
                            source.
                        </p>
                        <p>
                            Vite embeds <code>VITE_*</code> settings in the browser build. Restart
                            development or rebuild after changing them. Introspection secrets and KV
                            credentials have no public prefix and stay on the server.
                        </p>
                        <p className="guide-note">
                            To explore without an identity provider, set{" "}
                            <code>VITE_OIDC_PROVIDER=mock</code>. The example starts with a signed-in
                            mock admin user.
                        </p>
                    </li>
                    <li>
                        <h3>Protect navigation and authenticate server requests</h3>
                        <p>
                            <a href={`${sourceUrl}/app/routes.ts`}>
                                <code>app/routes.ts</code>
                            </a>{" "}
                            groups protected pages under a pathless layout. Its client middleware calls{" "}
                            <code>enforceLogin(args)</code> before child loaders and actions run:
                        </p>
                        <pre>
                            <code>{`export const clientMiddleware: Route.ClientMiddlewareFunction[] = [
  async (args, next) => {
    await enforceLogin(args);
    await next();
  }
];`}</code>
                        </pre>
                        <p>
                            <a href={`${sourceUrl}/app/entry.client.tsx`}>
                                <code>app/entry.client.tsx</code>
                            </a>{" "}
                            attaches the current access token to React Router's data requests using{" "}
                            <code>HydratedRouter unstable_fetch</code>. Each server loader independently
                            authenticates the request:
                        </p>
                        <pre>
                            <code>{`export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  const todos = await getTodosStore().readTodos({ userId: user.id });
  return { todos };
}`}</code>
                        </pre>
                    </li>
                    <li>
                        <h3>Submit forms to native server actions</h3>
                        <p>
                            The todo form uses React Router's <code>Form</code>. Its client action calls{" "}
                            <code>args.serverAction()</code> after the shared login check. The server
                            action validates the access token, reads the form, and saves the todo for the
                            authenticated user. React Router revalidates loader data afterward.
                        </p>
                        <p>
                            Admin server loaders and actions also check <code>user.isAdmin</code>.
                            Personal operations scope data to <code>user.id</code>; hiding navigation
                            links is only a UI convenience.
                        </p>
                        <p>
                            Todos use the same storage implementation as the Next.js example: JSON files
                            locally, or Upstash Redis when configured. On Vercel, configure Upstash for
                            persistent storage.
                        </p>
                    </li>
                    <li>
                        <h3>Use a JSON API or a typed API</h3>
                        <p>
                            <Link to="/todo-list-api">The API page</Link> uses a client loader and
                            <code> fetchWithAuth()</code> to call <code>/api/todos</code>. The resource
                            route exports a server loader for GET and an action for POST, returns JSON,
                            and has no UI component. Its action accepts JSON from any HTTP client.
                        </p>
                        <p>
                            <Link to="/todo-list-trpc">The tRPC page</Link> uses a typed client to call
                            <code> /api/trpc/*</code>. That resource route delegates to tRPC's Fetch
                            adapter. The client attaches access tokens through its headers callback, and
                            each procedure authenticates the request. Both pages revalidate their client
                            loader after a mutation. All three approaches share the same todos.
                        </p>
                    </li>
                    <li>
                        <h3>Resume after inactivity logout</h3>
                        <p>
                            The root mounts <code>AutoLogoutWarningOverlay</code> so session warnings can
                            appear on every page. When the session expires,{" "}
                            <code>autoLogout_returnToUrl</code> sends the user to the public{" "}
                            <code>/inactivity-logout</code> page, preserving the current URL in{" "}
                            <code>return_url</code>. Its resume link returns to that URL, where the
                            protected layout requires login again. The home page remains public too.
                        </p>
                    </li>
                    <li>
                        <h3>Already have a backend? Use SPA mode</h3>
                        <p>
                            Set <code>ssr: false</code>, remove the server code and custom client entry,
                            and keep the readiness checks and client guards. In client loaders and
                            actions, call your API with an access token instead of using{" "}
                            <code>args.serverLoader()</code> or <code>args.serverAction()</code>. The
                            comments in{" "}
                            <a href={`${sourceUrl}/react-router.config.ts`}>
                                <code>react-router.config.ts</code>
                            </a>{" "}
                            and the README describe the changes. This integration supports API-only and
                            SPA mode; authentication initializes in the browser.
                        </p>
                    </li>
                </ol>
            </section>
            <footer className="guide-links">
                <a href="https://docs.oidc-spa.dev/">oidc-spa documentation ↗</a>
                <a href={sourceUrl}>Browse the example source ↗</a>
            </footer>
        </article>
    );
}
