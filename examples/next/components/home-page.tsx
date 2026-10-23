import Link from "next/link";

const sourceUrl = "https://github.com/keycloakify/oidc-spa/blob/main/examples/next";

export function HomePage() {
    return (
        <article className="home-guide">
            <h1>oidc-spa + Next.js</h1>
            <p>
                A minimal todo app showing OpenID Connect across the stack. The browser handles sign-in;
                the tRPC API validates access tokens and gives your procedures a typed user.
            </p>
            <p>
                Next.js serves as a SPA framework here, with the frontend and backend in one project. The
                whole UI waits for browser auth to initialize. Server-rendered pages do not have access
                to the browser session; authenticated data comes from tRPC requests.
            </p>
            <div className="example-links">
                <Link href="/todo-list">
                    <strong>Try the todo list</strong>
                    <span>Load and add your personal todos with authenticated tRPC calls.</span>
                </Link>
                <Link href="/todo-list-admin">
                    <strong>Explore admin access</strong>
                    <span>View todos grouped by user and delete items. Requires the admin role.</span>
                </Link>
            </div>
            <p>
                This example follows the TanStack Start example, using tRPC for backend requests. Open
                your <Link href="/account">account page</Link> from the avatar to view your profile and
                available account actions.
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
                            claims to the profile returned by <code>useOidc()</code>: a display name,
                            email, avatar, and admin navigation flag. <code>createUtils()</code> exports
                            the hooks, initialization gate, and login guard used by the UI.
                        </p>
                        <p>
                            On the backend,{" "}
                            <a href={`${sourceUrl}/lib/server/auth.ts`}>
                                <code>lib/server/auth.ts</code>
                            </a>{" "}
                            uses <code>oidc-spa/server</code> to validate access tokens and map their
                            claims to <code>User_server</code>: an <code>id</code> and{" "}
                            <code>isAdmin</code>. Server-only modules keep token validation and API
                            credentials out of the browser.
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
                            JWT validation. The pages and tRPC procedures stay the same across providers.
                        </p>
                        <p>
                            The browser settings live in <code>withRuntimeConfigs()</code>; server
                            validation is configured separately in <code>lib/server/auth.ts</code>.
                            Next.js embeds <code>NEXT_PUBLIC_*</code> values at build time, so configure
                            them before building and rebuild when those public settings change.
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
                        <h3>Protect pages and tRPC procedures</h3>
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
                            , each handler calls <code>getUser(ctx)</code> to authenticate the request:
                        </p>
                        <pre>
                            <code>{`list: t.procedure.query(async ({ ctx }) => {
  const user = await getUser(ctx);
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
                        <h3>Authorize admin operations on the server</h3>
                        <p>
                            The <a href={`${sourceUrl}/components/todo-list-admin.tsx`}>admin page</a>{" "}
                            lists todos grouped by user ID and lets admins delete items. Both handlers
                            authenticate the request and check the admin role:
                        </p>
                        <pre>
                            <code>{`listAllUserTodos: t.procedure.query(async ({ ctx }) => {
  const user = await getUser(ctx);
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
                            <a href={`${sourceUrl}/components/account-page.tsx`}>account page</a>{" "}
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
