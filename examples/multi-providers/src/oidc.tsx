/* eslint-disable react-refresh/only-export-components */
import { createReactOidc, type OidcReact } from "oidc-spa/react";
import type { Oidc } from "oidc-spa";
import { z } from "zod";
import { Evt } from "evt";
import { useRerenderOnStateChange } from "evt/hooks";
import Dialog from "@mui/material/Dialog";

const decodedIdTokenSchema = z.object({
    sub: z.string(),
    name: z.string()
});

type DecodedIdToken = z.infer<typeof decodedIdTokenSchema>;

const homeUrl = import.meta.env.BASE_URL;

const google = createReactOidc({
    issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI_GOOGLE,
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID_GOOGLE,
    __unsafe_clientSecret: import.meta.env.VITE_OIDC_CLIENT_SECRET_GOOGLE,
    __unsafe_useIdTokenAsAccessToken: true,
    scopes: import.meta.env.VITE_OIDC_SCOPE_GOOGLE.split(" "),
    homeUrl,
    decodedIdTokenSchema,
    debugLogs: true
});

const microsoft = createReactOidc({
    issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI_MICROSOFT,
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID_MICROSOFT,
    scopes: import.meta.env.VITE_OIDC_SCOPE_MICROSOFT.split(" "),
    homeUrl,
    decodedIdTokenSchema,
    debugLogs: true
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

export function OidcProvider(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    const { fallback, children } = props;

    return (
        <>
            <google.OidcProvider fallback={fallback}>
                <microsoft.OidcProvider fallback={fallback}>{children}</microsoft.OidcProvider>
            </google.OidcProvider>
            <SelectProviderDialog />
        </>
    );
}

export function useIsUserLoggedIn(): boolean {
    const { isUserLoggedIn: isUserLoggedIn_google } = google.useOidc();
    const { isUserLoggedIn: isUserLoggedIn_microsoft } = microsoft.useOidc();

    return isUserLoggedIn_google || isUserLoggedIn_microsoft;
}

export function useOidc_assertUserLoggedIn(): OidcReact.LoggedIn<DecodedIdToken> & {
    provider: "google" | "microsoft";
} {
    const oidcReact_google = google.useOidc();
    const oidcReact_microsoft = microsoft.useOidc();

    if (oidcReact_google.isUserLoggedIn) {
        return { ...oidcReact_google, provider: "google" };
    }

    if (oidcReact_microsoft.isUserLoggedIn) {
        return { ...oidcReact_microsoft, provider: "microsoft" };
    }

    throw new Error("Assertion error, user is not logged in");
}

export function useOidc_assertUserNotLoggedIn(): {
    microsoft: OidcReact.NotLoggedIn;
    google: OidcReact.NotLoggedIn;
} {
    const oidcReact_google = google.useOidc({ assert: "user not logged in" });
    const oidcReact_microsoft = microsoft.useOidc({ assert: "user not logged in" });

    return {
        google: oidcReact_google,
        microsoft: oidcReact_microsoft
    };
}

type Provider = "google" | "microsoft";

const evtProviderSelected = Evt.create<Provider | undefined>();

const evtIsModalOpen = Evt.create(false);

export function askUserToSelectProvider(): Promise<Provider | undefined> {
    evtIsModalOpen.state = true;

    return evtProviderSelected.waitFor();
}

evtProviderSelected.attach(provider => {
    if (provider === undefined) {
        evtIsModalOpen.state = false;
    }
});

function SelectProviderDialog() {
    useRerenderOnStateChange(evtIsModalOpen);

    return (
        <Dialog open={evtIsModalOpen.state} onClose={() => evtProviderSelected.post(undefined)}>
            <div style={{ padding: "1rem" }}>
                <h3>Login with</h3>
                <button onClick={() => evtProviderSelected.post("google")}>Google</button>
                &nbsp;
                <button onClick={() => evtProviderSelected.post("microsoft")}>Microsoft</button>
            </div>
        </Dialog>
    );
}

export async function beforeLoad_protectedRoute(params: { cause: "preload" | string }) {
    const { cause } = params;

    const oidc = await getOidc();

    if (oidc.isUserLoggedIn) {
        return;
    }

    if (cause === "preload") {
        throw new Error(
            "oidc-spa: User is not yet logged in. This is an expected error, nothing to be addressed."
        );
    }

    const provider = await askUserToSelectProvider();

    if (provider === undefined) {
        history.back();
        return;
    }

    await oidc[provider].login({
        doesCurrentHrefRequiresAuth: true
    });
}
