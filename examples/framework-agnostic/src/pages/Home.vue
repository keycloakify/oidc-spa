<script setup lang="ts">
import { RouterLink } from "vue-router";

const sourceUrl = "https://github.com/keycloakify/oidc-spa/blob/main/examples/framework-agnostic";
</script>

<template>
    <article class="home-guide">
        <h1>oidc-spa + Vue</h1>
        <p>
            A minimal todo app showing OpenID Connect across the stack. Vue Router and Vite run the SPA;
            Express hosts a REST API and tRPC. Both APIs authenticate access tokens and use the same todo
            store.
        </p>
        <p class="guide-note">
            This example uses <code>oidc-spa/framework-agnostic</code>. The Vue integration lives in this
            app's <code>src/oidc.ts</code>, showing how to connect a framework to the adapter.
        </p>
        <div class="example-links">
            <RouterLink to="/todo-list-trpc">
                <strong>Todo List · tRPC</strong>
                <span>Load and add your personal todos with a typed API client.</span>
            </RouterLink>
            <RouterLink to="/todo-list-api">
                <strong>Todo List · API</strong>
                <span>The same todos, using fetch and ordinary Express handlers.</span>
            </RouterLink>
        </div>
        <p>
            The <RouterLink to="/todo-list-admin">admin page</RouterLink> groups todos by user and lets
            admins delete items. Open your <RouterLink to="/account">account page</RouterLink>
            from the avatar to view your profile and available Keycloak account actions.
        </p>
        <section aria-labelledby="integration-heading">
            <h2 id="integration-heading">How the integration is set up</h2>
            <ol>
                <li>
                    <h3>Initialize authentication before loading the app</h3>
                    <p>
                        <a :href="`${sourceUrl}/vite.config.ts`"><code>vite.config.ts</code></a>
                        registers the oidc-spa Vite plugin with browser runtime protection and DPoP. It
                        handles early initialization and skips loading the app in the authentication
                        callback iframe. <code>src/main.ts</code> awaits <code>initializeOidc()</code>
                        before installing the router and mounting Vue.
                    </p>
                </li>
                <li>
                    <h3>Connect the framework-agnostic client to Vue</h3>
                    <p>
                        <a :href="`${sourceUrl}/src/oidc.ts`"><code>src/oidc.ts</code></a>
                        uses <code>withUser()</code> to map token claims to a display name, email,
                        avatar, and admin navigation flag. <code>createUtils()</code> only returns
                        <code>getOidc()</code>. The local wrapper subscribes to user and auto-logout
                        changes and exposes readonly Vue refs through <code>useOidc()</code>. Refresh
                        your profile on the account page to recompute the user.
                    </p>
                    <pre><code>const { oidc, user, autoLogoutState } = useOidc();</code></pre>
                </li>
                <li>
                    <h3>Choose a provider through configuration</h3>
                    <p>
                        Edit <code>.env</code> and choose <code>VITE_OIDC_PROVIDER</code>: Keycloak,
                        Auth0, Microsoft Entra ID, or mock mode. <code>Keycloak2</code>
                        demonstrates token introspection instead of offline JWT validation. Mock mode
                        starts with a signed-in admin and requires no identity provider.
                    </p>
                    <p>
                        Vite embeds <code>VITE_*</code> settings at build time. Restart development or
                        rebuild after changing them. <code>server/oidc.ts</code> independently configures
                        token validation using <code>process.env</code>. Introspection secrets and KV
                        credentials have no public prefix.
                    </p>
                </li>
                <li>
                    <h3>Protect pages with Vue Router</h3>
                    <p>
                        <code>src/router.ts</code> groups protected pages under a shared layout with
                        <code>meta.requiresAuth</code>. Its navigation guard calls the local
                        <code>enforceLogin()</code> helper with the destination URL before a protected
                        page mounts. The layout displays the inactivity warning; home and inactivity
                        logout remain public.
                    </p>
                    <pre><code>router.beforeEach(async to =&gt; {
    if (to.meta.requiresAuth) {
        await enforceLogin(router.resolve(to).href);
    }
});</code></pre>
                </li>
                <li>
                    <h3>Authenticate both API implementations</h3>
                    <p>
                        The tRPC client attaches an access token to <code>/api/trpc</code> requests. The
                        REST page uses <code>fetchWithAuth()</code> for <code>/api/todos</code>. Every
                        backend operation validates authentication, personal todos are scoped to the user
                        ID, and admin procedures also check the admin role. Hiding the Admin link is only
                        a UI convenience. DPoP is handled by oidc-spa's early initialization.
                    </p>
                    <pre><code>const response = await fetchWithAuth("/api/todos");</code></pre>
                </li>
                <li>
                    <h3>Resume after inactivity logout</h3>
                    <p>
                        <code>autoLogout_returnToUrl</code> sends expired sessions to the public
                        <code>/inactivity-logout</code> page with the previous URL in
                        <code>return_url</code>. The resume link returns to that page, where the login
                        guard handles sign-in. Resume URLs must point to the same origin.
                    </p>
                </li>
            </ol>
        </section>
        <footer class="guide-links">
            <a href="https://docs.oidc-spa.dev/">oidc-spa documentation ↗</a>
            <a :href="sourceUrl">Browse the example source ↗</a>
        </footer>
    </article>
</template>
