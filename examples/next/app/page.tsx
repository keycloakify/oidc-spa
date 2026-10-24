import Link from "next/link";

const sourceUrl = "https://github.com/keycloakify/oidc-spa/blob/main/examples/next";

export default function HomePage() {
    return (
        <article className="home-guide">
            <h1>oidc-spa + Next.js</h1>
            <p>
                A minimal todo app showing OpenID Connect across the stack. The browser handles sign-in;
                the backend validates access tokens and gives your handlers a typed user.
            </p>
            <p>
                Next.js serves as a SPA framework here, with the frontend and backend in one project. The
                whole UI waits for browser auth to initialize. Server-rendered pages do not have access
                to the browser session; authenticated data comes from browser requests.
            </p>
            <p>
                Browser authentication and API token validation are configured independently. The
                included backend uses <code>oidc-spa/server</code>; your existing API can use its own
                validation implementation.
            </p>
            <div className="example-links">
                <Link href="/todo-list-trpc">
                    <strong>Todos with tRPC</strong>
                    <span>Load and add your personal todos with authenticated tRPC calls.</span>
                </Link>
                <Link href="/todo-list-api">
                    <strong>Todos with fetch</strong>
                    <span>Use ordinary HTTP requests with Next.js Route Handlers.</span>
                </Link>
            </div>
            <p>
                This example follows the TanStack Start example, comparing tRPC with Next.js Route
                Handlers. Both implementations use the same auth helper and todo storage. The{" "}
                <Link href="/todo-list-admin">admin page</Link> lists todos grouped by user and lets
                admins delete items. Open your <Link href="/account">account page</Link> from the avatar
                to view your profile and available account actions.
            </p>
            <section aria-labelledby="integration-heading">
                <h2 id="integration-heading">How the integration is set up</h2>
                <ol>
                    <li>
                        <h3>Initialize auth before rendering the app</h3>
                        <p>
                            <a href={`${sourceUrl}/instrumentation-client.ts`}>
                                <code>instrumentation-client.ts</code>
                            </a>{" "}
                            calls <code>oidcEarlyInit()</code> with DPoP. Next.js runs this entry before
                            the application becomes interactive. In{" "}
                            <a href={`${sourceUrl}/app/layout.tsx`}>
                                <code>app/layout.tsx</code>
                            </a>
                            , a single <code>OidcInitializationGate</code> wraps the header, every page,
                            and the session warning. It keeps the UI hidden until initialization and any
                            session restoration finish.
                        </p>
                    </li>
                    <li>
                        <h3>Define the user your app needs</h3>
                        <p>
                            <a href={`${sourceUrl}/lib/oidc.tsx`}>
                                <code>lib/oidc.tsx</code>
                            </a>{" "}
                            uses <code>oidc-spa/react-nextjs</code>. <code>withUser()</code> maps token
                            claims to <code>User_client</code>, the profile returned by{" "}
                            <code>useOidc()</code>: a display name, email, avatar, and admin navigation
                            flag. <code>createUtils()</code> exports the hooks, initialization gate, and
                            login guard used by the UI.
                        </p>
                    </li>
                    <li>
                        <h3>Choose a provider through configuration</h3>
                        <p>
                            Copy{" "}
                            <a href={`${sourceUrl}/.env.local.sample`}>
                                <code>.env.local.sample</code>
                            </a>{" "}
                            to <code>.env.local</code> and choose <code>NEXT_PUBLIC_OIDC_PROVIDER</code>.
                            This example includes Keycloak, Auth0, Microsoft Entra ID, and mock mode.
                            <code> Keycloak2</code> demonstrates token introspection instead of offline
                            JWT validation. The pages and backend handlers stay the same across
                            providers.
                        </p>
                        <p>
                            <code>withRuntimeConfigs()</code> accepts a configuration object or a
                            synchronous or asynchronous getter. The browser configuration lives in{" "}
                            <code>lib/oidc.tsx</code>. This example reads environment variables; you can
                            supply settings from your own configuration source.
                        </p>
                        <p>
                            Server validation is configured separately in{" "}
                            <a href={`${sourceUrl}/lib/server/oidc.ts`}>
                                <code>lib/server/oidc.ts</code>
                            </a>
                            . Next.js embeds <code>NEXT_PUBLIC_*</code> values at build time, so
                            configure them before building and rebuild when those public settings change.
                            Introspection credentials use server-only environment variables.
                        </p>
                        <p className="guide-note">
                            To explore locally without an identity provider, set{" "}
                            <code>NEXT_PUBLIC_OIDC_PROVIDER=mock</code>. The example starts with a
                            signed-in mock admin user. Restart the development server after changing
                            providers.
                        </p>
                    </li>
                    <li>
                        <h3>Protect pages and send authenticated tRPC requests</h3>
                        <p>
                            The{" "}
                            <a href={`${sourceUrl}/app/(protected)/layout.tsx`}>
                                protected route layout
                            </a>{" "}
                            uses <code>withLoginEnforced</code> to require sign-in for the todo, admin,
                            and account pages. The root initialization gate covers all routes, including
                            the public home page. Backend requests are protected independently.
                        </p>
                        <p>
                            <a href={`${sourceUrl}/lib/trpc.ts`}>
                                <code>lib/trpc.ts</code>
                            </a>{" "}
                            obtains an access token with <code>getOidc()</code> and attaches it to tRPC
                            requests as an <code>Authorization: Bearer …</code> header. In{" "}
                            <a href={`${sourceUrl}/lib/server/trpc.ts`}>
                                <code>lib/server/trpc.ts</code>
                            </a>
                            , each handler calls <code>getUser(req)</code> to authenticate the request:
                        </p>
                        <pre>
                            <code>{`list: t.procedure.query(async ({ ctx: { req } }) => {
  const user = await getUser(req);
  return getTodosStore().readTodos({ userId: user.id });
})`}</code>
                        </pre>
                        <p>
                            The list and add procedures scope data to <code>user.id</code>. Todos use the
                            same simple storage model as the TanStack Start example: local JSON files by
                            default, or Upstash Redis when configured.
                        </p>
                    </li>
                    <li>
                        <h3>Use Next.js Route Handlers with fetch</h3>
                        <p>
                            The included backend defines its own user model in{" "}
                            <a href={`${sourceUrl}/lib/server/oidc.ts`}>
                                <code>lib/server/oidc.ts</code>
                            </a>
                            . It validates the access token claims and maps them to{" "}
                            <code>User_server</code>: an <code>id</code> and <code>isAdmin</code>.
                            Server-only modules keep token validation and API credentials out of the
                            browser.
                        </p>
                        <p>
                            The{" "}
                            <a href={`${sourceUrl}/app/(protected)/todo-list-api/page.tsx`}>
                                API todo page
                            </a>{" "}
                            calls <code>getOidc()</code> and attaches the access token to ordinary{" "}
                            <code>fetch()</code> requests. The{" "}
                            <a href={`${sourceUrl}/app/api/todos/route.ts`}>
                                <code>/api/todos</code> Route Handler
                            </a>{" "}
                            exports <code>GET</code> to list your todos and <code>POST</code> to add one.
                            Both handlers authenticate through the same <code>getUser()</code> helper:
                        </p>
                        <pre>
                            <code>{`const user = await getUser(req);
const todos = await getTodosStore().readTodos({ userId: user.id });
return Response.json(todos);`}</code>
                        </pre>
                        <p>
                            The auth helper throws <code>AuthError</code> when authentication fails.
                            Route Handlers turn it into an HTTP error response; the tRPC implementation
                            translates it into a <code>TRPCError</code>. Both todo pages read and update
                            the same data.
                        </p>
                    </li>
                    <li>
                        <h3>Authorize admin operations on the server</h3>
                        <p>
                            The{" "}
                            <a href={`${sourceUrl}/app/(protected)/todo-list-admin/page.tsx`}>
                                admin page
                            </a>{" "}
                            lists todos grouped by user ID and lets admins delete items. Both handlers
                            authenticate the request and check the admin role:
                        </p>
                        <pre>
                            <code>{`listAllUserTodos: t.procedure.query(async ({ ctx: { req } }) => {
  const user = await getUser(req);
  if (!user.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return getTodosStore().readAllTodos();
})`}</code>
                        </pre>
                        <p>
                            The browser uses <code>canSeeAdminNavigation</code> to show the Admin link.
                            The server independently checks <code>user.isAdmin</code> before allowing
                            either operation. The{" "}
                            <a href={`${sourceUrl}/app/(protected)/account/page.tsx`}>account page</a>{" "}
                            displays the mapped profile and offers Keycloak account actions when
                            available.
                        </p>
                    </li>
                </ol>
            </section>
            <footer className="guide-links">
                <a href="https://docs.oidc-spa.dev/">oidc-spa documentation ↗</a>
                <a href="https://github.com/keycloakify/oidc-spa/tree/main/examples/next">
                    Browse the example source ↗
                </a>
            </footer>
        </article>
    );
}
