import { addOrUpdateSearchParam } from "../tools/urlSearchParams";

export type AuthResponse = {
    state: string;
    [key: string]: string | undefined;
};

export function authResponseToUrl(authResponse: AuthResponse): string {
    let authResponseUrl = "https://dummy.com";

    for (const [name, value] of Object.entries(authResponse)) {
        if (value === undefined) {
            continue;
        }
        authResponseUrl = addOrUpdateSearchParam({
            url: authResponseUrl,
            name,
            value,
            encodeMethod: "www-form"
        });
    }

    return authResponseUrl;
}
