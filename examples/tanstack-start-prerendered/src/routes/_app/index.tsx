import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
    component: Home
});

const sourceUrl =
    "https://github.com/keycloakify/oidc-spa/blob/main/examples/tanstack-start-prerendered";
const referenceUrl = "https://github.com/keycloakify/oidc-spa/tree/main/examples/tanstack-start";

function Home() {
    return (
        <article className="home-guide">
            <h1>oidc-spa + TanStack Start: prerendered frontend</h1>
            <p className="guide-note">
                <strong>Use /openid-callback/ as the registered redirect URI.</strong> For example,
                register <code>http://app.localhost:3000/openid-callback/</code> for development, or{" "}
                <code>https://your-app.example/openid-callback/</code> for production. The standard SSR
                example uses the application's home URL instead.
            </p>
            <p>
                Include the application's deployment base: with Vite's <code>base: "/dashboard/"</code>,
                an app hosted at <code>https://mycompany.com/dashboard/</code> must register{" "}
                <code>https://mycompany.com/dashboard/openid-callback/</code>. Keep{" "}
                <code>redirectUriPath: "/openid-callback/"</code>; it is relative to Vite's base.
            </p>
            <p>
                This is the same todo app as the <a href={referenceUrl}>reference SSR example</a>, with
                public pages rendered at build time and served as static files through a CDN. Protected
                pages render in the browser; API routes and server functions still run on the backend.
                There is no request-time page rendering in this deployment.
            </p>
            <div className="example-links">
                <Link to="/todo-list-server-function">
                    <strong>Try server functions</strong>
                    <span>Load and add todos with oidcFnMiddleware.</span>
                </Link>
                <Link to="/todo-list-api">
                    <strong>Try API routes</strong>
                    <span>The same todos, using fetchWithAuth and oidcRequestMiddleware.</span>
                </Link>
            </div>
            <p>
                You can also explore <Link to="/todo-list-admin">admin-only access</Link> and your
                <Link to="/account"> account page</Link>. For the user models, provider configuration,
                and backend authorization, follow the{" "}
                <a href={`${referenceUrl}/README.md`}>reference README</a>.
            </p>
            <section aria-labelledby="prerendering-heading">
                <h2 id="prerendering-heading">What changes from the SSR example?</h2>
                <ol>
                    <li>
                        <h3>Enable prerendering and SPA mode</h3>
                        <p>
                            <a href={`${sourceUrl}/vite.config.ts`}>vite.config.ts</a> enables
                            <code> prerender.enabled</code> and <code>spa.enabled</code>. Start emits
                            this home page, the public inactivity page, and a neutral
                            <code> _shell.html</code>. The separate shell mask URL keeps the home page in
                            the prerendered output.
                        </p>
                    </li>
                    <li>
                        <h3>Keep the shell free of application UI</h3>
                        <p>
                            The document lives in <code>__root.tsx</code>; the shared UI and pages move
                            under the pathless <code>_app</code> layout. Start omits this layout from the
                            shell, while prerendered public pages include their header and content.
                        </p>
                    </li>
                    <li>
                        <h3>Make public pages safe to prerender</h3>
                        <p>
                            Public pages should render useful HTML at build time without relying on
                            browser APIs or values specific to a visitor's request. Wrap those parts in{" "}
                            <code>ClientOnly</code> with a suitable fallback, keeping the rest of the
                            page prerendered. For example, the inactivity page's return link depends on
                            the visitor's <code>return_url</code> search parameter, which is unknown
                            during the build, so only that link is rendered on the client.
                        </p>
                    </li>
                    <li>
                        <h3>Configure the callback explicitly</h3>
                        <pre>
                            <code>{`oidcSpa({
  enableRoutingCookie: false,
  redirectUriPath: "/openid-callback/",
  // Keep your security defenses here.
})`}</code>
                        </pre>
                        <p>
                            The routing cookie is unnecessary for a static frontend. Every callback loads
                            the neutral shell, and oidc-spa restores the destination URL before the
                            application loads. You do not create a callback route in the app.
                        </p>
                    </li>
                    <li>
                        <h3>Own the deployment routing</h3>
                        <p>
                            This example targets Vercel.{" "}
                            <a href={`${sourceUrl}/vercel.json`}>vercel.json</a>
                            keeps this app's API and server-function paths on the backend and supplies
                            the ordinary SPA fallback for other frontend URLs. The one extra oidc-spa
                            requirement is an internal rewrite from
                            <code> /openid-callback/</code> to <code>/_shell.html</code>.
                        </p>
                        <p>
                            Another CDN can use the same approach. Add equivalent routing manually and
                            update the backend exclusions when your app's routes change. These deployment
                            rules belong to the application; the oidc-spa plugin does not patch the CDN
                            configuration.
                        </p>
                    </li>
                </ol>
            </section>
            <footer className="guide-links">
                <a href={`${sourceUrl}/README.md`}>Read the prerendered deployment guide ↗</a>
                <a href={referenceUrl}>Compare with the SSR example ↗</a>
            </footer>
        </article>
    );
}
