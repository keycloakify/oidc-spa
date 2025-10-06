import { Evt } from "evt";
import type { Oidc } from "oidc-spa";
import { createSvelteOidc, type OidcSvelte } from "oidc-spa/svelte";
import { z } from "zod";

const decodedIdTokenSchema = z.object({
    sub: z.string(),
    name: z.string()
});

type DecodedIdToken = z.infer<typeof decodedIdTokenSchema>;

const autoLogin = false;
const homeUrl = import.meta.env.BASE_URL;

const google = createSvelteOidc({
    issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI_GOOGLE,
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID_GOOGLE,
    __unsafe_clientSecret: import.meta.env.VITE_OIDC_CLIENT_SECRET_GOOGLE,
    __unsafe_useIdTokenAsAccessToken: true,
    scopes: import.meta.env.VITE_OIDC_SCOPE_GOOGLE.split(" "),
    homeUrl,
    decodedIdTokenSchema,
    debugLogs: true,
    autoLogin
});

const microsoft = createSvelteOidc({
    issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI_MICROSOFT,
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID_MICROSOFT,
    scopes: import.meta.env.VITE_OIDC_SCOPE_MICROSOFT.split(" "),
    homeUrl,
    decodedIdTokenSchema,
    debugLogs: true,
    autoLogin
});

export async function getOidc(): Promise<
    | Oidc.LoggedIn<DecodedIdToken>
    | { isUserLoggedIn: false; google: Oidc.NotLoggedIn; microsoft: Oidc.NotLoggedIn }
> {
    const oidc_google = await google.getOidc();

    if (oidc_google.isUserLoggedIn) {
        return oidc_google;
    }

    const oidc_microsoft = await microsoft.getOidc();

    if (oidc_microsoft.isUserLoggedIn) {
        return oidc_microsoft;
    }

    return {
        isUserLoggedIn: false,
        google: oidc_google,
        microsoft: oidc_microsoft
    };
}

export function initializeOidc() {
    const googleInitializer = google.initializeOidc();
    const microsoftInitializer = microsoft.initializeOidc();
    return {
        google: {
            ...googleInitializer,
            OidcContextProvider: google.OidcContextProvider
        },
        microsoft: {
            ...microsoftInitializer,
            OidcContextProvider: microsoft.OidcContextProvider
        }
    };
}

export function useIsUserLoggedIn(): boolean {
    const { isUserLoggedIn: isUserLoggedIn_google } = google.useOidc();
    const { isUserLoggedIn: isUserLoggedIn_microsoft } = microsoft.useOidc();

    return isUserLoggedIn_google || isUserLoggedIn_microsoft;
}

export function useOidc_assertUserLoggedIn(): OidcSvelte.LoggedIn<DecodedIdToken> & {
    provider: "google" | "microsoft";
} {
    const oidcSvelte_google = google.useOidc();
    const oidcSvelte_microsoft = microsoft.useOidc();

    if (oidcSvelte_google.isUserLoggedIn) {
        return { ...oidcSvelte_google, provider: "google" };
    }

    if (oidcSvelte_microsoft.isUserLoggedIn) {
        return { ...oidcSvelte_microsoft, provider: "microsoft" };
    }

    throw new Error("Assertion error, user is not logged in");
}

export function useOidc_assertUserNotLoggedIn(): {
    microsoft: OidcSvelte.NotLoggedIn;
    google: OidcSvelte.NotLoggedIn;
} {
    const oidcSvelte_google = google.useOidc({ assert: "user not logged in" });
    const oidcSvelte_microsoft = microsoft.useOidc({ assert: "user not logged in" });

    return {
        google: oidcSvelte_google,
        microsoft: oidcSvelte_microsoft
    };
}

export type Provider = "google" | "microsoft";

export const evtProviderSelected = Evt.create<Provider | undefined>();

export const evtIsModalOpen = Evt.create(false);

export function askUserToSelectProvider(): Promise<Provider | undefined> {
    evtIsModalOpen.state = true;

    return evtProviderSelected.waitFor();
}

evtProviderSelected.attach(provider => {
    if (provider === undefined) {
        evtIsModalOpen.state = false;
    }
});

export async function beforeLoad_protectedRoute(params: {
    cause: "preload" | string;
}): Promise<boolean> {
    const { cause } = params;

    const oidc = await getOidc();

    if (oidc.isUserLoggedIn) {
        return true;
    }

    if (cause === "preload") {
        throw new Error(
            "oidc-spa: User is not yet logged in. This is an expected error, nothing to be addressed."
        );
    }

    const provider = await askUserToSelectProvider();

    if (provider === undefined) {
        history.back();
        return false;
    }
    await oidc[provider].login({
        doesCurrentHrefRequiresAuth: true
    });
    return true;
}
