import { useEffect, useState } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { fetchWithAuth, enforceLogin } from "src/oidc";
import { enableUnifiedClientRetryForSsrLoaders } from "oidc-spa/react-tanstack-start/rfcUnifiedClientRetryForSsrLoaders";

function getNames() {
    return fetchWithAuth("/demo/api/names").then(res => res.json());
}

export const Route = createFileRoute("/demo/start/api-request")(
    enableUnifiedClientRetryForSsrLoaders({
        beforeLoad: enforceLogin,
        pendingComponent: () => (
            <div
                className="flex items-center justify-center min-h-screen p-4 text-white"
                style={{
                    backgroundColor: "#000",
                    backgroundImage:
                        "radial-gradient(ellipse 60% 60% at 0% 100%, #444 0%, #222 60%, #000 100%)"
                }}
            />
        ),
        component: Home
    })
);

/*

export const Route = createFileRoute("/demo/start/api-request")({
    beforeLoad: enforceLogin,
    component: Home,
    errorComponent: ({ error }) => {
        const isClientOnlySentinel = error.message === "__OIDC-SPA_REQUIRE_CLIENT_SENTINEL__";

        const router = useRouter();

        useEffect(() => {
            if (!isClientOnlySentinel) {
                return;
            }

            router.invalidate();
        }, []);

        return Route.options.pendingComponent?.({}) ?? null;
    },
    pendingComponent: () => (
        <div
            className="flex items-center justify-center min-h-screen p-4 text-white"
            style={{
                backgroundColor: "#000",
                backgroundImage:
                    "radial-gradient(ellipse 60% 60% at 0% 100%, #444 0%, #222 60%, #000 100%)"
            }}
        />
    )
});
*/

function Home() {
    const [names, setNames] = useState<Array<string>>([]);

    useEffect(() => {
        getNames().then(setNames);
    }, []);

    return (
        <div
            className="flex items-center justify-center min-h-screen p-4 text-white"
            style={{
                backgroundColor: "#000",
                backgroundImage:
                    "radial-gradient(ellipse 60% 60% at 0% 100%, #444 0%, #222 60%, #000 100%)"
            }}
        >
            <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10 opacity-0 animate-[fadeIn_0.2s_ease-in_forwards]">
                <h1 className="text-2xl mb-4">Start API Request Demo - Names List</h1>
                <ul className="mb-4 space-y-2">
                    {names.map(name => (
                        <li
                            key={name}
                            className="bg-white/10 border border-white/20 rounded-lg p-3 backdrop-blur-sm shadow-md"
                        >
                            <span className="text-lg text-white">{name}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
