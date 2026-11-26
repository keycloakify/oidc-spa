type Owner = {
    shouldLoadApp: boolean;
    BASE_URL: string | undefined;
    prModuleCreateOidc: Promise<typeof import("./createOidc")>;
};

const WINDOW_KEY = "__oidc_spa_micro_frontend_owner__";

let owner: Owner | undefined = undefined;

/** Defined when another bundle on the page owns the oidc state and this one delegates to it. */
export function getMicroFrontendOwner_earlyInit() {
    return owner;
}

export function joinMicroFrontendOwner_earlyInit() {
    owner = (window as any)[WINDOW_KEY];
    return owner;
}

export function claimMicroFrontendOwner_earlyInit(params: Owner) {
    (window as any)[WINDOW_KEY] = params;
}
