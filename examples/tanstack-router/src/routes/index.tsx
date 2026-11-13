import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

const sourceUrl = "https://github.com/keycloakify/oidc-spa/blob/main/examples/tanstack-router";

function Home() {
    return (
        <article className="home-guide">
            <h1>oidc-spa + TanStack Router</h1>
            <p>
                A minimal todo app showing OpenID Connect across the stack. TanStack Router and Vite run
                the SPA; Express hosts a REST API and tRPC. Both APIs authenticate access tokens and use
                the same todo store.
            </p>
            <div className="example-links">
                <Link to="/todo-list-trpc">
                    <strong>Todo List · tRPC</strong>
                    <span>Load and add your personal todos with a typed API client.</span>
                </Link>
                <Link to="/todo-list-api">
                    <strong>Todo List · API</strong>
                    <span>The same todos, using fetch and ordinary Express handlers.</span>
                </Link>
            </div>
            <p>
                The <Link to="/todo-list-admin">admin page</Link> groups todos by user and lets admins
                delete items. Open your <Link to="/account">account page</Link> from the avatar to view
                your profile and available Keycloak account actions.
            </p>
            <section aria-labelledby="integration-heading">
                <h2 id="integration-heading">How the integration is set up</h2>
                <ol>
                    <li>
                        <h3>Initialize authentication before loading the app</h3>
                        <p>
                            <a href={`${sourceUrl}/vite.config.ts`}>
                                <code>vite.config.ts</code>
                            </a>{" "}
                            registers the oidc-spa Vite plugin with browser runtime protection and DPoP.
                            Early initialization runs before application code, and can skip loading the
                            app in the authentication callback iframe. In <code>src/main.tsx</code>, one{" "}
                            <code>OidcInitializationGate</code> wraps the router.
                        </p>
                    </li>
                    <li>
                        <h3>Define the user your application needs</h3>
                        <p>
                            <a href={`${sourceUrl}/src/oidc.ts`}>
                                <code>src/oidc.ts</code>
                            </a>{" "}
                            uses <code>oidc-spa/react-spa</code>. <code>withUser()</code> maps token
                            claims to a display name, email, avatar, and admin navigation flag.
                            Components receive this model through <code>useOidc()</code>.
                        </p>
                    </li>
                    <li>
                        <h3>Choose a provider through configuration</h3>
                        <p>
                            Edit{" "}
                            <a href={`${sourceUrl}/.env`}>
                                <code>.env</code>
                            </a>{" "}
                            and choose <code>VITE_OIDC_PROVIDER</code>: Keycloak, Auth0, Microsoft Entra
                            ID, or mock mode. <code>Keycloak2</code> demonstrates token introspection
                            instead of offline JWT validation. The pages and API handlers stay the same.
                        </p>
                        <p>
                            The browser reads <code>import.meta.env.VITE_*</code>; Vite embeds those
                            values at build time. Restart development or rebuild after changing them.
                            <a href={`${sourceUrl}/server/oidc.ts`}>
                                {" "}
                                <code>server/oidc.ts</code>
                            </a>{" "}
                            configures token validation independently using <code>process.env</code>.
                            Introspection secrets and KV credentials have no public prefix.
                        </p>
                        <p className="guide-note">
                            Set <code>VITE_OIDC_PROVIDER=mock</code> to explore without an identity
                            provider. The example starts with a signed-in mock admin user.
                        </p>
                    </li>
                    <li>
                        <h3>Protect pages with a shared route</h3>
                        <p>
                            <code>src/routes/_authenticated/route.tsx</code> calls{" "}
                            <code>enforceLogin</code> before its children load. It also mounts the
                            inactivity warning overlay. The header stays in the root, while home and
                            inactivity logout remain public. The layout adds no URL segment.
                        </p>
                        <pre>
                            <code>{`export const Route = createFileRoute("/_authenticated")({
  beforeLoad: enforceLogin,
  component: AuthenticatedLayout
});`}</code>
                        </pre>
                    </li>
                    <li>
                        <h3>Authenticate both API implementations</h3>
                        <p>
                            The tRPC client attaches an access token to requests to{" "}
                            <code>/api/trpc</code>. Its procedures call <code>getUser(req)</code> in the
                            handler. The Express implementation uses <code>/api/todos</code> and the same
                            auth helper. The client uses <code>fetchWithAuth()</code> from{" "}
                            <code>src/oidc.ts</code> to attach its access token:
                        </p>
                        <pre>
                            <code>{`const response = await fetchWithAuth("/api/todos");`}</code>
                        </pre>
                        <p>
                            Every backend operation validates authentication. Admin procedures also check{" "}
                            <code>user.isAdmin</code>, while personal todos are scoped to{" "}
                            <code>user.id</code>. Hiding the Admin link is only a UI convenience. DPoP is
                            handled transparently by oidc-spa's early initialization.
                        </p>
                    </li>
                    <li>
                        <h3>Resume after inactivity logout</h3>
                        <p>
                            <code>autoLogout_returnToUrl</code> sends expired sessions to the public{" "}
                            <code>/inactivity-logout</code> page, with the previous URL in{" "}
                            <code>return_url</code>. TanStack Router checks the path and search
                            parameters when building that URL. The resume link returns to the protected
                            page, where the shared login guard handles sign-in.
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
