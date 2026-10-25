import type { Config } from "@react-router/dev/config";

export default {
    // This oidc-spa integration supports "unstable_api-only" or false.
    // API-only keeps native server loaders/actions while rendering the UI in the browser.
    // To use ssr: false with your own backend instead:
    // - Delete app/entry.client.tsx, app/oidc.server.ts, app/.server/, and api/.
    // - Remove server loader/action exports and their server-only imports from routes.
    //   export async function action({ request }: Route.ActionArgs) will no longer work.
    // - Keep enforceLogin(args) in clientLoader/clientAction, but replace
    //   args.serverLoader()/args.serverAction() with authenticated fetch calls to your API.
    // - Remove api-only-dev-shell from vite.config.ts and the Vercel function rewrites.
    //   Deploy build/client as a static SPA.
    // ssr: true is not supported by this integration: authentication initializes in the browser.
    ssr: "unstable_api-only"
} satisfies Config;
