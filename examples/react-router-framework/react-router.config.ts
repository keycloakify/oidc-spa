import type { Config } from "@react-router/dev/config";

export default {
    // This oidc-spa integration supports "unstable_api-only" or false.
    // API-only keeps the UI static and native loaders/actions on the server.
    // The oidc-spa plugin adds resource routing to the generated server build.
    // To use ssr: false with your own backend instead:
    // - Delete app/entry.client.tsx, app/.server/, and api/.
    // - Remove the resource route files.
    // - Remove server loader/action exports and their server-only imports from routes.
    //   export async function action({ request }: Route.ActionArgs) will no longer work.
    // - Keep the protected layout's clientMiddleware, but replace
    //   args.serverLoader()/args.serverAction() with authenticated fetch calls to your API.
    // - Remove the Vercel function rewrites.
    //   Deploy build/client as a static SPA.
    // ssr: true is not supported by this integration: authentication initializes in the browser.
    ssr: "unstable_api-only",
    async prerender() {
        return ["/", "/inactivity-logout"];
    }
} satisfies Config;
