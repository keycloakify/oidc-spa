/*
import { oidcSpaApiBuilder } from "./apiBuilder";
export type * from "./types";

export const oidcSpa = oidcSpaApiBuilder;
*/

import { createServerFn } from "@tanstack/react-start";

const getServerTime = createServerFn().handler(async () => {
    // This runs only on the server

    const { createOidcBackend } = await import("../../backend");

    console.log(createOidcBackend);

    return new Date().toISOString();
});

const isBrowser =
    typeof window !== "undefined" &&
    typeof window.document !== "undefined" &&
    typeof navigator !== "undefined";

if (isBrowser) {
    getServerTime().then(serverTime => {
        console.log("======== from module", serverTime);
    });
}

export function coucou() {
    console.log("coucou from module");
}
