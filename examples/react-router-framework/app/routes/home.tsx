import { Link } from "react-router";

const sourceUrl = "https://github.com/keycloakify/oidc-spa/blob/main/examples/react-router-framework";

export default function HomePage() {
    return (
        <article className="home-guide">
            <h1>oidc-spa + React Router</h1>
            <p>
                A minimal todo app showing OpenID Connect across the stack. The browser handles sign-in;
                the Express backend validates access tokens and gives handlers a typed user.
            </p>
            <p>
                React Router runs in framework mode with <code>ssr: false</code>. The whole UI waits for
                authentication to initialize. Protected pages load their data in browser-side loaders,
                and mutations use client actions with automatic data revalidation.
            </p>
            <div className="example-links">
                <Link to="/todo-list-trpc">
                    <strong>Todos with tRPC</strong>
                    <span>Load and add your personal todos with authenticated, typed tRPC calls.</span>
                </Link>
                <Link to="/todo-list-api">
                    <strong>Todos with fetch</strong>
                    <span>Use ordinary HTTP requests with Express route handlers.</span>
                </Link>
            </div>
            <p>
                Both implementations use the same authentication helper and todo storage. The{" "}
                <Link to="/todo-list-admin">admin page</Link> groups todos by user and lets admins delete
                items. Open your <Link to="/account">account page</Link> from the avatar to view your
                profile and available account actions.
            </p>
            <section aria-labelledby="integration-heading">
                <h2 id="integration-heading">How the integration is set up</h2>
                <ol>
                    <li>
                        <h3>Initialize authentication before rendering</h3>
                        <p>
                            <a href={`${sourceUrl}/vite.config.ts`}>
                                <code>vite.config.ts</code>
                            </a>{" "}
                            registers the oidc-spa Vite plugin with browser runtime protection and DPoP.
                            The plugin installs early initialization before application code runs. In{" "}
                            <code>app/root.tsx</code>, one <code>OidcInitializationGate</code> wraps the
                            header, pages, and session warning. <code>HydrateFallback</code> returns
                            <code> null</code>, keeping the UI hidden until authentication is ready.
                        </p>
                    </li>
                    <li>
                        <h3>Define the user your application needs</h3>
                        <p>
                            <a href={`${sourceUrl}/app/oidc.ts`}>
                                <code>app/oidc.ts</code>
                            </a>{" "}
                            uses <code>oidc-spa/react-spa</code>. <code>withUser()</code> maps token
                            claims to a display name, email, avatar, and admin navigation flag.
                            Components receive that model through <code>useOidc()</code>.
                        </p>
                    </li>
                    <li>
                        <h3>Choose a provider through configuration</h3>
                        <p>
                            Installation copies <code>.env.sample</code> to <code>.env</code> if it does
                            not exist. Choose <code>VITE_OIDC_PROVIDER</code>: Keycloak, Auth0, Microsoft
                            Entra ID, or mock mode. <code>Keycloak2</code> demonstrates introspection
                            instead of offline JWT validation.
                        </p>
                        <p>
                            Browser authentication in <code>app/oidc.ts</code> and API validation in{" "}
                            <a href={`${sourceUrl}/server/oidc.ts`}>
                                <code>server/oidc.ts</code>
                            </a>{" "}
                            are configured independently. <code>withRuntimeConfigs()</code> accepts a
                            configuration object or a synchronous or asynchronous getter; environment
                            variables are simply this example's configuration source.
                        </p>
                        <p>
                            Vite embeds <code>VITE_*</code> settings in the browser build. Restart
                            development or rebuild after changing them. Introspection secrets and KV
                            credentials have no public prefix and stay on the server. Your existing API
                            can use its own token validation implementation.
                        </p>
                        <p className="guide-note">
                            To explore without an identity provider, set{" "}
                            <code>VITE_OIDC_PROVIDER=mock</code>. The example starts with a signed-in
                            mock admin user.
                        </p>
                    </li>
                    <li>
                        <h3>Protect routes with client loaders</h3>
                        <p>
                            Todo, admin, and account routes call <code>enforceLogin(args)</code> from
                            their <code>clientLoader</code>. Loaders run before page components render.
                            The tRPC todo route then loads its data:
                        </p>
                        <pre>
                            <code>{`export async function clientLoader(args: Route.ClientLoaderArgs) {
  await enforceLogin(args);
  return { todos: await trpc.todos.list.query() };
}`}</code>
                        </pre>
                        <p>
                            <code>app/trpc.ts</code> obtains an access token through{" "}
                            <code>getOidc()</code> and attaches it to requests. Each backend procedure
                            calls <code>getUser(req)</code> to authenticate independently:
                        </p>
                        <pre>
                            <code>{`list: t.procedure.query(async ({ ctx: { req } }) => {
  const user = await getUser(req);
  return getTodosStore().readTodos({ userId: user.id });
})`}</code>
                        </pre>
                    </li>
                    <li>
                        <h3>Use Express with ordinary fetch requests</h3>
                        <p>
                            The API todo route attaches the access token to <code>fetch()</code>
                            requests. In{" "}
                            <a href={`${sourceUrl}/server/api.ts`}>
                                <code>server/api.ts</code>
                            </a>
                            , Express handles <code>GET /api/todos</code> and{" "}
                            <code>POST /api/todos</code>. These handlers share the same auth helper and
                            data store as tRPC:
                        </p>
                        <pre>
                            <code>{`api.get("/todos", async (req, res) => {
  const user = await getUser(req);
  res.json(await getTodosStore().readTodos({ userId: user.id }));
});`}</code>
                        </pre>
                        <p>
                            Both pages submit through a <code>clientAction</code>. React Router reruns
                            the loader after a successful mutation to refresh the list. Authentication
                            errors become HTTP errors in Express and tRPC errors in the procedures.
                        </p>
                    </li>
                    <li>
                        <h3>Enforce authorization on the server</h3>
                        <p>
                            The admin loader checks <code>canSeeAdminNavigation</code> and displays an
                            access-denied page for non-admins. The list-all and delete procedures
                            independently check <code>user.isAdmin</code>. Personal todo operations scope
                            data to the authenticated <code>user.id</code>.
                        </p>
                        <p>
                            Todos use the same storage implementation as the Next.js example: JSON files
                            locally, or Upstash Redis when configured. On Vercel, configure Upstash so
                            the API has persistent storage.
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
